import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { CreateRunRequest, Evidence, RunEvent, RunTrigger } from '@tbm/shared'
import { source } from '../data/index.ts'
import { initialState, reduce, type ViewState } from './reducer.ts'

type Action = { kind: 'event'; e: RunEvent } | { kind: 'reset' }
const reducer = (s: ViewState, a: Action) => (a.kind === 'reset' ? initialState : reduce(s, a.e))

const RUN_KEY = 'tbm.runId' // 刷新页面后按这个 runId 重新订阅，服务端会从头补发，reducer 重建画面

export function useRun() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [runId, setRunId] = useState<string>()
  const [error, setError] = useState<string>()
  const [evidence, setEvidence] = useState<Evidence>()
  const [launches, setLaunches] = useState<(RunTrigger & { at: number; runId: string })[]>([]) // 本页面会话内发起过的会商，触发规则页的触发记录用
  const unsubscribe = useRef<() => void>(undefined)

  const attach = useCallback((id: string) => {
    unsubscribe.current?.()
    dispatch({ kind: 'reset' })
    setRunId(id)
    sessionStorage.setItem(RUN_KEY, id)
    unsubscribe.current = source.subscribe(id, (e) => dispatch({ kind: 'event', e }))
  }, [])

  useEffect(() => {
    const saved = sessionStorage.getItem(RUN_KEY)
    if (source.kind === 'http' && saved) attach(saved)
    return () => unsubscribe.current?.()
  }, [attach])

  const guard = useCallback(async (p: Promise<unknown>) => {
    setError(undefined)
    try {
      await p
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const start = useCallback(
    (req: CreateRunRequest) =>
      guard(source.createRun(req).then((id) => {
        const t = req.trigger ?? { kind: 'manual', id: 'manual', name: '人工发起', reason: '' }
        setLaunches((xs) => [...xs, { ...t, at: Date.now(), runId: id }])
        attach(id)
      })),
    [attach, guard],
  )
  const answer = useCallback(
    (questionId: string, text: string) => runId && guard(source.answer(runId, questionId, text)),
    [runId, guard],
  )
  const review = useCallback(
    (version: number, decision: 'approve' | 'reject', comment?: string) => runId && guard(source.review(runId, version, decision, comment)),
    [runId, guard],
  )

  const openEvidence = useCallback(
    (id: string) => runId && guard(source.evidence(runId, id).then(setEvidence)),
    [runId, guard],
  )

  return {
    state, runId, error, evidence, start,
    launches, answer, review, openEvidence,
    clearError: () => setError(undefined),
    closeEvidence: () => setEvidence(undefined),
  }
}

export type Run = ReturnType<typeof useRun>
