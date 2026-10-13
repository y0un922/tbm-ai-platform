// AI 协同：左侧立场矩阵（每条论点谁赞同谁质疑）/ 协作网络（谁和谁在交流），右侧会商群聊（说了什么）
import { MAX_QUESTION_LEN, STAGES, type AgentId, type CreateRunRequest } from '@tbm/shared'
import { Check, Play, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { AgentDrawer } from '../components/AgentDrawer.tsx'
import { Caption } from '../components/Caption.tsx'
import { Chat } from '../components/Chat.tsx'
import { ConclusionBanner } from '../components/ConclusionBanner.tsx'
import { Counters } from '../components/Counters.tsx'
import { HumanCard } from '../components/HumanCard.tsx'
import { Badge, Btn, inputCls, PageHead, selectCls } from '../components/kit.tsx'
import { Network } from '../components/Network.tsx'
import { ReviewBar } from '../components/ReviewBar.tsx'
import { StanceMatrix } from '../components/StanceMatrix.tsx'
import { clock } from '../components/ui.tsx'
import { source } from '../data/index.ts'
import { DEFAULT_QUESTION, KIND_LABEL } from '../data/triggers.ts'
import { pendingQuestions, type ViewState } from '../state/reducer.ts'
import type { Run } from '../state/useRun.ts'
import { KIND_STYLE } from './Triggers.tsx'

const STATUS_TEXT = { idle: '', running: '', completed: '已完成', failed: '运行失败', aborted: '已中止' }

/** 人工发起：填写会商问题和发起原因，随 CreateRunRequest 提交 */
function StartDialog({ mode, lastQuestion, onClose, onStart }: { mode: 'live' | 'replay'; lastQuestion: string; onClose: () => void; onStart: (question: string, reason: string) => void }) {
  const replay = mode === 'replay'
  const [question, setQuestion] = useState(lastQuestion || DEFAULT_QUESTION)
  const [reason, setReason] = useState('')
  const tooLong = question.length > MAX_QUESTION_LEN
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#0c2347]/30" onClick={onClose}>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onClick={(e) => e.stopPropagation()} className="w-[620px] rounded-[12px] bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center">
          <h2 className="mr-2 text-[19px] font-bold">发起 AI 会商</h2>
          <Badge tone="blue">人工发起</Badge>
          <button onClick={onClose} className="ml-auto text-faint hover:text-ink"><X size={18} /></button>
        </div>
        <label className="text-[13px] font-semibold text-[#4e6686]">会商问题</label>
        <textarea
          value={replay ? DEFAULT_QUESTION : question}
          disabled={replay}
          onChange={(e) => setQuestion(e.target.value)}
          className={`${inputCls} mt-1.5 h-24 resize-none leading-relaxed disabled:bg-paper disabled:text-muted`}
        />
        <div className="mt-1 flex text-[12px] text-muted">
          {replay ? '回放模式播放的是录制样本，问题固定。切到「真实运行」可自定义问题。' : '四位专家只能查到 500–540 环的数据，问题需落在这个范围内。'}
          {!replay && <span className={`ml-auto tabular-nums ${tooLong ? 'text-bad' : ''}`}>{question.length}/{MAX_QUESTION_LEN}</span>}
        </div>
        <label className="mt-4 block text-[13px] font-semibold text-[#4e6686]">发起原因</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：夜班反馈出土偏干，想确认是否和泡沫系统有关" className={`${inputCls} mt-1.5`} />
        <div className="mt-6 flex justify-end gap-2.5">
          <Btn onClick={onClose}>取消</Btn>
          <Btn primary icon={Play} disabled={!replay && (!question.trim() || tooLong)} onClick={() => onStart(replay ? '' : question.trim(), reason.trim())}>开始会商</Btn>
        </div>
      </motion.div>
    </div>
  )
}

function Controls({ running, lastQuestion, onStart }: { running: boolean; lastQuestion: string; onStart: (req: CreateRunRequest) => void }) {
  const [mode, setMode] = useState<'live' | 'replay'>(source.kind === 'local' ? 'replay' : 'live')
  const [speed, setSpeed] = useState(1)
  // 从触发规则页「去发起」跳过来时直接打开对话框
  const [dialog, setDialog] = useState(() => location.hash.includes('?new'))
  const close = () => { setDialog(false); if (location.hash.includes('?new')) history.replaceState(null, '', '#/collab') }
  const start = (question: string, reason: string) => {
    close()
    const trigger = { kind: 'manual', id: 'manual', name: '人工发起', reason: reason || '未填写原因' } as const
    onStart(mode === 'replay' ? { mode, speed, trigger } : { mode, question, trigger })
  }
  return (
    <>
      {source.kind === 'http' && (
        <select value={mode} onChange={(e) => setMode(e.target.value as 'live' | 'replay')} className={selectCls}>
          <option value="live">真实运行</option>
          <option value="replay">回放样本</option>
        </select>
      )}
      {mode === 'replay' && (
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className={selectCls}>
          {[1, 2, 5, 10].map((s) => <option key={s} value={s}>{s}× 速度</option>)}
        </select>
      )}
      {/* http 模式下运行中也允许点击，用于验证后端返回 409（联调 1 第 8 项） */}
      <Btn primary icon={Play} disabled={running && source.kind === 'local'} onClick={() => setDialog(true)}>
        开始会商
      </Btn>
      {dialog && <StartDialog mode={mode} lastQuestion={lastQuestion} onClose={close} onStart={start} />}
    </>
  )
}

function Steps({ state }: { state: ViewState }) {
  const current = STAGES.findIndex((s) => s.id === state.stage)
  const closed = state.stage === 'closed'
  return (
    <ol className="mt-4 flex items-center border-t border-line pt-4">
      {STAGES.map((s, i) => {
        const done = closed || i < current
        const active = !closed && i === current
        return (
          <li key={s.id} className="flex flex-1 items-center gap-2.5 last:flex-none">
            <span className={`grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold ${active ? 'bg-brand text-white shadow-[0_0_0_4px_#edf5ff]' : done ? 'bg-[#e8f8f1] text-[#05965f]' : 'bg-[#eef1f5] text-faint'}`}>
              {done ? <Check size={14} strokeWidth={3} /> : i + 1}
            </span>
            <span className={`whitespace-nowrap ${active ? 'font-bold text-brand' : done ? 'font-semibold text-ink' : 'text-faint'}`}>{s.label}</span>
            {i < STAGES.length - 1 && <span className={`mx-3 h-0.5 flex-1 rounded ${done ? 'bg-[#10b981]/50' : 'bg-line'}`} />}
          </li>
        )
      })}
    </ol>
  )
}

export function CollabPage({ run }: { run: Run }) {
  const { state } = run
  const [selected, setSelected] = useState<AgentId>()
  const [pair, setPair] = useState<string>() // 点选的连线：群聊只看这两人
  const [hover, setHover] = useState<string>() // 群聊悬停的消息对应的连线
  const [view, setView] = useState<'matrix' | 'network'>('matrix')
  const pending = pendingQuestions(state)
  const elapsed = state.startedAt && state.now ? (state.finishedAt ?? state.now) - state.startedAt : 0

  return (
    <div className="flex h-full min-h-[860px] flex-col">
      <PageHead
        title="AI 协同会商"
        desc={state.question || '四位专家各自只能看到本专业的数据，通过追问、质疑、赞同和改口形成共识，最终由负责人审核。'}
        actions={
          <>
            {STATUS_TEXT[state.status] && <span className="text-muted">{STATUS_TEXT[state.status]}{state.error && `：${state.error}`}</span>}
            {state.startedAt && <span className="font-mono text-[18px] text-ink-2 tabular-nums">{clock(elapsed)}</span>}
            <Controls running={state.status === 'running'} lastQuestion={state.question} onStart={run.start} />
          </>
        }
      >
        {state.trigger && (
          <div className="mt-2.5 flex items-center gap-2 text-[13px] text-muted">
            触发方式
            <Badge tone={KIND_STYLE[state.trigger.kind].tone}>{KIND_LABEL[state.trigger.kind]}</Badge>
            <span className="font-semibold text-ink-2">{state.trigger.name}</span>
            <span className="truncate">· {state.trigger.reason}</span>
            <a href="#/triggers" className="shrink-0 text-brand hover:underline">查看触发规则</a>
          </div>
        )}
        <Steps state={state} />
      </PageHead>

      <ConclusionBanner state={state} onOpenRef={run.openEvidence} />

      <div className="relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(460px,34%)] gap-2.5">
        <section className="relative flex min-h-0 flex-col overflow-hidden rounded-[10px] border border-line bg-white">
          <Caption state={state} />
          <div className="flex shrink-0 gap-1 border-b border-line px-3 pt-1.5">
            {([['matrix', '立场矩阵', '每条论点上谁赞同、谁质疑、谁被说服'], ['network', '协作网络', '谁和谁交流了多少']] as const).map(([id, label, sub]) => (
              <button key={id} onClick={() => setView(id)} className={`-mb-px flex items-baseline gap-2 border-b-2 px-3 py-2 ${view === id ? 'border-brand font-bold text-brand' : 'border-transparent text-[#5d7191] hover:text-ink'}`}>
                {label}<small className="text-[11px] font-normal text-muted">{sub}</small>
              </button>
            ))}
          </div>
          {view === 'matrix' ? (
            <div className="min-h-0 flex-1"><StanceMatrix state={state} onOpenRef={run.openEvidence} /></div>
          ) : (
            <>
              <div className="dot-canvas relative min-h-0 flex-1">
                <Network
                  state={state}
                  focus={hover ?? pair}
                  focusAgent={selected}
                  onPickPair={(k) => { setSelected(undefined); setPair(pair === k ? undefined : k) }}
                  onSelectAgent={(id) => { setPair(undefined); setSelected(selected === id ? undefined : id) }}
                />
                <div className="pointer-events-none absolute right-3 bottom-3 flex items-center gap-3 rounded-md bg-white/90 px-2.5 py-1.5 text-[11px] text-muted ring-1 ring-line">
                  <span>连线越粗交流越多</span>
                  <span>点连线看两人对话</span>
                  <span>点专家高亮其全部连线并查看详情</span>
                </div>
              </div>
              <Counters state={state} />
            </>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex flex-col items-center gap-2 [&>*]:pointer-events-auto">
            <AnimatePresence>
              {/* 一次只弹一张，避免挡住网络 */}
              {pending[0] && <HumanCard key={pending[0].questionId} q={pending[0]} more={pending.length - 1} onAnswer={run.answer} />}
            </AnimatePresence>
            {state.stage === 'approval' && state.conclusion && !state.review && <ReviewBar version={state.conclusion.version} onReview={run.review} />}
          </div>
        </section>
        <Chat state={state} pair={pair} onClearPair={() => setPair(undefined)} onHover={setHover} onOpenRef={run.openEvidence} />
        <AnimatePresence>
          {selected && <AgentDrawer key={selected} id={selected} state={state} onClose={() => setSelected(undefined)} onOpenRef={run.openEvidence} />}
        </AnimatePresence>
      </div>
    </div>
  )
}
