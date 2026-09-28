import { useEffect, useMemo, useRef, useState } from 'react'
import type { GraphMode, ReviewDecision, RuntimeEvent } from '@/types'
import { subscribeRunEvents } from '@/api/runs'
import { reduceGraph } from '@/features/runtime/graphReducer'
import { EVENT_LABEL } from '@/features/runtime/labels'
import { usePrefersReducedMotion } from '@/hooks/useProject'
import { str } from '@/utils/format'

export function summarizeEvent(event: RuntimeEvent) {
  const name = str(event.data, 'name') || str(event.data, 'text') || str(event.data, 'summary') || str(event.data, 'error')
  return [EVENT_LABEL[event.type] ?? event.type, name].filter(Boolean).join(' · ')
}

export function useRuntimeEvents(runId?: string) {
  let [state, setState] = useState<{ runId?: string; events: RuntimeEvent[]; error: string | null }>({ runId, events: [], error: null })
  // Reset during render so neither the graph nor its children see the previous run.
  if (state.runId !== runId) {
    state = { runId, events: [], error: null }
    setState(state)
  }
  useEffect(() => {
    if (!runId) return
    let active = true
    const unsubscribe = subscribeRunEvents(runId, (event) => {
      setState((prev) => {
        if (!active || prev.runId !== runId || event.runId !== runId) return prev
        if (prev.events.some((item) => item.id === event.id)) return prev.error ? { ...prev, error: null } : prev
        return { ...prev, error: null, events: [...prev.events, event].sort((a, b) => a.timestamp.localeCompare(b.timestamp)) }
      })
    }, (err) => setState((prev) => !active || prev.runId !== runId ? prev : { ...prev, error: err.message }))
    return () => {
      active = false
      unsubscribe()
    }
  }, [runId])
  return { events: state.events, error: state.error }
}

export function useReplay(events: RuntimeEvent[], token: number, speed: number, runId = events[0]?.runId) {
  const replayKey = useMemo(() => ({}), [runId, token, speed])
  const [progress, setProgress] = useState({ replayKey, count: 0 })
  const eventsRef = useRef(events)
  eventsRef.current = events
  useEffect(() => {
    if (token === 0) return
    const list = eventsRef.current
    setProgress({ replayKey, count: 0 })
    if (list.length === 0) return
    let active = true
    let i = 0
    let timer = 0
    const step = () => {
      if (!active) return
      i += 1
      setProgress({ replayKey, count: i })
      if (i >= list.length) return
      const delta = new Date(list[i].timestamp).getTime() - new Date(list[i - 1].timestamp).getTime()
      timer = window.setTimeout(step, Math.max(40, Math.min(900, delta / speed)))
    }
    timer = window.setTimeout(step, 40)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [token, speed, replayKey])
  if (token === 0) return events
  return events.slice(0, progress.replayKey === replayKey ? progress.count : 0)
}

export function useRunGraph(runId: string | undefined, reviewDecisions: Record<string, ReviewDecision>) {
  const reduced = usePrefersReducedMotion()
  const { events, error } = useRuntimeEvents(runId)
  const [mode, setMode] = useState<GraphMode>('aggregated')
  let [replayState, setReplayState] = useState({ runId, token: 0 })
  if (replayState.runId !== runId) {
    replayState = { runId, token: 0 }
    setReplayState(replayState)
  }
  const { token } = replayState
  const [speed, setSpeed] = useState(8)
  const [now, setNow] = useState(() => Date.now())
  const visible = useReplay(events, token, speed, runId)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const decisionKey = JSON.stringify(reviewDecisions)
  const model = useMemo(
    () => reduceGraph(visible, { mode, now, reviewDecisions }),
    [visible, mode, now, decisionKey, reviewDecisions],
  )
  const latest = events.at(-1)
  return {
    events: visible,
    allEvents: events,
    model,
    mode,
    setMode,
    replay: () => setReplayState((prev) => prev.runId === runId ? { runId, token: prev.token + 1 } : prev),
    replaying: token > 0,
    followLive: () => setReplayState((prev) => prev.runId === runId ? { runId, token: 0 } : prev),
    speed,
    setSpeed,
    error,
    reduced,
    liveMessage: latest ? summarizeEvent(latest) : '',
  }
}
