import assert from 'node:assert/strict'
import { store } from './store'
import type { Run } from '@/types'
import { reduceGraph } from '@/features/runtime/graphReducer'

// Keep this check deterministic: no auto-started demo timers.
store.demoStarted = true
const { mockRequest } = await import('./router')
const original = structuredClone(store.runs.find((run) => run.humanReview)!)
const run: Run = { ...original, id: 'review_check', status: 'review', endedAt: undefined, humanReview: { ...original.humanReview!, status: 'pending' } }
store.runs.push(run)
const post = (path: string, body: unknown) => mockRequest<Run>(`/runs/${run.id}/${path}`, { method: 'POST', body })

await assert.rejects(post('review', { decision: 'invalid' }), /无效/)
await post('review', { decision: 'request_more_data' })
assert.equal(run.humanReview?.status, 'needs_data')
await assert.rejects(post('review', { decision: 'approve' }), /状态已变更/)
await assert.rejects(post('supplement', { reviewId: 'stale', content: 'valid' }), /待补数/)
for (const content of ['', '   ', 'x'.repeat(5001), null, 123]) {
  await assert.rejects(post('supplement', { reviewId: run.humanReview!.id, content }), /补充材料/)
}
const updated = await post('supplement', { reviewId: run.humanReview!.id, content: '  环号 1245–1250；来源：现场复核记录；尚待核验。  ' })
assert.equal(updated.humanReview?.status, 'pending')
assert.equal(updated.humanReview?.supplement, '环号 1245–1250；来源：现场复核记录；尚待核验。')
assert.deepEqual(updated.humanReview?.missing, original.humanReview?.missing, 'material submission must not claim missing evidence is verified')
await assert.rejects(post('supplement', { reviewId: run.humanReview!.id, content: 'duplicate' }), /待补数/)
const events = store.events.filter((event) => event.runId === run.id)
assert.equal(events.filter((event) => event.type === 'human_review.requested').length, 1)
const graph = reduceGraph(events, { mode: 'aggregated', reviewDecisions: {} })
assert.equal(graph.nodes.find((node) => node.kind === 'human_review')?.status, 'review')
await post('review', { decision: 'approve' })
assert.equal(run.status, 'completed')
assert.equal(run.humanReview?.status, 'approved')
assert.match(run.resultSummary!, /未向设备下发/)
await assert.rejects(post('review', { decision: 'reject' }), /状态已变更/)
console.log('review workflow ok')
