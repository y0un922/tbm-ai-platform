import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, Bell, BookOpen, Bot, Database, History, LayoutDashboard, Menu, Settings, Waypoints, X, Zap } from 'lucide-react'
import { listProjects } from '@/api/projects'
import { listRuns } from '@/api/runs'
import { listTriggerInstances } from '@/api/triggers'
import { NAV, useRoute, type PageId } from '@/app/router'
import { AppLink } from '@/app/router'
import { ProjectProvider, useProjectId } from '@/hooks/useProject'
import { AgentsPage } from '@/pages/AgentsPage'
import { CapabilitiesPage } from '@/pages/CapabilitiesPage'
import { CollaborationPage } from '@/pages/CollaborationPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { PlaybooksPage } from '@/pages/PlaybooksPage'
import { RuntimePage } from '@/pages/RuntimePage'
import { SettingsPage } from '@/pages/SettingsPage'
import { TriggersPage } from '@/pages/TriggersPage'
import { cn } from '@/utils/cn'
import { formatRelative } from '@/utils/format'

const ICONS = {
  overview: LayoutDashboard,
  collaboration: Waypoints,
  runtime: Activity,
  agents: Bot,
  playbooks: BookOpen,
  triggers: Zap,
  capabilities: Database,
  history: History,
  settings: Settings,
} satisfies Record<PageId, typeof Bot>

const GROUPS: { label: string; ids: PageId[] }[] = [
  { label: '工作台', ids: ['overview', 'collaboration', 'runtime'] },
  { label: '配置', ids: ['agents', 'playbooks', 'triggers', 'capabilities'] },
  { label: '系统', ids: ['history', 'settings'] },
]

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { page } = useRoute()
  return (
    <>
      {open && <button className="fixed inset-0 z-30 bg-gray-900/40 lg:hidden" aria-label="关闭导航" onClick={onClose} />}
      <aside className={cn('fixed inset-y-0 left-0 z-40 flex w-[220px] flex-col bg-sidebar text-gray-300 lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0')}>
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="grid size-8 place-items-center rounded-lg bg-white/10 text-white"><Waypoints className="size-4" aria-hidden /></span>
          <div>
            <div className="text-sm font-semibold text-white">TBM AI</div>
            <div className="text-[11px] text-gray-400">多智能体协同</div>
          </div>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3" aria-label="主导航">
          {GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-2 pb-1 text-[10px] font-semibold tracking-wide text-gray-500 uppercase">{group.label}</div>
              {NAV.filter((item) => group.ids.includes(item.id)).map((item) => {
                const Icon = ICONS[item.id]
                const active = page === item.id
                return (
                  <AppLink key={item.id} to={item.href} className={cn('mb-0.5 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium', active ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5 hover:text-white')}>
                    <Icon className="size-4" aria-hidden />
                    {item.label}
                  </AppLink>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 px-4 py-3 text-[11px] leading-relaxed text-gray-500">
          建议与审核留在平台内
          <br />
          不向设备下发控制指令
        </div>
      </aside>
    </>
  )
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { projectId, selectProject } = useProjectId()
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const instances = useQuery({ queryKey: ['trigger-instances', projectId], queryFn: () => listTriggerInstances(projectId) })
  const runs = useQuery({ queryKey: ['runs', projectId], queryFn: () => listRuns(projectId), refetchInterval: 4000 })
  const [open, setOpen] = useState(false)
  const alerts = [
    ...(instances.data ?? []).slice(0, 3).map((item) => ({ id: item.id, text: item.summary, at: item.timestamp })),
    ...(runs.data ?? []).filter((run) => run.humanReview?.status === 'pending').map((run) => ({ id: run.id, text: `待审核 · ${run.goal}`, at: run.startedAt })),
  ]
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-4">
      <button type="button" className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 lg:hidden" aria-label="打开导航" onClick={onMenu}>
        <Menu className="size-4" />
      </button>
      <label className="text-sm text-gray-500">
        <span className="sr-only">当前项目</span>
        <select className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm font-medium text-gray-900" value={projectId} onChange={(e) => selectProject(e.target.value)} aria-label="切换项目">
          {(projects.data ?? [{ id: projectId, name: '项目', line: '' }]).map((project) => (
            <option key={project.id} value={project.id}>{project.name} / {project.line}</option>
          ))}
        </select>
      </label>
      <div className="ml-auto flex items-center gap-2">
        <span className="hidden items-center gap-1.5 text-xs text-gray-500 sm:inline-flex"><span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />平台在线</span>
        <div className="relative">
          <button type="button" className="relative rounded-lg p-2 text-gray-600 hover:bg-gray-100" aria-label="打开通知" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <Bell className="size-4" />
            {alerts.length > 0 && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-red-500" />}
          </button>
          {open && (
            <div className="absolute right-0 mt-1 w-80 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-xs font-semibold text-gray-500">最近触发与审核</span>
                <button type="button" aria-label="关闭通知" onClick={() => setOpen(false)}><X className="size-3.5" /></button>
              </div>
              {alerts.length === 0 && <p className="px-2 py-3 text-sm text-gray-500">没有新通知</p>}
              {alerts.map((alert) => (
                <div key={alert.id} className="rounded-lg px-2 py-2 text-sm hover:bg-gray-50">
                  <div className="text-gray-800">{alert.text}</div>
                  <div className="text-xs text-gray-400">{formatRelative(alert.at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="hidden text-right sm:block">
          <div className="text-sm font-medium text-gray-900">张工程师</div>
          <div className="text-[11px] text-gray-400">项目工程师</div>
        </div>
      </div>
    </header>
  )
}

function Pages() {
  const { page } = useRoute()
  const title = NAV.find((item) => item.id === page)?.label ?? '总览'
  useEffect(() => {
    document.title = `${title} · 盾构机 AI 协同平台`
  }, [title])
  return (
    <main id="main" className="min-w-0 flex-1 px-4 py-4 lg:px-6">
      {page === 'overview' && <OverviewPage />}
      {page === 'collaboration' && <CollaborationPage />}
      {page === 'runtime' && <RuntimePage />}
      {page === 'agents' && <AgentsPage />}
      {page === 'playbooks' && <PlaybooksPage />}
      {page === 'triggers' && <TriggersPage />}
      {page === 'capabilities' && <CapabilitiesPage />}
      {page === 'history' && <HistoryPage />}
      {page === 'settings' && <SettingsPage />}
    </main>
  )
}

export function Shell() {
  const [open, setOpen] = useState(false)
  return (
    <ProjectProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:px-3 focus:py-2">跳到主内容</a>
      <div className="min-h-full bg-canvas">
        <Sidebar open={open} onClose={() => setOpen(false)} />
        <div className="lg:pl-[220px]">
          <Topbar onMenu={() => setOpen(true)} />
          <Pages />
        </div>
      </div>
    </ProjectProvider>
  )
}
