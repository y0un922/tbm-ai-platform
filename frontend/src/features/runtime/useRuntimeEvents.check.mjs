// Run: node src/features/runtime/useRuntimeEvents.check.mjs
// A deterministic hook/effect harness: no DOM or additional test dependencies.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

let current
const sameDeps = (a, b) => a?.length === b.length && a.every((v, i) => Object.is(v, b[i]))
const hooks = {
  useState(initial) {
    const owner = current
    const index = owner.cursor++
    const slot = owner.slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
    return [slot.value, (update) => {
      const value = typeof update === 'function' ? update(slot.value) : update
      if (!Object.is(value, slot.value)) { slot.value = value; owner.dirty = true }
    }]
  },
  useMemo(factory, deps) {
    const index = current.cursor++
    let slot = current.slots[index]
    if (!slot || !sameDeps(slot.deps, deps)) slot = current.slots[index] = { deps, value: factory() }
    return slot.value
  },
  useRef(value) { return hooks.useMemo(() => ({ current: value }), []) },
  useEffect(setup, deps) {
    const index = current.cursor++
    const slot = current.slots[index] ??= {}
    if (!sameDeps(slot.deps, deps)) {
      slot.deps = deps
      slot.setup = setup
      current.pending.add(slot)
    }
  },
}
function mount(renderHook) {
  return {
    slots: [], pending: new Set(), cursor: 0, dirty: false,
    render() {
      for (let i = 0; i < 25; i++) {
        this.cursor = 0
        this.dirty = false
        current = this
        this.value = renderHook()
        if (!this.dirty) return this.value
      }
      throw new Error('render loop')
    },
    flush() {
      for (let i = 0; i < 25; i++) {
        const pending = [...this.pending]
        this.pending.clear()
        pending.forEach((slot) => slot.cleanup?.())
        pending.forEach((slot) => { slot.cleanup = slot.setup() })
        this.render()
        if (!this.pending.size && !this.dirty) return this.value
      }
      throw new Error('effect loop')
    },
    unmount() { this.slots.forEach((slot) => slot.cleanup?.()) },
  }
}

const subscriptions = []
const history = new Map()
const subscribeRunEvents = (runId, event, error) => {
  const subscription = { runId, event, error, closed: false }
  subscriptions.push(subscription)
  for (const item of history.get(runId) ?? []) event(item) // Mock backend delivers history synchronously.
  return () => { subscription.closed = true }
}
const timers = new Map()
const intervals = new Map()
let timerId = 0
const window = {
  setTimeout(callback) { timers.set(++timerId, callback); return timerId },
  clearTimeout(id) { timers.delete(id) },
  setInterval(callback) { intervals.set(++timerId, callback); return timerId },
  clearInterval(id) { intervals.delete(id) },
}
function tick() {
  const [id, callback] = timers.entries().next().value
  timers.delete(id)
  callback()
}

// Execute the real hook and reducer source, replacing only React and external I/O.
const modules = new Map()
function load(id) {
  if (id === 'react') return hooks
  if (id === '@/api/runs') return { subscribeRunEvents }
  if (id === '@/hooks/useProject') return { usePrefersReducedMotion: () => false }
  if (modules.has(id)) return modules.get(id)
  assert.ok(id.startsWith('@/'), `unexpected import: ${id}`)
  const source = readFileSync(new URL(`../../${id.slice(2)}.ts`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'window', outputText)(load, module, module.exports, window)
  modules.set(id, module.exports)
  return module.exports
}
const { useRunGraph, useReplay } = load('@/features/runtime/useRuntimeEvents')
const event = (runId, id, seconds = 0) => ({ runId, id, type: 'trigger.fired', timestamp: new Date(seconds * 1000).toISOString(), data: { name: id } })
const aEvents = [event('A', 'a1'), event('A', 'a2', 1), event('A', 'a3', 2)]
const bEvents = [event('B', 'b1'), event('B', 'b2', 1)]
history.set('A', [aEvents[2], aEvents[0], aEvents[1], aEvents[0]])
history.set('B', bEvents)
let runId = 'A'
const graph = mount(() => useRunGraph(runId, {}))
const empty = (value) => {
  assert.deepEqual(value.allEvents, [])
  assert.deepEqual(value.events, [])
  assert.deepEqual(value.model, { nodes: [], edges: [] })
  assert.equal(value.liveMessage, '')
  assert.equal(value.error, null)
  assert.equal(value.replaying, false)
}
empty(graph.render())
graph.flush()
assert.deepEqual(graph.value.allEvents, aEvents, 'synchronous history is sorted and deduplicated')
const firstA = subscriptions.at(-1)
firstA.event(event('B', 'wrong-stream'))
firstA.error(new Error('A failed'))
graph.render()
assert.deepEqual(graph.value.allEvents, aEvents, 'reject mismatched event.runId')
assert.equal(graph.value.error, 'A failed')
firstA.event(aEvents[0])
graph.render()
assert.equal(graph.value.error, null, 'a valid reconnect event clears the stale connection error')
graph.value.replay()
assert.deepEqual(graph.render().events, [], 'replay starts at zero before effects')
graph.flush()
tick()
assert.equal(graph.render().events.length, 1)
const oldStep = [...timers.values()][0]

runId = 'B'
empty(graph.render()) // Crucially checked BEFORE cleanup/setup effects.
assert.equal(firstA.closed, false)
firstA.event(event('A', 'late-before-cleanup'))
firstA.error(new Error('late error before cleanup'))
tick()
empty(graph.render())
graph.flush()
assert.ok(firstA.closed)
assert.deepEqual(graph.value.events, bEvents, 'new run follows live, not the old replay count')
firstA.event(event('A', 'late-after-cleanup'))
firstA.error(new Error('late error after cleanup'))
oldStep()
graph.render()
assert.deepEqual(graph.value.events, bEvents)
assert.equal(graph.value.error, null)
assert.equal(timers.size, 0, 'old replay timer is cancelled')

graph.value.replay()
assert.deepEqual(graph.render().events, [], 'B replay does not reuse A count')
graph.flush()
tick()
assert.equal(graph.render().events.length, 1)
graph.value.followLive()
assert.deepEqual(graph.render().events, bEvents)
graph.flush()
graph.value.replay()
assert.deepEqual(graph.render().events, [], 'reused token starts a new replay')
graph.flush()
tick()
graph.render()
graph.value.setSpeed(16)
assert.deepEqual(graph.render().events, [], 'speed restart does not expose stale count')
graph.flush()

for (const noRun of [undefined, '']) {
  runId = noRun
  empty(graph.render())
  const previousSubscription = subscriptions.at(-1)
  previousSubscription.event(event(previousSubscription.runId, 'late-empty'))
  previousSubscription.error(new Error('late empty error'))
  empty(graph.render())
  const subscriptionCount = subscriptions.length
  graph.flush()
  empty(graph.value)
  assert.equal(subscriptions.length, subscriptionCount, 'empty run must not subscribe')
  assert.equal(timers.size, 0)
  runId = 'A'
  empty(graph.render())
  graph.flush()
  firstA.event(event('A', 'obsolete-A-generation'))
  firstA.error(new Error('obsolete A error'))
  graph.render()
  assert.deepEqual(graph.value.events, aEvents, 'A → empty → A ignores the original subscription')
  assert.equal(graph.value.error, null)
  graph.value.replay()
  assert.deepEqual(graph.render().events, [])
  graph.flush()
  tick()
  graph.render()
}

// React StrictMode's setup → cleanup → setup cycle must reject the first subscription.
const currentSubscription = subscriptions.at(-1)
for (const slot of graph.slots) if (slot.setup) { slot.cleanup?.(); graph.pending.add(slot) }
graph.flush()
currentSubscription.event(event('A', 'strict-stale'))
currentSubscription.error(new Error('strict stale error'))
graph.render()
assert.deepEqual(graph.value.allEvents, aEvents)
assert.equal(graph.value.error, null)
const unmountedSubscription = subscriptions.at(-1)
unmountedSubscription.event(event('A', 'z-decision', 3))
unmountedSubscription.event(event('A', 'a-next-stage', 3))
graph.render()
assert.deepEqual(graph.value.allEvents.slice(-2).map((item) => item.id), ['z-decision', 'a-next-stage'], 'same-millisecond events preserve stream order, not random UUID order')
const unmountedStep = [...timers.values()][0]
graph.unmount()
unmountedSubscription.event(event('A', 'unmounted'))
unmountedSubscription.error(new Error('unmounted error'))
unmountedStep?.()
assert.equal(graph.dirty, false, 'late callbacks after unmount cannot update state')
assert.equal(timers.size, 0)
assert.equal(intervals.size, 0)
assert.ok(subscriptions.every((subscription) => subscription.closed))

// Preserve the public three-argument replay API, including empty input.
let replayEvents = aEvents
const replay = mount(() => useReplay(replayEvents, 1, 8))
assert.deepEqual(replay.render(), [])
replay.flush()
tick()
assert.equal(replay.render().length, 1)
replayEvents = bEvents
assert.deepEqual(replay.render(), [], 'standalone replay count is also run-keyed')
replay.flush()
replayEvents = []
assert.deepEqual(replay.render(), [])
replay.flush()
replay.unmount()
assert.equal(timers.size, 0)
console.log('useRuntimeEvents ok: empty run, subscription races, replay isolation and cleanup')
