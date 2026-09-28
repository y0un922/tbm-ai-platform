import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const KEY = 'tbm.project'

const Ctx = createContext<{ projectId: string; selectProject: (id: string) => void } | null>(null)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projectId, setProjectId] = useState(() => localStorage.getItem(KEY) || 'proj_a')
  const selectProject = (id: string) => {
    localStorage.setItem(KEY, id)
    setProjectId(id)
  }
  return <Ctx.Provider value={{ projectId, selectProject }}>{children}</Ctx.Provider>
}

export function useProjectId() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('ProjectProvider missing')
  return ctx
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}
