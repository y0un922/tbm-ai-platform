import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createTrigger, listTriggerInstances, listTriggers, patchTrigger, testTrigger } from '@/api/triggers'
import { listPlaybooks } from '@/api/playbooks'
import { listRuns } from '@/api/runs'
import { useRoute } from '@/app/router'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Kpi, PageHeader, inputClass } from '@/components/ui/primitives'
import { toast } from '@/components/ui/primitives'
import { TRIGGER_TYPE_LABEL } from '@/features/runtime/labels'
import { useProjectId } from '@/hooks/useProject'
import type { TriggerDefinition, TriggerType } from '@/types'
import { formatRelative, startOfToday, str, num } from '@/utils/format'

const FILTERS: { id: 'all' | TriggerType; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'user_goal', label: '用户' },
  { id: 'schedule', label: '定时' },
  { id: 'metric_threshold', label: '指标' },
  { id: 'system_event', label: '系统' },
  { id: 'webhook', label: 'Webhook' },
  { id: 'external_api', label: 'API' },
]

const empty = (projectId: string): TriggerDefinition => ({
  id: '',
  name: '',
  type: 'metric_threshold',
  enabled: true,
  projectId,
  description: '',
  config: { source: '', condition: '', dataSource: '', debounceSec: 0, cooldownSec: 60, severity: 'medium', playbookId: '' },
})

export function TriggersPage() {
  const { projectId } = useProjectId()
  const { navigate } = useRoute()
  const qc = useQueryClient()
  const triggers = useQuery({ queryKey: ['triggers', projectId], queryFn: () => listTriggers(projectId) })
  const instances = useQuery({ queryKey: ['trigger-instances', projectId], queryFn: () => listTriggerInstances(projectId), refetchInterval: 4000 })
  const runs = useQuery({ queryKey: ['runs', projectId], queryFn: () => listRuns(projectId) })
  const playbooks = useQuery({ queryKey: ['playbooks', projectId], queryFn: () => listPlaybooks(projectId) })
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [editing, setEditing] = useState<TriggerDefinition | null>(null)
  const [editingProject, setEditingProject] = useState(projectId)
  if (editingProject !== projectId) {
    setEditingProject(projectId)
    setEditing(null)
  }
  const list = (triggers.data ?? []).filter((item) => filter === 'all' || item.type === filter || (filter === 'user_goal' && item.type === 'manual'))
  const today = (instances.data ?? []).filter((item) => new Date(item.timestamp).getTime() >= startOfToday()).length
  const failures = (instances.data ?? []).filter((item) => item.payload?.failed === true).length
  const active = (runs.data ?? []).filter((run) => run.status === 'running' || run.status === 'review').length
  const enabled = (triggers.data ?? []).filter((item) => item.enabled).length
  const recent = useMemo(() => instances.data ?? [], [instances.data])

  const save = useMutation({
    mutationFn: async (body: TriggerDefinition) => {
      if (body.projectId !== projectId) throw new Error('项目已切换，请重新打开 Trigger 后保存')
      const name = body.name.trim()
      const source = str(body.config, 'source').trim()
      if (!name || !source) throw new Error('名称和来源不能为空或仅包含空格')
      const next = { ...body, name, config: { ...body.config, source } }
      return body.id ? patchTrigger(body.id, next) : createTrigger(next)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['triggers'] }); qc.invalidateQueries({ queryKey: ['playbooks'] }); setEditing(null); toast('Trigger 已保存。规则仍由后端引擎解释。') },
    onError: (error: Error) => toast(error.message),
  })
  const toggle = useMutation({
    mutationFn: (item: TriggerDefinition) => patchTrigger(item.id, { enabled: !item.enabled }),
    onSuccess: (_, item) => { qc.invalidateQueries({ queryKey: ['triggers'] }); toast(`${item.name} 已${item.enabled ? '停用' : '启用'}`) },
    onError: (error: Error) => toast(`启停失败：${error.message}`),
  })
  const test = useMutation({
    mutationFn: testTrigger,
    onSuccess: (run) => { qc.invalidateQueries({ queryKey: ['runs'] }); navigate(`/runtime?run=${run.id}`); toast('已创建测试运行') },
    onError: (error: Error) => toast(error.message),
  })

  if (triggers.isError) return <ErrorState body={triggers.error.message} onRetry={() => triggers.refetch()} />
  return (
    <div className="space-y-4">
      <PageHeader title="Trigger" sub="一次运行的入口。前端不监听 PLC，也不判断阈值是否成立。" extra={<Button variant="primary" onClick={() => setEditing(empty(projectId))}>新建</Button>} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="已启用" value={String(enabled)} hint="定义数量" />
        <Kpi label="今日触发" value={String(today)} hint="实例，不是定义" />
        <Kpi label="活跃运行" value={String(active)} hint="运行中或待审核" />
        <Kpi label="触发失败" value={String(failures)} hint="投递失败" tone={failures ? 'bad' : 'neutral'} />
      </div>
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((item) => (
          <button key={item.id} type="button" aria-pressed={filter === item.id} className={`rounded-lg px-3 py-1.5 text-sm ${filter === item.id ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'}`} onClick={() => setFilter(item.id)}>{item.label}</button>
        ))}
      </div>
      {list.length === 0 && <EmptyState title="没有 Trigger" body="可以新建定义。用户目标触发在 AI 协同里产生，不需要预先配置。" />}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((item) => {
          const last = recent.find((instance) => instance.triggerDefinitionId === item.id)
          return (
            <Card key={item.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">{item.name}</h2>
                  <p className="text-xs text-indigo-700">{TRIGGER_TYPE_LABEL[item.type]}</p>
                </div>
                <Badge tone={item.enabled ? 'good' : 'neutral'}>{item.enabled ? 'Enabled' : 'Disabled'}</Badge>
              </div>
              <dl className="mt-3 space-y-1 text-sm text-gray-600">
                <div>来源：{str(item.config, 'source', '—')}</div>
                {item.type === 'schedule' && <div>Cron：{str(item.config, 'schedule', '—')}</div>}
                {item.type === 'metric_threshold' && <div>指标：{str(item.config, 'metric', '—')}</div>}
                <div>条件：{str(item.config, 'condition', '—')}</div>
                <div>数据源：{str(item.config, 'dataSource', '—')}</div>
                <div>最近触发：{last ? formatRelative(last.timestamp) : '—'}</div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => setEditing(item)}>编辑</Button>
                <Button disabled={toggle.isPending} onClick={() => toggle.mutate(item)}>{toggle.isPending && toggle.variables.id === item.id ? '更新中' : item.enabled ? '停用' : '启用'}</Button>
                <Button variant="primary" disabled={!item.enabled || test.isPending} onClick={() => test.mutate(item.id)}>测试</Button>
              </div>
            </Card>
          )
        })}
      </div>
      <Card>
        <div className="border-b border-gray-100 px-4 py-2 text-sm font-semibold">最近触发实例</div>
        <div className="divide-y divide-gray-100">
          {recent.length === 0 && <EmptyState title="还没有实例" body="定义是配置，实例才是一次真正发生的触发。" />}
          {recent.slice(0, 6).map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
              <div>
                <div className="font-medium">{item.name}</div>
                <div className="text-xs text-gray-500">{TRIGGER_TYPE_LABEL[item.type]} · {item.source} · {item.summary}</div>
              </div>
              <div className="shrink-0 text-xs text-gray-400">{formatRelative(item.timestamp)}{item.payload?.failed === true ? ' · 失败' : ''}</div>
            </div>
          ))}
        </div>
      </Card>
      {editing && editing.projectId === projectId && (
        <TriggerForm
          value={editing}
          playbooks={playbooks.data ?? []}
          onClose={() => setEditing(null)}
          onChange={setEditing}
          onSave={() => save.mutate(editing)}
          saving={save.isPending}
        />
      )}
    </div>
  )
}

function TriggerForm({ value, onChange, onClose, onSave, saving, playbooks }: { value: TriggerDefinition; onChange: (v: TriggerDefinition) => void; onClose: () => void; onSave: () => void; saving: boolean; playbooks: { id: string; name: string }[] }) {
  const setConfig = (key: string, next: unknown) => onChange({ ...value, config: { ...value.config, [key]: next } })
  const sourceError = !str(value.config, 'source').trim() ? '来源不能为空或仅包含空格' : undefined
  const typeError = value.type === 'schedule' && !str(value.config, 'schedule').trim() ? '请填写定时计划' : value.type === 'metric_threshold' && !str(value.config, 'metric').trim() ? '请填写监控指标' : undefined
  const error = !value.name.trim() ? '名称必填' : sourceError || typeError
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-gray-900/30" role="dialog" aria-label="编辑 Trigger">
      <button className="flex-1" aria-label="关闭编辑" onClick={onClose} />
      <form className="h-full w-full max-w-md space-y-3 overflow-auto bg-white p-5 shadow-xl" onSubmit={(e) => { e.preventDefault(); if (!error) onSave() }}>
        <h2 className="text-base font-semibold">{value.id ? '编辑 Trigger' : '新建 Trigger'}</h2>
        <p className="text-xs text-gray-500">这里只保存触发配置，不执行定时调度或阈值判断。测试会创建一次运行，不代表规则已命中。</p>
        <Field label="名称" error={!value.name.trim() ? '必填' : undefined}><input className={inputClass} value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} /></Field>
        <Field label="类型">
          <select className={inputClass} value={value.type} onChange={(e) => onChange({ ...value, type: e.target.value as TriggerType })}>
            {Object.entries(TRIGGER_TYPE_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </Field>
        <Field label="来源" error={sourceError} hint="触发请求的来源名称，如 Timer、SCADA 或外部系统。"><input className={inputClass} required aria-invalid={Boolean(sourceError)} value={str(value.config, 'source')} onChange={(e) => setConfig('source', e.target.value)} /></Field>
        {value.type === 'schedule' && (
          <Field label="定时计划（Cron）" error={typeError} hint="例如 0 8 * * * 表示每天 08:00；格式与执行时区由后端解释。"><input className={inputClass} value={str(value.config, 'schedule')} placeholder="0 8 * * *" onChange={(e) => setConfig('schedule', e.target.value)} /></Field>
        )}
        {value.type === 'metric_threshold' && (
          <Field label="监控指标" error={typeError} hint="填写指标名称，如 FIR；判断条件在下方配置。"><input className={inputClass} value={str(value.config, 'metric')} placeholder="FIR" onChange={(e) => setConfig('metric', e.target.value)} /></Field>
        )}
        <Field label={value.type === 'schedule' ? '计划说明' : value.type === 'metric_threshold' ? '阈值条件' : value.type === 'system_event' ? '事件条件' : '触发条件'} hint="保留为条件文本，由后端解释；填写地址不会在前端创建接口或监听器。"><input className={inputClass} value={str(value.config, 'condition')} onChange={(e) => setConfig('condition', e.target.value)} /></Field>
        <Field label="数据源"><input className={inputClass} value={str(value.config, 'dataSource')} onChange={(e) => setConfig('dataSource', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="防抖（秒）" hint="用于抑制短时间内重复信号，由后端执行。"><input className={inputClass} type="number" min={0} value={num(value.config, 'debounceSec') ?? 0} onChange={(e) => setConfig('debounceSec', Number(e.target.value))} /></Field>
          <Field label="冷却（秒）" hint="触发后再次接受触发的间隔，由后端执行。"><input className={inputClass} type="number" min={0} value={num(value.config, 'cooldownSec') ?? 0} onChange={(e) => setConfig('cooldownSec', Number(e.target.value))} /></Field>
        </div>
        <Field label="严重度">
          <select className={inputClass} value={str(value.config, 'severity', 'medium')} onChange={(e) => setConfig('severity', e.target.value)}>
            <option value="info">信息</option><option value="low">低</option><option value="medium">中</option><option value="high">高</option>
          </select>
        </Field>
        <Field label="关联 Playbook">
          <select className={inputClass} value={str(value.config, 'playbookId')} onChange={(e) => setConfig('playbookId', e.target.value)}>
            <option value="">不关联</option>
            {playbooks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.enabled} onChange={(e) => onChange({ ...value, enabled: e.target.checked })} />Enabled</label>
        <Field label="说明"><textarea className={inputClass} rows={2} value={value.description ?? ''} onChange={(e) => onChange({ ...value, description: e.target.value })} /></Field>
        <div className="flex gap-2">
          <Button variant="primary" type="submit" disabled={saving || Boolean(error)}>{saving ? '保存中' : '保存'}</Button>
          <Button onClick={onClose}>取消</Button>
        </div>
      </form>
    </div>
  )
}
