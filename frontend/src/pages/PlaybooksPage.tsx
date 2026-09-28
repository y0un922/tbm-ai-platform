import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Bot, Check, ChevronRight, GitBranch, Play, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { createPlaybook, listPlaybooks, testPlaybook, updatePlaybook } from '@/api/playbooks'
import { listAgents } from '@/api/agents'
import { listTriggers } from '@/api/triggers'
import { isMockMode } from '@/api/client'
import { useRoute } from '@/app/router'
import { Badge, Button, Card, EmptyState, ErrorState, Field, PageHeader, inputClass, toast } from '@/components/ui/primitives'
import { getPlaybookStages, validatePlaybook } from '@/features/playbooks/model'
import { useProjectId } from '@/hooks/useProject'
import type { AgentRecord, Playbook, PlaybookStage, PlaybookStatus, TriggerDefinition } from '@/types'

function newPlaybook(projectId: string): Playbook {
  return {
    id: '', projectId, name: '', description: '', status: 'testing', version: '0', updatedAt: '',
    constraints: ['不得下发设备控制指令', '结论必须说明证据与适用范围'],
    humanReview: { required: true, when: '按阶段审核关卡', roles: ['项目工程师'] },
    output: { description: '分析结论与建议', destinations: ['运行记录'] },
    notification: '站内通知项目工程师', archiving: '随运行记录保留',
    stages: [
      { id: crypto.randomUUID(), name: '工况分析', goal: '分析当前工况，识别异常并列出证据与缺失数据。', agentIds: [], output: '工况分析与证据摘要', requiresReview: false },
      { id: crypto.randomUUID(), name: '建议与复核', goal: '基于上一阶段结论，整理适用条件、参数建议与风险。', agentIds: [], output: '待工程师复核的建议报告', requiresReview: true },
    ],
  }
}

export function PlaybooksPage() {
  const { projectId } = useProjectId()
  // Project changes remount the editor; no draft or pending action crosses projects.
  return <ProjectPlaybooks key={projectId} projectId={projectId} />
}

function ProjectPlaybooks({ projectId }: { projectId: string }) {
  const { params, navigate } = useRoute()
  const playbooks = useQuery({ queryKey: ['playbooks', projectId], queryFn: () => listPlaybooks(projectId) })
  const triggers = useQuery({ queryKey: ['triggers', projectId], queryFn: () => listTriggers(projectId) })
  const agents = useQuery({ queryKey: ['agents'], queryFn: listAgents })
  const [dirty, setDirty] = useState(false)
  const [newDraft] = useState(() => newPlaybook(projectId))
  const creating = params.get('playbook') === 'new'
  const selected = creating ? newDraft : (playbooks.data ?? []).find((item) => item.id === params.get('playbook')) ?? playbooks.data?.[0]
  const select = (id: string) => {
    if (id === (creating ? 'new' : selected?.id)) return
    if (dirty && !window.confirm('有未保存的工作流修改，确定放弃并切换吗？')) return
    setDirty(false)
    navigate(`/playbooks?playbook=${encodeURIComponent(id)}`)
  }
  if (playbooks.isError) return <ErrorState body={playbooks.error.message} onRetry={() => playbooks.refetch()} />
  return (
    <div className="space-y-4">
      <PageHeader title="Playbooks" sub="定义业务阶段与审核边界，阶段内由 Coordinator 组织 Agent 协作。" extra={<Button variant="primary" onClick={() => select('new')}><Plus className="size-4" aria-hidden />新建工作流</Button>} />
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500"><Badge tone="info">阶段编排</Badge><span>有序阶段</span><ChevronRight className="size-3" aria-hidden /><span>Agent 自主协作</span><ChevronRight className="size-3" aria-hidden /><span>审核后继续</span>{isMockMode && <span className="ml-auto">Mock · 数据刷新后重置，模拟运行不调用真实模型</span>}</div>
      {playbooks.isPending && <p role="status" className="text-sm text-gray-500">正在加载工作流…</p>}
      {agents.isError && <ErrorState title="Agent 列表加载失败" body={agents.error.message} onRetry={() => agents.refetch()} />}
      {triggers.isError && <ErrorState title="Trigger 列表加载失败" body={triggers.error.message} onRetry={() => triggers.refetch()} />}
      <div className="grid items-start gap-4 xl:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="space-y-2" aria-label="工作流列表">
          <div className="flex items-center justify-between px-1 text-xs font-medium text-gray-500"><span>当前项目工作流</span><span>{playbooks.data?.length ?? 0}</span></div>
          {(playbooks.data ?? []).map((item) => <button key={item.id} type="button" onClick={() => select(item.id)} aria-pressed={!creating && selected?.id === item.id} className={`w-full rounded-xl border bg-white p-3 text-left shadow-sm ${!creating && selected?.id === item.id ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-gray-100 hover:border-gray-300'}`}>
            <div className="flex items-start justify-between gap-2"><b className="text-sm">{item.name}</b><Status status={item.status} /></div>
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-500">{item.description || '业务阶段工作流'}</p>
            <div className="mt-3 flex justify-between text-[11px] text-gray-400"><span>{getPlaybookStages(item).length} 个阶段</span><span>v{item.version}</span></div>
          </button>)}
          {creating && <div className="rounded-xl border border-dashed border-indigo-300 bg-indigo-50 p-3 text-sm text-indigo-700">新建工作流 · 尚未保存</div>}
        </aside>
        {selected ? <PlaybookEditor key={selected.id || 'new'} initial={selected} agents={agents.data ?? []} agentsReady={agents.isSuccess} triggers={triggers.data ?? []} triggersReady={triggers.isSuccess} onDirty={setDirty} /> : !playbooks.isPending && <Card><EmptyState title="还没有工作流" body="从两个业务阶段开始，再按项目需要增删和调整。" action={<Button variant="primary" onClick={() => select('new')}>创建第一个工作流</Button>} /></Card>}
      </div>
    </div>
  )
}

function PlaybookEditor({ initial, agents, agentsReady, triggers, triggersReady, onDirty }: { initial: Playbook; agents: AgentRecord[]; agentsReady: boolean; triggers: TriggerDefinition[]; triggersReady: boolean; onDirty: (dirty: boolean) => void }) {
  const { navigate } = useRoute()
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Playbook>(() => structuredClone({ ...initial, stages: getPlaybookStages(initial) }))
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft))
  const [picked, setPicked] = useState(draft.stages![0]?.id)
  const active = useRef(true)
  const stages = draft.stages!
  const stage = stages.find((item) => item.id === picked) ?? stages[0]
  const dirty = JSON.stringify(draft) !== baseline
  const error = validatePlaybook(draft, agentsReady ? agents.map((agent) => agent.id) : undefined)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => { onDirty(dirty) }, [dirty, onDirty])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const save = useMutation({
    mutationFn: async () => {
      if (error) throw new Error(error)
      const body = { ...draft, name: draft.name.trim(), stages: stages.map((item) => ({ ...item, name: item.name.trim(), goal: item.goal.trim(), output: item.output.trim() })), humanReview: { ...draft.humanReview, required: stages.some((item) => item.requiresReview) } }
      if (draft.id) return updatePlaybook(draft.id, body)
      const { id, version, updatedAt, ...creation } = body
      return createPlaybook(creation)
    },
    onSuccess: (saved) => {
      qc.setQueryData<Playbook[]>(['playbooks', saved.projectId], (items = []) => items.some((item) => item.id === saved.id) ? items.map((item) => item.id === saved.id ? saved : item) : [saved, ...items])
      qc.invalidateQueries({ queryKey: ['playbooks'] })
      qc.invalidateQueries({ queryKey: ['triggers'] })
      if (!active.current) return
      const next = structuredClone({ ...saved, stages: getPlaybookStages(saved) })
      setDraft(next)
      setBaseline(JSON.stringify(next))
      onDirty(false)
      if (!initial.id) navigate(`/playbooks?playbook=${encodeURIComponent(saved.id)}`)
      toast('工作流已保存，后续运行将使用此版本')
    },
  })
  const test = useMutation({
    mutationFn: () => testPlaybook(draft.id),
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ['runs'] })
      if (active.current) navigate(`/runtime?run=${encodeURIComponent(run.id)}`)
    },
  })
  const busy = save.isPending || test.isPending
  useEffect(() => {
    if (!dirty && !busy && initial.id && initial.version !== draft.version) {
      const next = structuredClone({ ...initial, stages: getPlaybookStages(initial) })
      setDraft(next)
      setBaseline(JSON.stringify(next))
    }
  }, [initial, draft.version, dirty, busy])
  const updateStage = (patch: Partial<PlaybookStage>) => setDraft({ ...draft, stages: stages.map((item) => item.id === stage.id ? { ...item, ...patch } : item) })
  const move = (index: number, direction: number) => {
    const next = [...stages]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setDraft({ ...draft, stages: next })
  }
  const add = () => {
    const next: PlaybookStage = { id: crypto.randomUUID(), name: `阶段 ${stages.length + 1}`, goal: '', agentIds: [], output: '', requiresReview: false }
    setDraft({ ...draft, stages: [...stages, next] })
    setPicked(next.id)
  }
  const remove = (id: string) => {
    if (stages.length <= 1 || !window.confirm('删除这个阶段及其配置？保存后才会生效。')) return
    const next = stages.filter((item) => item.id !== id)
    setDraft({ ...draft, stages: next })
    if (picked === id) setPicked(next[0]?.id)
  }
  return (
    <div className="min-w-0 space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><GitBranch className="size-4 text-indigo-600" aria-hidden /><h2 className="text-sm font-semibold">{initial.id ? '编辑工作流' : '新建工作流'}</h2><Badge tone={dirty || !draft.id ? 'warn' : 'good'}>{dirty || !draft.id ? '未保存' : `已保存 · v${draft.version}`}</Badge></div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || dirty || !draft.id || draft.status === 'disabled' || Boolean(error)} onClick={() => test.mutate()}><Play className="size-4" aria-hidden />{test.isPending ? '正在创建运行…' : isMockMode ? '模拟运行' : '测试运行'}</Button>
            <Button variant="primary" disabled={busy || Boolean(error) || !agentsReady || !triggersReady || (!dirty && Boolean(draft.id))} onClick={() => save.mutate()}><Check className="size-4" aria-hidden />{save.isPending ? '保存中…' : '保存工作流'}</Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500">保存后才能测试。运行使用独立版本快照，不会被后续编辑改变。切换项目会放弃未保存修改。</p>
        {error && <p className="mt-2 text-xs text-amber-800" role="status">{error}</p>}
        {(save.error || test.error) && <p role="alert" className="mt-2 text-sm text-red-700">{save.error?.message || test.error?.message}。草稿已保留，可重试。</p>}
        <fieldset disabled={busy} className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="工作流名称"><input className={inputClass} maxLength={100} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="例如：掘进效率异常诊断" /></Field>
          <Field label="状态"><select className={inputClass} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as PlaybookStatus })}><option value="testing">测试中</option><option value="enabled">已启用</option><option value="disabled">停用</option></select></Field>
          <div className="md:col-span-2"><Field label="工作流说明"><input className={inputClass} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="说明适用工况与业务目标" /></Field></div>
        </fieldset>
      </Card>
      <fieldset disabled={busy} className="grid min-w-0 items-start gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3"><h3 className="text-sm font-semibold">阶段顺序</h3><span className="text-xs text-gray-500">{stages.length}/20 · 按顺序推进</span></div>
          <div className="space-y-2 p-4">
            <div className="mb-3 flex items-center gap-2 text-xs text-gray-500"><span className="size-2 rounded-full bg-indigo-400" />{triggers.find((item) => item.id === draft.triggerDefinitionId)?.name || '手动测试 / 用户目标'}<span className="ml-auto">入口</span></div>
            {stages.map((item, index) => <div key={item.id} className={`rounded-xl border ${stage?.id === item.id ? 'border-indigo-300 bg-indigo-50/50 ring-1 ring-indigo-100' : 'border-gray-200 bg-white'}`}>
              <button type="button" className="flex w-full items-start gap-3 p-3 text-left" onClick={() => setPicked(item.id)} aria-pressed={stage?.id === item.id} aria-label={`编辑阶段 ${index + 1}：${item.name}`}>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-semibold text-indigo-600 ring-1 ring-gray-200">{String(index + 1).padStart(2, '0')}</span>
                <span className="min-w-0 flex-1"><b className="block truncate text-sm">{item.name || '未命名阶段'}</b><span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-gray-500">{item.goal || '请配置阶段任务目标'}</span></span>
              </button>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-3 py-2">
                <div className="flex flex-wrap gap-1"><Badge tone="info">{item.agentIds.length ? `${item.agentIds.length} 个参与 Agent` : '自主选择 Agent'}</Badge>{item.requiresReview && <Badge tone="warn">审核关卡</Badge>}</div>
                <div className="flex gap-1"><button type="button" className="flex size-8 items-center justify-center rounded-md text-gray-600 hover:bg-white disabled:opacity-30" aria-label={`上移阶段 ${index + 1}`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="size-4" /></button><button type="button" className="flex size-8 items-center justify-center rounded-md text-gray-600 hover:bg-white disabled:opacity-30" aria-label={`下移阶段 ${index + 1}`} disabled={index === stages.length - 1} onClick={() => move(index, 1)}><ArrowDown className="size-4" /></button><button type="button" className="flex size-8 items-center justify-center rounded-md text-red-600 hover:bg-white disabled:opacity-30" aria-label={`删除阶段 ${index + 1}`} disabled={stages.length === 1} onClick={() => remove(item.id)}><Trash2 className="size-4" /></button></div>
              </div>
            </div>)}
            <Button className="w-full border-dashed" disabled={stages.length >= 20} onClick={add}><Plus className="size-4" aria-hidden />添加阶段</Button>
            <p className="pt-2 text-xs leading-relaxed text-gray-500">阶段定义业务边界，不固定内部工具调用顺序。审核关卡批准后才会进入下一阶段。</p>
          </div>
        </Card>
        {stage && <Card className="space-y-4 p-4">
          <div className="flex items-center gap-2"><Bot className="size-4 text-indigo-600" aria-hidden /><h3 className="text-sm font-semibold">阶段配置</h3><span className="ml-auto text-xs text-gray-400">{stages.indexOf(stage) + 1} / {stages.length}</span></div>
          <Field label="阶段名称"><input className={inputClass} maxLength={100} value={stage.name} onChange={(event) => updateStage({ name: event.target.value })} /></Field>
          <Field label="阶段任务" hint="说明本阶段解决什么问题，不必预设 Agent 的内部执行步骤。"><textarea className={inputClass} rows={3} maxLength={5000} value={stage.goal} onChange={(event) => updateStage({ goal: event.target.value })} /></Field>
          <fieldset className="space-y-2"><legend className="mb-1 text-xs font-medium text-gray-600">参与 Agent</legend><p className="text-xs text-gray-500">不勾选时由 Coordinator 自主选择；勾选后限定参与范围。</p><div className="grid gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">{agents.filter((agent) => agent.id !== 'coordinator').map((agent) => <label key={agent.id} className="flex items-center gap-2 text-xs text-gray-700"><input type="checkbox" checked={stage.agentIds.includes(agent.id)} onChange={(event) => updateStage({ agentIds: event.target.checked ? [...stage.agentIds, agent.id] : stage.agentIds.filter((id) => id !== agent.id) })} />{agent.name}<span className="ml-auto text-[10px] text-gray-400">{agent.role}</span></label>)}</div></fieldset>
          <Field label="预期输出" hint="描述需要交付的结论或材料，不是已经生成的分析结果。"><textarea className={inputClass} rows={2} maxLength={2000} value={stage.output} onChange={(event) => updateStage({ output: event.target.value })} /></Field>
          <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><input className="mt-1" type="checkbox" checked={stage.requiresReview} onChange={(event) => updateStage({ requiresReview: event.target.checked })} /><span><span className="flex items-center gap-1 font-medium text-amber-900"><ShieldCheck className="size-4" aria-hidden />阶段结束需人工审核</span><span className="mt-1 block text-xs text-amber-800">暂停等待批准，支持要求补数；驳回将结束运行。</span></span></label>
        </Card>}
      </fieldset>
      <Card className="p-4"><details><summary className="cursor-pointer text-sm font-semibold">全局约束、触发与结果交付 <span className="ml-2 text-xs font-normal text-gray-400">{draft.constraints.length} 条约束 · {stages.filter((item) => item.requiresReview).length} 个审核关卡</span></summary>
        <fieldset disabled={busy} className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="关联 Trigger" hint="一个 Trigger 对应一个工作流；保存时同步双方关联。"><select className={inputClass} value={draft.triggerDefinitionId ?? ''} onChange={(event) => setDraft({ ...draft, triggerDefinitionId: event.target.value || null })}><option value="">不绑定 · 手动测试</option>{triggers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="审核角色（每行一个）"><textarea className={inputClass} rows={2} value={draft.humanReview.roles.join('\n')} onChange={(event) => setDraft({ ...draft, humanReview: { ...draft.humanReview, roles: event.target.value.split('\n') } })} /></Field>
          <Field label="全局约束（每行一条）"><textarea className={inputClass} rows={3} value={draft.constraints.join('\n')} onChange={(event) => setDraft({ ...draft, constraints: event.target.value.split('\n') })} /></Field>
          <Field label="最终交付说明"><textarea className={inputClass} rows={3} value={draft.output.description} onChange={(event) => setDraft({ ...draft, output: { ...draft.output, description: event.target.value } })} /></Field>
          <Field label="通知"><input className={inputClass} value={draft.notification} onChange={(event) => setDraft({ ...draft, notification: event.target.value })} /></Field>
          <Field label="归档"><input className={inputClass} value={draft.archiving} onChange={(event) => setDraft({ ...draft, archiving: event.target.value })} /></Field>
          <p className="text-xs text-gray-500 md:col-span-2">通知、归档与审核权限由后端执行；Mock 仅保存配置。编排器不会生成设备控制指令。</p>
        </fieldset>
      </details></Card>
    </div>
  )
}

function Status({ status }: { status: PlaybookStatus }) {
  return <Badge tone={status === 'enabled' ? 'good' : status === 'testing' ? 'warn' : 'neutral'}>{status === 'enabled' ? '已启用' : status === 'testing' ? '测试中' : '停用'}</Badge>
}
