import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSettings, updateSettings } from '@/api/settings'
import { Button, Card, ErrorState, Field, PageHeader, Skeleton, inputClass } from '@/components/ui/primitives'
import { toast } from '@/components/ui/primitives'
import { useProjectId } from '@/hooks/useProject'
import type { PlatformSettings } from '@/types'

export function SettingsPage() {
  const { projectId } = useProjectId()
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const [draft, setDraft] = useState<PlatformSettings | null>(null)
  const [prev, setPrev] = useState<string>()
  if (query.data && prev !== query.dataUpdatedAt.toString()) {
    setPrev(query.dataUpdatedAt.toString())
    setDraft(query.data)
  }
  const save = useMutation({
    mutationFn: () => updateSettings(draft!),
    onSuccess: (data) => {
      document.documentElement.dataset.density = data.density
      qc.invalidateQueries({ queryKey: ['settings'] })
      toast('设置已保存')
    },
    onError: (error: Error) => toast(error.message),
  })
  if (query.isError) return <ErrorState body={query.error.message} onRetry={() => query.refetch()} />
  if (query.isPending || !draft) return <Skeleton className="h-40" />
  return (
    <div className="space-y-4">
      <PageHeader title="设置" sub="平台与当前项目的配置。设备接入与模型供应商仍为 TBD。" extra={<Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>保存设置</Button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">通用</h2>
          <Field label="平台名称"><input className={inputClass} value={draft.platformName} onChange={(e) => setDraft({ ...draft, platformName: e.target.value })} /></Field>
          <Field label="时区"><input className={inputClass} value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })} /></Field>
          <Field label="当前项目"><input className={inputClass} value={projectId} disabled /></Field>
        </Card>
        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">Agent 策略</h2>
          <Field label="默认审核策略"><input className={inputClass} value={draft.reviewPolicy} onChange={(e) => setDraft({ ...draft, reviewPolicy: e.target.value })} /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Spawn 上限"><input className={inputClass} type="number" min={0} value={draft.spawnLimit} onChange={(e) => setDraft({ ...draft, spawnLimit: Number(e.target.value) })} /></Field>
            <Field label="超时（秒）"><input className={inputClass} type="number" min={1} value={draft.timeoutSec} onChange={(e) => setDraft({ ...draft, timeoutSec: Number(e.target.value) })} /></Field>
            <Field label="重试"><input className={inputClass} type="number" min={0} value={draft.retry} onChange={(e) => setDraft({ ...draft, retry: Number(e.target.value) })} /></Field>
          </div>
          <p className="text-xs text-gray-500">这些上限约束后端运行时。前端不能代替 Coordinator 调度，也不能下发设备指令。</p>
        </Card>
        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">留存</h2>
          <div className="grid grid-cols-3 gap-2">
            <Field label="运行（天）"><input className={inputClass} type="number" min={1} value={draft.retentionDays.runs} onChange={(e) => setDraft({ ...draft, retentionDays: { ...draft.retentionDays, runs: Number(e.target.value) } })} /></Field>
            <Field label="日志（天）"><input className={inputClass} type="number" min={1} value={draft.retentionDays.logs} onChange={(e) => setDraft({ ...draft, retentionDays: { ...draft.retentionDays, logs: Number(e.target.value) } })} /></Field>
            <Field label="文件（天）"><input className={inputClass} type="number" min={1} value={draft.retentionDays.files} onChange={(e) => setDraft({ ...draft, retentionDays: { ...draft.retentionDays, files: Number(e.target.value) } })} /></Field>
          </div>
          <Field label="审计保留（天）"><input className={inputClass} type="number" min={1} value={draft.auditRetentionDays} onChange={(e) => setDraft({ ...draft, auditRetentionDays: Number(e.target.value) })} /></Field>
        </Card>
        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">显示</h2>
          <Field label="密度">
            <select className={inputClass} value={draft.density} onChange={(e) => setDraft({ ...draft, density: e.target.value as PlatformSettings['density'] })}>
              <option value="comfortable">舒适</option>
              <option value="standard">标准</option>
              <option value="compact">紧凑</option>
            </select>
          </Field>
          <Field label="语言"><input className={inputClass} value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value })} /></Field>
        </Card>
      </div>
    </div>
  )
}
