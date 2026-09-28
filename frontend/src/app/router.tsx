import { useEffect, useState, type ReactNode } from 'react'

export type PageId =
  | 'overview'
  | 'collaboration'
  | 'runtime'
  | 'agents'
  | 'playbooks'
  | 'triggers'
  | 'capabilities'
  | 'history'
  | 'settings'

export const NAV: { id: PageId; href: string; label: string }[] = [
  { id: 'overview', href: '/', label: '总览' },
  { id: 'collaboration', href: '/collaboration', label: 'AI 协同' },
  { id: 'runtime', href: '/runtime', label: '运行视图' },
  { id: 'agents', href: '/agents', label: 'Agent' },
  { id: 'playbooks', href: '/playbooks', label: 'Playbooks' },
  { id: 'triggers', href: '/triggers', label: 'Trigger' },
  { id: 'capabilities', href: '/capabilities', label: '数据与能力' },
  { id: 'history', href: '/history', label: '运行记录' },
  { id: 'settings', href: '/settings', label: '设置' },
]

export function pageFromPath(path: string): PageId {
  return NAV.find((item) => item.href === path)?.id ?? 'overview'
}

export function navigate(to: string) {
  if (`${location.pathname}${location.search}` === to) {
    window.dispatchEvent(new PopStateEvent('popstate'))
    return
  }
  history.pushState({}, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function useRoute() {
  const [href, setHref] = useState(() => `${location.pathname}${location.search}`)
  useEffect(() => {
    const onPop = () => setHref(`${location.pathname}${location.search}`)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const url = new URL(href, location.origin)
  return { page: pageFromPath(url.pathname), params: url.searchParams, path: url.pathname, navigate }
}

export function AppLink({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={to}
      className={className}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
        event.preventDefault()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}
