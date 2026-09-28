import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  const src = text
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = re.exec(src))) {
    if (match.index > last) parts.push(src.slice(last, match.index))
    if (match[1] != null) parts.push(<code key={key++} className="rounded bg-black/[0.06] px-1 py-px font-mono text-[0.9em]">{match[1]}</code>)
    else if (match[2] != null || match[3] != null) parts.push(<strong key={key++}>{match[2] ?? match[3]}</strong>)
    else parts.push(<em key={key++}>{match[4]}</em>)
    last = match.index + match[0].length
  }
  if (last < src.length) parts.push(src.slice(last))
  return parts
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  let key = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('```')) {
      const buf: string[] = []
      i += 1
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++])
      i += 1
      blocks.push(<pre key={key++} className="overflow-auto rounded-lg bg-black/[0.04] px-3 py-2 font-mono text-[13px] leading-relaxed">{buf.join('\n')}</pre>)
      continue
    }
    if (line.trim().startsWith('|') && line.includes('|', 1)) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
        i += 1
        if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue
        rows.push(cells)
      }
      if (rows.length > 0) {
        const head = rows[0]
        const body = rows.slice(1)
        blocks.push(
          <div key={key++} className="my-2 overflow-auto">
            <table className="w-max min-w-full border-collapse text-[13px]">
              <thead>
                <tr>{head.map((cell, index) => <th key={index} className="border-b border-black/10 px-2 py-1 text-left font-medium">{inline(cell)}</th>)}</tr>
              </thead>
              {body.length > 0 && (
                <tbody>
                  {body.map((cells, row) => (
                    <tr key={row}>{cells.map((cell, index) => <td key={index} className="border-b border-black/[0.06] px-2 py-1 align-top tabular-nums">{inline(cell)}</td>)}</tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>,
        )
      }
      continue
    }
    if (/^#{1,3} /.test(line)) {
      const level = line.match(/^#+/)![0].length
      const Tag = (level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5') as 'h3' | 'h4' | 'h5'
      blocks.push(<Tag key={key++} className="mt-3 mb-1 font-semibold tracking-[-0.02em] first:mt-0">{inline(line.replace(/^#{1,3} /, ''))}</Tag>)
      i += 1
      continue
    }
    if (/^[-*] /.test(line) || /^\d+\. /.test(line)) {
      const ordered = /^\d+\. /.test(line)
      const items: string[] = []
      while (i < lines.length && (ordered ? /^\d+\. /.test(lines[i]) : /^[-*] /.test(lines[i]))) {
        items.push(lines[i].replace(ordered ? /^\d+\. / : /^[-*] /, ''))
        i += 1
      }
      const List = ordered ? 'ol' : 'ul'
      blocks.push(
        <List key={key++} className={cn('my-2 space-y-1 pl-5', ordered ? 'list-decimal' : 'list-disc')}>
          {items.map((item, index) => <li key={index}>{inline(item)}</li>)}
        </List>,
      )
      continue
    }
    if (!line.trim()) {
      i += 1
      continue
    }
    const buf = [line]
    i += 1
    while (i < lines.length && lines[i].trim() && !/^#{1,3} /.test(lines[i]) && !/^[-*] /.test(lines[i]) && !/^\d+\. /.test(lines[i]) && !lines[i].startsWith('```')) {
      buf.push(lines[i++])
    }
    blocks.push(<p key={key++} className="my-2 leading-[1.55] first:mt-0 last:mb-0">{inline(buf.join('\n'))}</p>)
  }
  return <div className={cn('text-[15px] text-neutral-900', className)}>{blocks}</div>
}
