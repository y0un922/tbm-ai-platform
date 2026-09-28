import assert from 'node:assert/strict'
import { createRun, decideReview, submitSupplement } from './engine.ts'
import { store } from './store.ts'
import { firDropPct } from './rings.ts'

process.env.TBM_NO_PI = '1'

assert.ok(firDropPct() > 20, 'demo ring window must trip FIR trigger')

const run = createRun({ projectId: 'proj_a', goal: 'FIR', demo: 'fir' })
assert.equal(run.playbook?.id, 'pb_eff')
assert.equal(run.playbook?.stages.length, 2)
assert.equal(run.playbook?.stages[0]?.requiresReview, true)
assert.equal(run.playbook?.stages[0]?.agentIds.length, 0)

await new Promise<void>((resolve, reject) => {
  const started = Date.now()
  const timer = setInterval(() => {
    const live = store.runs.find((item) => item.id === run.id)
    if (live?.status === 'review' && live.humanReview?.status === 'pending') {
      clearInterval(timer)
      resolve()
    } else if (live?.status === 'failed' || Date.now() - started > 5000) {
      clearInterval(timer)
      reject(new Error(live?.resultSummary || 'did not reach review'))
    }
  }, 20)
})

const reviewId = store.runs.find((item) => item.id === run.id)!.humanReview!.id
assert.throws(() => decideReview(run.id, 'approve', 'wrong'), /已变更/)

decideReview(run.id, 'request_more_data', reviewId)
assert.equal(store.runs[0]?.humanReview?.status, 'needs_data')

submitSupplement(run.id, reviewId, '  环号 1245–1250；来源：现场复核记录；尚待核验。  ')
assert.equal(store.runs[0]?.humanReview?.status, 'pending')
assert.equal(store.runs[0]?.humanReview?.supplement, '环号 1245–1250；来源：现场复核记录；尚待核验。')

decideReview(run.id, 'approve', reviewId)

await new Promise<void>((resolve, reject) => {
  const started = Date.now()
  const timer = setInterval(() => {
    const live = store.runs.find((item) => item.id === run.id)
    if (live?.status === 'completed') {
      clearInterval(timer)
      resolve()
    } else if (live?.status === 'failed' || Date.now() - started > 5000) {
      clearInterval(timer)
      reject(new Error(live?.resultSummary || 'did not complete after approve'))
    }
  }, 20)
})

assert.ok(store.events.some((event) => event.runId === run.id && event.type === 'stage.started' && event.data.stageId === 'eff_verify'))
assert.ok(store.events.some((event) => event.runId === run.id && event.type === 'agent.delegated' && event.data.agentId === 'coordinator'))
console.log('backend check ok')
