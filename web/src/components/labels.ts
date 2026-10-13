import { AGENTS, CHALLENGE_COLOR, STAGES, type AgentId, type FindingRole, type PeerMessage, type Stage } from '@tbm/shared'
import {
  Check, CircleHelp, Cog, Drill, FileText, Flag, Gavel, HardHat, Megaphone, MessageCircle, Mountain, Reply, RotateCcw, Shovel, ShieldCheck, Stamp, Users, Zap,
  type LucideIcon,
} from 'lucide-react'
import type { AgentStatus, FeedEvent, ViewState } from '../state/reducer.ts'

export const AGENT_ICON: Record<AgentId, LucideIcon> = {
  coordinator: Gavel,
  geology: Mountain,
  boring: Drill,
  cutter: Cog,
  muck: Shovel,
  human: HardHat,
}

export const KIND: Record<PeerMessage['kind'], { icon: LucideIcon; label: string; color: string }> = {
  ask: { icon: CircleHelp, label: '追问', color: '#136ff3' },
  answer: { icon: Reply, label: '回答', color: '#5b7cad' },
  challenge: { icon: Zap, label: '质疑', color: CHALLENGE_COLOR },
  endorse: { icon: Check, label: '赞同', color: '#10b981' },
  defend: { icon: ShieldCheck, label: '坚持', color: '#34496b' },
  broadcast: { icon: Megaphone, label: '广播', color: '#6d7d97' },
}

// 颜色只用来区分交互类型；专家本身统一用墨色，画面上的颜色讲的全是协作
export const INK = '#0c2347'
export const BRAND = '#136ff3'
export const REVISE_COLOR = '#ea8a0c'
export const HUMAN_COLOR = '#0891b2'

export const ROLE: Record<FindingRole, { label: string; className: string }> = {
  primary: { label: '主因', className: 'bg-red-50 text-red-600 ring-1 ring-red-200' },
  secondary: { label: '次因', className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  ruled_out: { label: '已排除', className: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200' },
  open: { label: '待定', className: 'bg-blue-50 text-blue-600 ring-1 ring-blue-200' },
}

export const STATUS: Record<AgentStatus, string> = {
  idle: '待命',
  thinking: '思考中',
  tool: '查数据',
  waiting: '等待中',
  done: '发言完毕',
  error: '出错',
}

/** 每个阶段用一句大白话解释，给不懂流程的观众看 */
export const STAGE_HINT: Record<Stage, string> = {
  snapshot: '冻结各系统的数据，保证所有专家看的是同一份',
  solo: '每位专家只能看自己系统里的数据，先独立给出判断',
  review: '专家之间开始互相追问、质疑、赞同，不经过主持人',
  session: '主持人把有分歧的专家叫到一起当面讨论',
  signoff: '主持人起草结论，每位专家签字确认',
  approval: '等待负责人审核结论',
  closed: '会商结束',
}

const name = (id: AgentId) => AGENTS[id].name
const short = (s: string, n = 34) => (s.length > n ? `${s.slice(0, n)}…` : s)

export interface Narration {
  actor: AgentId
  actorName?: string // 不是会商成员时显示的名字（如审核人）
  verb: string
  target?: AgentId | 'all'
  text: string
  color: string
  icon: LucideIcon
}

/** 把一个关键事件翻译成一句话：谁 · 做了什么 · 对谁 · 内容 */
export function narrate(e: FeedEvent, s: ViewState): Narration {
  switch (e.type) {
    case 'peer.message': {
      const k = KIND[e.data.kind]
      return { actor: e.data.from, verb: k.label, target: e.data.to, text: e.data.brief, color: k.color, icon: k.icon }
    }
    case 'finding.posted': {
      const f = e.data.finding
      return { actor: f.agentId, verb: `提出${ROLE[f.role].label}`, text: f.brief, color: INK, icon: FileText }
    }
    case 'finding.revised': {
      // 改口的关键是"因为谁"：列出引用编号所属的其他人
      const by = [...new Set(e.data.cites.map((r) => s.refOwners[r]).filter((o) => o && o !== e.data.agentId))]
      const because = by.length ? `（因为${by.map(name).join('、')}的证据）` : ''
      return { actor: e.data.agentId, verb: '改口', text: `${ROLE[e.data.before.role].label}→${ROLE[e.data.after.role].label}：${e.data.after.brief}${because}`, color: REVISE_COLOR, icon: RotateCcw }
    }
    case 'human.asked':
      return { actor: e.data.agentId, verb: '问现场', target: 'human', text: e.data.brief, color: HUMAN_COLOR, icon: CircleHelp }
    case 'human.answered':
      return 'timeout' in e.data
        ? { actor: 'human', verb: '未回答', text: '超时，会商继续', color: '#6d7d97', icon: HardHat }
        : { actor: 'human', verb: '回答', text: short(e.data.text), color: HUMAN_COLOR, icon: HardHat }
    case 'session.opened':
      return { actor: 'coordinator', verb: '召集会商', text: short(e.data.topic), color: BRAND, icon: Users }
    case 'conclusion.drafted':
      return { actor: 'coordinator', verb: '起草结论', text: short(e.data.conclusion.primary.cause), color: BRAND, icon: Flag }
    case 'signoff.submitted':
      return { actor: e.data.agentId, verb: e.data.agree ? '签字同意' : '签字反对', text: e.data.note ? short(e.data.note) : '', color: e.data.agree ? CHALLENGE_COLOR : '#6d7d97', icon: Stamp }
    case 'review.decided':
      return { actor: 'human', actorName: '负责人', verb: e.data.decision === 'approve' ? '批准结论' : '驳回结论', text: e.data.comment ?? '', color: BRAND, icon: Stamp }
    case 'stage.changed':
      if (e.data.stage === 'closed') return { actor: 'coordinator', verb: '会商结束', text: s.review ? `结论已${s.review.decision === 'approve' ? '批准' : '驳回'}` : '', color: BRAND, icon: Flag }
      return { actor: 'coordinator', verb: STAGES.find((x) => x.id === e.data.stage)?.label ?? '会商结束', text: STAGE_HINT[e.data.stage], color: BRAND, icon: MessageCircle }
  }
}
