// 立场矩阵：每个论点（F*）上，其余三位专家当前是赞同还是质疑、质疑有没有被化解。
// 全部由 finding.reactions / revisions / sessions 推出，不做文本归类。
import { SPECIALISTS, type SpecialistId } from '@tbm/shared'
import type { FindingView, MessageView, ViewState } from './reducer.ts'

// resolved = 质疑后论点已修正或专项会商已结束；stale = 赞同的是旧版，论点之后被修正，赞同不再代表对新内容的态度
export type Stance = 'endorse' | 'challenge' | 'resolved' | 'stale'

export interface Cell {
  marks: MessageView[] // 该专家对此论点的赞同 / 质疑，按时间
  stance?: Stance
}

export type RowStatus = 'consensus' | 'disputed' | 'settled' | 'partial' | 'pending'

export interface MatrixRow {
  f: FindingView
  cells: Record<SpecialistId, Cell | undefined> // 提出者自己那格为 undefined
  status: RowStatus
  endorsers: number
  verdict?: 'primary' | 'secondary' | 'ruled_out' // 写进结论的哪一栏
}

/** 质疑之后论点被修正、或覆盖它的专项会商已结束，算已化解 */
function isResolved(s: ViewState, f: FindingView, m: MessageView): boolean {
  if (f.revisions.some((r) => r.ts > m.ts)) return true
  return s.sessions.some((x) => x.findingIds.includes(f.id) && x.closed && x.closed.ts > m.ts)
}

export function buildMatrix(s: ViewState): MatrixRow[] {
  const c = s.conclusion?.conclusion
  const verdictOf = (id: string) =>
    c?.primary.findings.includes(id) ? 'primary' as const
      : c?.secondary.some((x) => x.findings.includes(id)) ? 'secondary' as const
        : c?.ruledOut.some((x) => x.findings.includes(id)) ? 'ruled_out' as const
          : undefined

  return s.findingOrder.map((id) => {
    const f = s.findings[id]
    const cells = {} as MatrixRow['cells']
    for (const a of SPECIALISTS) {
      if (a === f.agentId) { cells[a] = undefined; continue }
      const marks = f.reactions.filter((m) => m.from === a && (m.kind === 'endorse' || m.kind === 'challenge'))
      const last = marks.at(-1)
      const stance: Stance | undefined = !last ? undefined
        : last.kind === 'endorse' ? (f.revisions.some((r) => r.ts > last.ts) ? 'stale' : 'endorse')
          : isResolved(s, f, last) ? 'resolved' : 'challenge'
      cells[a] = { marks, stance }
    }
    const others = Object.values(cells).filter((x): x is Cell => !!x)
    const endorsers = others.filter((x) => x.stance === 'endorse').length
    const status: RowStatus = others.some((x) => x.stance === 'challenge') ? 'disputed'
      : endorsers === others.length ? 'consensus'
        : others.some((x) => x.stance === 'resolved') ? 'settled'
          : endorsers > 0 ? 'partial' : 'pending'
    return { f, cells, status, endorsers, verdict: verdictOf(id) }
  })
}

/** 改口的"因为谁"：引用编号属于其他人的，列出这些人 */
export function persuaders(s: ViewState, agentId: SpecialistId, cites: string[]) {
  return [...new Set(cites.map((r) => s.refOwners[r]).filter((o) => o && o !== agentId))]
}
