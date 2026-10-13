// 校验一次运行的事件流是否符合契约：编号、顺序、引用关系
import { RUN_EVENT_TYPES, STAGES, type FindingCore, type RunEvent } from './events.ts'

export function validateRun(events: RunEvent[]): string[] {
  const errors: string[] = []
  const err = (e: RunEvent, msg: string) => errors.push(`#${e.seq} ${e.type}: ${msg}`)
  const known = new Set<string>(RUN_EVENT_TYPES)
  const stageOrder = [...STAGES.map((s) => s.id), 'closed']
  const findings = new Map<string, FindingCore & { version: number }>() // 判断的当前内容，用来核对修正前后是否接得上
  const evidence = new Set<string>()
  const messages = new Set<string>()
  const questions = new Set<string>()
  const sessions = new Set<string>()
  const drafts = new Set<number>()
  let stageIdx = 0
  const refOk = (r: string) => findings.has(r) || evidence.has(r)

  events.forEach((e, i) => {
    if (e.seq !== i + 1) err(e, `seq 应为 ${i + 1}`)
    if (e.runId !== events[0]!.runId) err(e, 'runId 不一致')
    if (i > 0 && e.ts < events[i - 1]!.ts) err(e, 'ts 倒退')
    if (!known.has(e.type)) err(e, '未知事件类型')
    switch (e.type) {
      case 'run.started':
        if (!e.data.question.trim()) err(e, 'question 为空')
        if (e.data.trigger && !e.data.trigger.reason.trim()) err(e, 'trigger.reason 为空')
        break
      case 'stage.changed': {
        const idx = stageOrder.indexOf(e.data.stage)
        if (idx <= stageIdx && i > 0 && e.data.stage !== 'snapshot') err(e, `阶段倒退到 ${e.data.stage}`)
        stageIdx = idx
        break
      }
      case 'tool.finished':
        if (e.data.evidenceId) evidence.add(e.data.evidenceId)
        break
      case 'finding.posted':
        findings.set(e.data.finding.id, { ...e.data.finding })
        // 发出时 payload 若是对象引用、事后被修改，这里会看到大于 1 的版本号
        if (e.data.finding.version !== 1) err(e, `新判断的 version 应为 1，实际 ${e.data.finding.version}`)
        e.data.finding.evidence.filter((r) => !refOk(r)).forEach((r) => err(e, `引用了不存在的 ${r}`))
        if (e.data.finding.brief.length > 30) err(e, 'brief 超过 30 字')
        break
      case 'finding.revised':
        if (!findings.has(e.data.findingId)) err(e, `修正了不存在的 ${e.data.findingId}`)
        else {
          const cur = findings.get(e.data.findingId)!
          if (e.data.version !== cur.version + 1) err(e, `version 应为 ${cur.version + 1}，实际 ${e.data.version}`)
          const { claim, brief, role, confidence } = cur
          if (JSON.stringify(e.data.before) !== JSON.stringify({ claim, brief, role, confidence })) err(e, `before 与 ${e.data.findingId} 当前内容不一致`)
          findings.set(e.data.findingId, { ...e.data.after, version: e.data.version })
        }
        e.data.cites.filter((r) => !refOk(r)).forEach((r) => err(e, `引用了不存在的 ${r}`))
        break
      case 'peer.message':
        messages.add(e.data.id)
        if (e.data.brief.length > 30) err(e, 'brief 超过 30 字')
        if (e.data.findingId && !findings.has(e.data.findingId)) err(e, `针对不存在的 ${e.data.findingId}`)
        if (e.data.replyTo && !messages.has(e.data.replyTo)) err(e, `回复了不存在的 ${e.data.replyTo}`)
        e.data.refs.filter((r) => !refOk(r)).forEach((r) => err(e, `引用了不存在的 ${r}`))
        break
      case 'human.asked':
        questions.add(e.data.questionId)
        break
      case 'human.answered':
        if (!questions.has(e.data.questionId)) err(e, `回答了不存在的 ${e.data.questionId}`)
        if ('evidenceId' in e.data) evidence.add(e.data.evidenceId)
        break
      case 'session.opened':
        sessions.add(e.data.sessionId)
        break
      case 'session.closed':
        if (!sessions.has(e.data.sessionId)) err(e, `结束了不存在的 ${e.data.sessionId}`)
        break
      case 'conclusion.drafted': {
        drafts.add(e.data.version)
        const c = e.data.conclusion
        for (const x of [c.primary, ...c.secondary, ...c.ruledOut]) [...x.findings, ...x.evidence].filter((r) => !refOk(r)).forEach((r) => err(e, `结论引用了不存在的 ${r}`))
        break
      }
      case 'signoff.submitted':
      case 'review.decided':
        if (!drafts.has(e.data.version)) err(e, `针对不存在的结论版本 ${e.data.version}`)
        break
    }
  })
  if (events[0]?.type !== 'run.started') errors.push('第一条事件应为 run.started')
  if (events.at(-1)?.type !== 'run.finished') errors.push('最后一条事件应为 run.finished')
  return errors
}
