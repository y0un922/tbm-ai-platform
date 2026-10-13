import { useEffect, useState } from 'react'
import { EvidenceDialog } from './components/EvidenceDialog.tsx'
import { NAV, Sidebar, type Page } from './components/Sidebar.tsx'
import { TopBar } from './components/TopBar.tsx'
import { AgentsPage } from './pages/Agents.tsx'
import { CollabPage } from './pages/Collab.tsx'
import { OverviewPage } from './pages/Overview.tsx'
import { ToolsPage } from './pages/Tools.tsx'
import { TriggersPage } from './pages/Triggers.tsx'
import { useRun } from './state/useRun.ts'

function parsePage(): Page {
  const id = location.hash.replace(/^#\/?/, '').split('?')[0]
  return NAV.find((n) => n.id === id)?.id ?? 'overview'
}

export function App() {
  const run = useRun() // 放在最外层：切换页面时会商不中断
  const [page, setPage] = useState(parsePage)
  useEffect(() => {
    const on = () => setPage(parsePage())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar page={page} running={run.state.status === 'running'} />
        <main className="min-w-0 flex-1 overflow-y-auto p-[18px]">
          {page === 'overview' && <OverviewPage run={run} />}
          {page === 'collab' && <CollabPage run={run} />}
          {page === 'triggers' && <TriggersPage run={run} />}
          {page === 'agents' && <AgentsPage state={run.state} />}
          {page === 'tools' && <ToolsPage state={run.state} />}
        </main>
      </div>
      {run.evidence && <EvidenceDialog evidence={run.evidence} onClose={run.closeEvidence} />}
      {run.error && (
        <div className="fixed top-20 left-1/2 z-50 -translate-x-1/2 cursor-pointer rounded-lg bg-white px-4 py-2 text-[13px] text-bad shadow-lg ring-1 ring-red-200" onClick={run.clearError}>
          {run.error}
        </div>
      )}
    </div>
  )
}
