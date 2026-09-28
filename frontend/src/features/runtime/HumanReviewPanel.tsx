import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ClipboardCheck } from 'lucide-react'
import { decideReview, submitSupplement } from '@/api/runs'
import { isMockMode } from '@/api/client'
import { Badge, Button, inputClass, toast } from '@/components/ui/primitives'
import type { ReviewDecision, Run } from '@/types'

/** Both runtime surfaces use the same authoritative review and submission feedback. */
export function HumanReviewPanel({ run }: { run: Run }) {
  const qc = useQueryClient()
  const [content, setContent] = useState('')
  const review = run.humanReview
  const action = useMutation({
    mutationFn: (decision: ReviewDecision | 'supplement') => decision === 'supplement'
      ? submitSupplement(run.id, review!.id, content.trim())
      : decideReview(run.id, decision, review!.id),
    onSuccess: (updated, decision) => {
      qc.setQueryData(['run', run.id], updated)
      qc.setQueryData<Run[]>(['runs', run.projectId], (runs) => runs?.map((item) => item.id === updated.id ? updated : item))
      qc.invalidateQueries({ queryKey: ['runs'] })
      qc.invalidateQueries({ queryKey: ['run', run.id] })
      if (decision === 'supplement') setContent('')
      toast(decision === 'supplement' ? '补充材料已提交，请复核后作出审核决定' : '审核决定已提交')
    },
  })
  if (!review) return null
  const waiting = review.status === 'needs_data'
  const pending = review.status === 'pending'
  const title = waiting ? '等待补充数据' : pending ? (review.supplement ? '补充材料已收到 · 等待复核' : '需要人工审核') : review.status === 'approved' ? '审核已批准' : '审核已驳回'
  if (!pending && !waiting) {
    return (
      <section aria-label="人工审核" className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm">
        <ClipboardCheck className="size-4 text-gray-500" aria-hidden />
        <h2 className="font-medium text-gray-900" aria-live="polite">{title}</h2>
        {isMockMode && <Badge tone="info">模拟运行</Badge>}
        <span className="text-gray-400">结论见下方</span>
      </section>
    )
  }
  return (
    <section aria-label="人工审核" className="rounded-xl border border-amber-200 bg-amber-50/60">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 gap-3">
          <ClipboardCheck className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold text-gray-900" aria-live="polite">{title}</h2>{isMockMode && <Badge tone="info">模拟运行</Badge>}</div>
            <p className="text-sm text-gray-700">{review.reason}</p>
          </div>
        </div>
        {pending && <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={action.isPending} onClick={() => action.mutate('approve')}>批准建议</Button>
          <Button disabled={action.isPending} onClick={() => action.mutate('request_more_data')}>要求补数</Button>
          <Button variant="danger" disabled={action.isPending} onClick={() => action.mutate('reject')}>驳回</Button>
        </div>}
      </div>
      {review.supplement && <details className="mx-4 mb-3 rounded-lg border border-gray-200 bg-white px-3 py-2" open={pending}>
        <summary className="cursor-pointer text-xs font-medium text-gray-700">最近提交的补充材料{pending || waiting ? ' · 尚需人工核验' : ''}</summary>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700">{review.supplement}</p>
      </details>}
      {waiting && <form className="grid gap-4 border-t border-amber-100 p-4 md:grid-cols-[240px_minmax(0,1fr)]" onSubmit={(event) => { event.preventDefault(); if (content.trim() && !action.isPending) action.mutate('supplement') }}>
        <div>
          <h3 className="text-xs font-semibold text-gray-700">待核对的数据</h3>
          {review.missing.length ? <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-gray-600">{review.missing.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-gray-600">请补充支持当前结论的数据来源、采集时间和适用环号。</p>}
          <p className="mt-3 text-xs leading-relaxed text-gray-500">{isMockMode ? '演示模式：提交后重新进入人工审核，不执行真实数据校验或模型分析。' : '材料交由后端处理，审核状态以服务端返回为准。'}</p>
        </div>
        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-700" htmlFor="review-supplement">补充材料</label>
          <textarea id="review-supplement" className={inputClass} rows={4} required maxLength={5000} disabled={action.isPending} value={content} onChange={(event) => setContent(event.target.value)} placeholder="填写数据来源、采集时间、环号范围与测量结果；可附材料链接。" aria-describedby="supplement-hint" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span id="supplement-hint" className="text-xs text-gray-500">文本或材料链接 · {content.length}/5000</span>
            <Button variant="primary" type="submit" disabled={action.isPending || !content.trim()}>{action.isPending ? '正在提交…' : '提交补数并重新送审'}</Button>
          </div>
        </div>
      </form>}
      {action.error && <p role="alert" className="px-4 pb-3 text-sm text-red-700">提交失败：{action.error.message}。输入内容已保留，可重试。</p>}
    </section>
  )
}
