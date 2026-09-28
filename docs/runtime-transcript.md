# 运行视图 Transcript · 对照 dsh-TUI **0.11.1**

上一版对照的是本机 `node_modules` 里的 **0.9.0**。npm 最新是 **0.11.1**（2026-09-26，仓库 [ccch1mneyyy/dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI)），引擎验证目标 **DSH 0.1.7-rc.2**。下面按 **main 源码** 写运行视图。

源：`MessageList.tsx`、`AssistantThinkingMessage.tsx`、`SubagentMessage.tsx`、`JobCard.tsx`、`subagent-projection.ts`、`agent-view.ts`、`docs/user-guide.md`。

---

## 0.11 比 0.9 多出来的（和演示有关）

| | 0.9（我上次写的） | 0.11.1 现在 |
|---|---|---|
| 行 kind | user / assistant / reasoning / tool / subagent / notice / … | 加上 **`job`**（后台任务卡） |
| 思考 | 流式默认全文，落定折成 Thinking | **流式固定 3 行 ticker**（高度不变）+ 点开全文；落定 `⚓ Thinking · 12s` |
| 子代理卡 | 跑着：头 + 当前工具 + 3 行瀑布 | 同上，头上多 **model · effort · 时长 · tok · N tools · 状态** |
| 点卡 | 打开详情场景 | 仍是详情；**Ctrl+A 子代理面板** 列本会话全部孩子，Enter 进详情 |
| 历史孩子 | 回放也会在 transcript 插卡 | **只有 LIVE 发现的才进 transcript**；历史孩子只进面板，避免回放刷屏 |
| 会话管理 | 分散 | **一个界面**：`/resume` `/home` `/agentview` `/bg` |
| Agent 总览 | 无独立折叠 | `/agentview`：`needs-input → working → failed → completed → idle → stopped`；一行摘要 **assistant > tool > prompt** |
| 工具卡延续 | — | `job` 卡与工具卡**左对齐**（是 `run_in_background` 的续行）；**子代理卡才缩进**（嵌套实体） |
| 流式正文 | 直接出字 | **smooth reveal**，落定中途不跳切 |
| 超长行 | — | 单行 >1000 字裁切，点行 / Ctrl+O 展开 |

演示要抄的是这套层次，不是鲸鱼和 TPS。

---

## dsh 主屏怎么讲一场会话

Transcript 是 **viewport**，不是打印全日志。一条 `ChatRow`：

```
❯ 用户目标                              user
⠋ 思考（固定 3 行最新推理）              reasoning  streaming
⚓ Thinking · 12s · 展开                reasoning  settled
  ● query_ring_metrics  ✓               tool
  ● 委派 C2 …                           tool (delegate)
    🟡 子代理 C2 掘进  · 12s · 4 tools  subagent   ← 缩进
    │ 当前工具 + 3 行瀑布
● 综合结论 Markdown                     assistant
```

规则（源码注释原话）：

1. **用户灰泡 `❯`，助手 `●` + Markdown。** 这两类不可点，是阅读区。
2. **思考：** 流式 = 旋转 braille + **恒高 3 行**（Kimi 风格，中途绝不撑高）；落定 = 一行锚。点一下在 ticker / 全文之间切。
3. **工具：** 状态点卡片。头永远在，args/result 默认藏；点卡或 Ctrl+O 展开。
4. **子代理：** 嵌进 transcript 的**无边框固定高度活动卡**。跑着：头 + 当前工具一行 + 3 行瀑布（每行硬裁成一行）。结束：只留头；失败多一行 error。点卡 = **打开该 Agent 的完整 transcript**，不是把工具摊开。
5. **Job：** 后台活，和工具卡对齐，不缩进。演示用不上。
6. Hover **不刷整行底色**，只把状态点提亮。
7. 钉底跟随；旧行超过 120 条折到「加载更早」。

子代理面板（Ctrl+A / `/agents`）镜像**本会话派出的全部孩子**，和 transcript 卡不是同一份：面板含历史/可续派；卡只含这场 live 派出。

`/agentview` 一行摘要优先级：最后助手正文 > 当前工具名 > 首条用户 prompt。状态：等人输入 > 工作中 > 失败 > 完成 > 空闲 > 已停。

---

## 映射到 TBM 运行视图

一次 Run = 一场 dsh 会话。Coordinator = 父 transcript。C1/C2/C6 = live 子代理卡。

```
❯ 分析 1250 环附近掘进效率下降原因     user          ← run.started.goal
── 1 联合诊断 ──                        notice        ← stage.started
⠋ Coordinator 思考（3 行）              reasoning
  ● 委派 · C2 掘进控制                  tool          ← coordinator delegate
    🟡 C2 掘进控制 · 12s · 4 tools      subagent
    │ query_ring_metrics …
  ● 委派 · C1 地质建模                  tool
    🟢 C1 地质建模 · 41s · 3 tools      subagent      ← 结束只留头+摘要
  ● 委派 · C6 渣土评估                  tool
    🟢 C6 渣土评估 · 28s · 5 tools
● 主因：1248–1249 砂泥岩交界…           assistant     ← coordinator 结论
── 阶段审核 ──                          notice
  待审 · 建议复核                       review        ← 我们加的 kind
```

点 C2 卡 → 右列（dsh 是详情场景）该 Agent 自己的 transcript：

```
❯ 请取 1246–1252 环掘进参数…            user          ← delegated.task
⠋ 思考 3 行                             reasoning
  ● 传感器数据  ✓                       tool
  ● 写入证据    ✓                       tool
● FIR 0.41→0.28 …                       assistant     ← agent.message
```

**主线禁止出现**专业 Agent 的 `query_*` / Foam API。那是 0.11 明确的「孩子不摊在父 transcript」。

`/agentview` 对应运行视图顶上一行 **参与者条**（可选，P0 可只靠卡）：

| 状态 | 对应 |
|---|---|
| needs-input | 该 Run 在 `review` |
| working | Agent `running` |
| failed | `agent.failed` / `run.failed` |
| completed | `agent.completed` |

摘要同一套：助手最后一句 > 当前工具名 > 委派 task。

---

## 行模型（camelCase）

SSE 不改。运行视图把 `RuntimeEvent[]` 投影成行。

```ts
TranscriptRow {
  id: string
  kind: 'user' | 'reasoning' | 'assistant' | 'tool' | 'subagent' | 'notice' | 'review'
  timestamp: string
  agentId?: string
  stageId?: string
  text?: string
  streaming?: boolean
  durationMs?: number
  tool?: ToolCard
  subagent?: SubagentCard
  review?: ReviewCard
}

ToolCard {
  toolId: string
  name: string
  kind: 'tool' | 'api' | 'mcp' | 'data_source'
  status: 'running' | 'completed' | 'failed'
  argsText: string
  argsFull?: unknown
  resultText?: string
  resultFull?: unknown
  errorText?: string
  durationMs?: number
}

SubagentCard {
  agentId: string
  name: string
  role: string
  task: string
  status: 'running' | 'completed' | 'failed'
  startedAt: string
  completedAt?: string
  durationMs?: number
  toolCount: number
  currentTool?: string
  currentArgsPreview?: string
  outputLines: string[]     // 最多 3，硬裁单行
  summary?: string          // 结束头旁一句
  error?: string
}

ReviewCard {
  reviewId: string
  status: 'pending' | 'approved' | 'rejected' | 'needs_data'
  reason: string
  result: string
  risk: string
  missing: string[]
  recommendation: string
  supplement?: string
}
```

### 事件 → 主线 / 子线

| RuntimeEvent | 主 transcript | 点进 Agent |
|---|---|---|
| `run.started` / `trigger.fired` | `user` = goal | |
| `stage.started` | `notice` = 阶段名 | |
| `agent.thinking` coordinator | `reasoning` | |
| `agent.thinking` 专业 | 写入该卡 `outputLines` | `reasoning` |
| `tool.called` coordinator | `tool` | |
| `tool.called` 专业 | **不进主线**；更新卡 `toolCount / currentTool / outputLines` | `tool` |
| `agent.delegated` | 插一张 live `subagent` 卡 | 第一条 `user` = task |
| `agent.message` coordinator | `assistant` | |
| `agent.message` 专业 | 更新卡 `summary` | `assistant` |
| `agent.completed` / `failed` | 卡收成一行头 | |
| `human_review.requested` | `review` | |
| `human_review.decided` | 更新 review | |
| `run.completed` | `notice` 或一条 `assistant` | |

回放历史 Run：子代理卡**要画**（演示要看见派出过谁）。这点和 dsh「resume 不刷历史卡」不同——我们没有第二次 live 派出。

---

## 页面（运行视图 `/runtime`）

```
┌ Run 选择 · 状态 · 耗时 · 模型 ──────────────────────────────┐
│ 阶段胶囊                                                     │
│ ┌ 主 transcript ─────────────┐ ┌ 点开的 Agent ─────────────┐ │
│ │ 钉底 · 行内折叠             │ │ 该 Agent 的 transcript    │ │
│ │ 子代理卡缩进                │ │ 空则「点左侧卡片」        │ │
│ └────────────────────────────┘ └───────────────────────────┘ │
│ 底栏：仅 pending / needs_data 时出现审核动作                   │
└──────────────────────────────────────────────────────────────┘
```

折叠（抄 0.11，不是抄 0.9 的「流式默认全文」）：

| 行 | 默认 | 点击 |
|---|---|---|
| user / assistant | 全文（assistant 过长折） | 无 |
| reasoning 流式 | **固定 3 行最新** | 切全文 |
| reasoning 落定 | `思考 · Ns` 一行 | 展开 |
| tool | 一行名 · 状态 · 耗时 | 展开 input/output |
| subagent 运行 | 头 + 当前工具 + 3 行瀑布 | **开右列**，不展开工具 |
| subagent 结束 | 一行头 + summary | 开右列 |
| review | 原因 + 结论一句 | 展开 risk / missing；按钮走现有 POST |

拿掉本页六个事件 tab。协同页可以留画布。

---

## 接口

P0 仍是现有：

| 方法 | 路径 |
|---|---|
| GET | `/runs?projectId=` |
| GET | `/runs/:runId` |
| GET | `/runs/:runId/events` SSE → 投影行 |
| POST | `/runs/:runId/review` |
| POST | `/runs/:runId/supplement` |

事件 `data` 见 [`api.md` 附录 C](api.md)。

P1 才加 `GET /runs/:runId/transcript?agentId=`，避免两边各写投影。

---

## 明确不抄（0.11 有、演示没有）

像素鲸、TPS、smooth reveal 光标、`/` 搜索、Ctrl+O 全局、消息选择、Job 卡、`/bg`、虚拟化 120、token 数。

第一刀：投影 + 3 行思考 + 缩进子代理卡 + 点开子 transcript。
