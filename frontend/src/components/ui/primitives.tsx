import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { AlertTriangle, Check, Circle, Clock, LoaderCircle, ShieldAlert, X } from 'lucide-react'
import type { NodeStatus, RunStatus, Severity } from '@/types'
import { NODE_STATUS_LABEL, RUN_STATUS_LABEL } from '@/features/runtime/labels'
import { cn } from '@/utils/cn'

const listeners = new Set<(message: string) => void>()
export function toast(message: string) {
  listeners.forEach((listener) => listener(message))
}

export function ToastViewport() {
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    let timer = 0
    const onMessage = (next: string) => {
      setMessage(next)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setMessage(null), 2200)
    }
    listeners.add(onMessage)
    return () => {
      listeners.delete(onMessage)
      window.clearTimeout(timer)
    }
  }, [])
  if (!message) return null
  return (
    <div role="status" className="fixed right-4 bottom-4 z-50 rounded-lg bg-gray-900 px-3 py-2 text-sm text-white shadow-lg">
      {message}
    </div>
  )
}

const buttonVariant = {
  primary: 'bg-brand text-white hover:bg-[#0077ed]',
  secondary: 'border border-gray-200 bg-white text-gray-800 hover:bg-gray-50',
  ghost: 'text-gray-600 hover:bg-gray-100',
  danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
}

export function Button({
  variant = 'secondary',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof buttonVariant }) {
  return (
    <button
      type={type}
      className={cn('inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-[color,background-color,transform] duration-100 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50', buttonVariant[variant], className)}
      {...props}
    />
  )
}

export function IconButton({ label, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <Button variant="ghost" className={cn('size-8 px-0', className)} aria-label={label} title={label} {...props} />
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('rounded-xl border border-gray-100 bg-white shadow-sm', className)}>{children}</section>
}

export function CardHeader({ title, sub, extra }: { title: string; sub?: string; extra?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
      </div>
      {extra}
    </div>
  )
}

export function Kpi({ label, value, unit, hint, tone = 'neutral' }: { label: string; value: string; unit?: string; hint?: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tracking-tight text-gray-900 tabular-nums">{value}</span>
        {unit && <span className="text-xs text-gray-500">{unit}</span>}
      </div>
      {hint && <div className={cn('mt-1 text-xs', tone === 'good' && 'text-emerald-700', tone === 'warn' && 'text-amber-700', tone === 'bad' && 'text-red-700', (!tone || tone === 'neutral') && 'text-gray-500')}>{hint}</div>}
    </div>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info' }) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium', tone === 'good' && 'bg-emerald-50 text-emerald-700', tone === 'warn' && 'bg-amber-50 text-amber-800', tone === 'bad' && 'bg-red-50 text-red-700', tone === 'info' && 'bg-indigo-50 text-indigo-700', tone === 'neutral' && 'bg-gray-100 text-gray-600')}>
      {children}
    </span>
  )
}

const runTone: Record<RunStatus, 'info' | 'good' | 'warn' | 'bad' | 'neutral'> = {
  pending: 'neutral',
  running: 'info',
  review: 'warn',
  completed: 'good',
  failed: 'bad',
}

export function RunStatusText({ status }: { status: RunStatus }) {
  const Icon = status === 'running' ? LoaderCircle : status === 'completed' ? Check : status === 'failed' ? X : status === 'review' ? ShieldAlert : Clock
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', status === 'running' && 'text-indigo-700', status === 'completed' && 'text-emerald-700', status === 'failed' && 'text-red-700', status === 'review' && 'text-amber-700', status === 'pending' && 'text-gray-500')}>
      <Icon className={cn('size-3.5', status === 'running' && 'motion-safe:animate-spin')} aria-hidden />
      {RUN_STATUS_LABEL[status]}
    </span>
  )
}

export function NodeStatusText({ status }: { status: NodeStatus }) {
  const Icon = status === 'running' ? LoaderCircle : status === 'completed' ? Check : status === 'failed' ? X : status === 'review' ? ShieldAlert : status === 'waiting' ? Clock : Circle
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium', status === 'running' && 'text-indigo-700', status === 'completed' && 'text-emerald-700', status === 'failed' && 'text-red-700', status === 'review' && 'text-amber-700', (status === 'pending' || status === 'waiting') && 'text-gray-500')}>
      <Icon className={cn('size-3', status === 'running' && 'motion-safe:animate-spin')} aria-hidden />
      {NODE_STATUS_LABEL[status]}
    </span>
  )
}

export function SeverityText({ severity }: { severity: Severity }) {
  const label = severity === 'high' ? '高' : severity === 'medium' ? '中' : severity === 'low' ? '低' : '信息'
  return <Badge tone={severity === 'high' ? 'bad' : severity === 'medium' ? 'warn' : severity === 'low' ? 'neutral' : 'info'}>{label}</Badge>
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-gray-100 px-2">
      {tabs.map((tab) => (
        <button key={tab.id} role="tab" id={`tab-${tab.id}`} aria-selected={value === tab.id} aria-controls={`panel-${tab.id}`} className={cn('shrink-0 border-b-2 px-3 py-2 text-sm font-medium', value === tab.id ? 'border-brand text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800')} onClick={() => onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export const inputClass = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus-visible:border-indigo-500'

export function Field({ label, children, error, hint }: { label: string; children: ReactNode; error?: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-gray-400">{hint}</span> : null}
    </label>
  )
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <AlertTriangle className="size-5 text-gray-400" aria-hidden />
      <h3 className="mt-2 text-sm font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-gray-500">{body}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function ErrorState({ title = '加载失败', body, onRetry }: { title?: string; body: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-xl border border-red-100 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-red-700">
        <AlertTriangle className="size-4" aria-hidden />
        {title}
      </div>
      <p className="text-sm text-gray-600">{body}</p>
      {onRetry && <Button onClick={onRetry}>重试</Button>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-gray-100', className)} />
}

export function PageHeader({ title, sub, extra }: { title: string; sub?: string; extra?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-gray-900">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-gray-500">{sub}</p>}
      </div>
      {extra && <div className="flex flex-wrap items-center gap-2">{extra}</div>}
    </div>
  )
}

export function runToneOf(status: RunStatus) {
  return runTone[status]
}
