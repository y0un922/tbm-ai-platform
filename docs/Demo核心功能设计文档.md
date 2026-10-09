# 盾构机多智能体协同 Demo · 核心功能设计文档

**版本**：V0.5（2026-10-09）
**目标**：2 周、3 人，做出一个**真实调用大模型**、**让人一眼看出多 Agent 在协作**的诊断 Demo，用于甲方展示
**约束**：TypeScript / React / Node；Agent 运行时基于 `@earendil-works/pi-agent-core` 1.1.0；模型使用 DeepSeek V4.1 Flash；不复用现有仓库代码

| 版本 | 变更 |
|---|---|
| V0.1 | 初稿 |
| V0.2 | 针对"看不出多 Agent 协作"的反馈，重写协作机制（第 2 节）和主界面（第 3 节）；确定使用 DeepSeek V4.1 Flash |
| V0.3 | 场景数据改为公式生成，加自洽校验（第 5 节）；去掉单 Agent 对照；说明现场插话 |
| V0.4 | 新增"Agent 主动问现场"（2.5 节），列入 P0；现场插话降为后续可选 |
| V0.5 | 根据技术验证结果（第 13 节），独立研判改为背靠背；高光时刻顺序随之调整 |
| V0.6 | 完整流程录制通过（13.4 节）；D1 契约交付（14 节）；代码目录改为仓库根目录 |

---

## 1. 上一版为什么"看不出协作"

| 上一版的做法 | 观众看到的 | 问题 |
|---|---|---|
| 协调 Agent 用 `delegate` 把任务派给专业 Agent，专业 Agent 做完交回 | 一个中心不停地派活 | **星形结构**。专业 Agent 之间从来没有直接交流，看起来就是一个 Agent 在调用几个函数 |
| 专业 Agent 各查各的数据，各写各的结论 | 几份独立的报告 | 没有人引用、质疑或修正别人的观点。把任何一个 Agent 去掉，其他 Agent 的输出都不受影响 |
| 界面照搬编程 Agent 的 transcript：子 Agent 是嵌在主对话里的卡片 | 一长串思考和工具调用日志 | 突出的是**单个 Agent 内部在干什么**，而 Agent **之间**发生了什么，没有地方展示 |
| 最终结论由协调 Agent 单独写出 | 一份报告 | 看不出这份结论是多方共同形成的 |

**结论**：只把画面做漂亮解决不了问题。必须做到两点：

1. **机制上**，协作必须真实发生，而且是得出正确结论的必要条件。
2. **界面上**，默认画面展示的是 Agent **之间**的交互；单个 Agent 内部的思考和工具调用退到二级（点开才看）。

---

## 2. 协作机制设计

### 2.1 让协作成为必需：数据域隔离

现场的情况本来就是数据分散在不同系统、专业知识分散在不同人手里。Demo 如实反映这一点：

| Agent | 只能访问的数据域 | 界面表现 |
|---|---|---|
| 地质 | 地质勘察资料 | 节点背后挂一个带锁的数据源图标："仅地质可访问" |
| 掘进 | 掘进参数（速度、扭矩、推力） | 同上 |
| 刀盘 | 刀具磨损、温度监测 | 同上 |
| 渣土 | 泡沫系统、渣土实验室 | 同上 |
| 协调 | **不能访问任何数据**，只能主持会商 | 节点上标"主持" |

场景数据也按这个思路设计（第 5 节）：正确结论需要把**渣土的泡沫数据**、**掘进的速度数据**、**地质的地层数据**按时间先后对起来，再加上**刀盘的数据**来排除干扰项。任何一个 Agent 单独看，都会得出片面甚至错误的判断。

### 2.2 协作原语

专业 Agent 除了查自己的数据，还有以下协作工具。这些工具是协作在机制上真实发生的基础，每次调用都对应界面上一个可见的动作。

| 工具 | 作用 | 界面上的动作 |
|---|---|---|
| `post_finding(claim, confidence, evidence)` | 把判断发布到**共享协作板**，并广播给其他 Agent | 判断卡片出现在协作板上 |
| `ask_peer(to, question)` | **点对点**向另一个专业 Agent 提问，等对方回答 | 气泡沿连线从提问方飞向对方，回答气泡飞回 |
| `challenge(findingId, argument, evidence)` | 质疑别人的判断，必须附证据 | 两个节点之间出现红色闪电，被质疑的卡片挂上质疑条 |
| `endorse(findingId, note, evidence?)` | 赞同别人的判断，可以补充证据 | 绿色连线，卡片挂上赞同条 |
| `revise_finding(findingId, change, reason, cites)` | 修改自己的判断，并注明采纳了谁的证据 | 卡片上的置信度条动画变化，标注"因 @地质 E7 修正" |
| `sign_off(conclusionVersion, agree, note)` | 对结论草案会签：同意，或保留意见 | 节点亮起印章；如有保留意见，写入结论的"少数意见" |
| `ask_human(gap, question, options?)` | 遇到系统里没有的数据，向现场人员提问（详见 2.5 节） | 气泡飞向桌边的"现场"节点，弹出回答卡片 |

协调 Agent 不再是"派活的"，而是**会商主持人**：

| 工具 | 作用 |
|---|---|
| `open_session(topic, participants[])` | 针对一个分歧发起专项会商，指定参与者 |
| `close_session(sessionId, outcome)` | 宣布会商结果 |
| `draft_conclusion(conclusion)` | 起草结论，结论中的每条依据都必须引用协作板上的判断 |

### 2.3 会商流程

阶段的顺序由代码固定，保证演示节奏可控；阶段内的内容（问谁、问什么、质疑什么、是否修正）全部由模型决定。

| 阶段 | 发生什么 | 硬性要求（由代码检查） |
|---|---|---|
| ① 数据快照 | 代码生成快照，标出缺失项 | — |
| ② 背靠背研判 | 4 个专业 Agent **并行**、只查自己的数据，可以问现场，**不能问同伴、看不到协作板、不接收广播**，然后 `post_finding` | 每个 Agent 至少发布 1 条判断 |
| ③ 交叉互评 | 开放交流。每个 Agent 收到协作板摘要，对其他人的判断表态：赞同或质疑；无法用自己的数据直接验证时，先 `ask_peer` 追问对方再表态 | 每个 Agent 至少对 2 位同伴表态；未达到时由代码 `steer` 提醒一次 |
| ④ 专项会商 | 协调针对未解决的质疑发起会商，被质疑方须回应（坚持并补证，或修正判断），其他人可以补证 | 最多 2 轮 |
| ⑤ 结论会签 | 协调起草结论，4 位专业 Agent 会签，保留意见写入结论 | 4 位都要表态 |
| ⑥ 人工审核 | 运行暂停，等待审核 | — |

阶段②③④是协作的主体部分。其中阶段③的硬性要求保证每次运行都会出现大量点对点交互；分歧由数据中埋的歧义自然产生，不靠写死。

**为什么阶段②必须背靠背**：技术验证发现，如果独立研判阶段就允许互相提问，Agent 会在形成自己的判断之前先去问别人，结果大家在发布判断前已经统一了口径，质疑次数为 0。改成背靠背后，每位专家先基于本专业数据给出（可能片面的）判断，到阶段③再交流，分歧和质疑才自然出现。现实中专家会商也常用"先独立出意见，再集中讨论"的做法。

### 2.4 在 pi-agent-core 上的实现

**基本结构**：每个 Agent 是一个独立的 `Agent` 实例，在同一个 Node 进程内运行。新增一个 **CollabHub**（协作中枢）负责协作板存储、消息路由和事件发出。

```ts
const agent = new Agent({
  initialState: {
    systemPrompt: ROLE_PROMPTS.muck,
    model: models.getModel('deepseek', 'deepseek-flash'),   // DeepSeek V4.1 Flash
    thinkingLevel: 'low',                                    // 该模型只支持 low / high / max
    tools: [...domainTools.muck, ...collabTools('muck', hub)],
  },
  streamFn: models.streamSimple.bind(models),
  beforeToolCall: hub.guard('muck'),      // 证据校验、预算、阶段权限
})
agent.subscribe((e) => bridge(runId, 'muck', e))
```

**消息怎么送到对方手里**：

| 场景 | 做法 |
|---|---|
| 广播（发布判断、质疑、赞同） | 对方正在运行时，用 `agent.steer()` 注入一条"[协作板] 渣土 质疑了你的 F2：……"，对方在下一轮看到；对方空闲时，存入待办，在下一阶段的提示里一并带上 |
| 点对点提问 `ask_peer` | 不阻塞被问方。CollabHub 用被问方当前的上下文（`agent.state.messages` 快照）临时创建一个"应答分身"来回答，回答作为工具结果返回给提问方；同时把这组问答 `steer` 进被问方原实例，让它知道自己回答过什么。这样可以避免两个 Agent 互相等待造成死锁 |
| 被质疑方必须回应 | 质疑写入对方待办；阶段④开始时，协调发起会商，被质疑方收到 prompt 后必须调用 `revise_finding` 或带新证据的 `endorse`（坚持原判断） |

**防止编造证据**：`beforeToolCall` 检查所有引用的证据编号，必须是本轮真实工具调用产生的结果；`revise_finding` 的 `cites` 必须是其他 Agent 的证据或判断。不满足条件时拒绝执行，并告诉模型原因。

---

### 2.5 人机协作：Agent 主动问现场

**要解决的问题**：有些关键信息不在任何系统里，只有现场人员知道，比如出土口看起来干不干、最近有没有开仓检查过刀具。专业 Agent 发现这类缺口时，主动向现场提问。

**机制**（工具执行时挂起等待，与 Claude Code 的 AskUserQuestion 原理相同）：

1. 专业 Agent 调用 `ask_human(gap, question, options?)`。`gap` 必须从数据快照的缺失项或自己判断中的 `missing` 里选，`beforeToolCall` 会校验，防止 Agent 随便问。
2. CollabHub 登记一个待回答的问题，发出 `human.asked`，工具的 `execute` 挂起等待。**只有提问的 Agent 在等，其他 Agent 照常工作**；等待时间不计入该 Agent 的阶段预算。
3. 现场人员在页面上回答（可以直接点选项，也可以自由输入），前端调用 `POST /answer`。
4. 回答登记为一条**现场证据**（编号 H1、H2…，来源标为"现场确认"），作为工具结果返回给提问的 Agent，同时广播给其他 Agent，大家都可以引用。
5. 90 秒内无人回答时，工具返回"现场未回复，按缺失处理"，流程继续。

**限制**：每个 Agent 每次运行最多问 1 次，全队最多 2 次，避免演示被问题打断太多次。

**本场景里最可能出现的问题和准备好的回答**（都与第 5 节的数据一致）：

| 可能的提问方 | 缺口 | 准备好的回答 |
|---|---|---|
| 渣土 | 520–525 环没有渣土取样 | "521 环以后出土明显偏干，有结块，螺旋机出土不太顺。" |
| 刀盘 | 没有开仓检查记录 | "510 环开仓检查过，刀具正常，没有更换。" |
| 掘进 / 渣土 | 泡沫泵运行情况 | "泡沫泵 518 环左右报过一次流量低，当班没处理。" |

演示前把这几条回答打印成话术卡，交给负责回答的人。如果 Agent 问的问题不在卡片上，就回答"不清楚"。回答"不清楚"本身也是合理的结果，会被记为缺失项。

## 3. UI 设计：圆桌会商指挥舱

### 3.1 设计原则

1. **默认画面只展示 Agent 之间的事**：谁问了谁、谁质疑了谁、谁因为谁改了观点。单个 Agent 的思考过程和工具调用，点击节点后在抽屉里查看。
2. **用"专家会商"做隐喻**：甲方熟悉专家开会会商，不熟悉"编排""子代理"这类说法。
3. **协作要能计数**：顶栏实时显示点对点消息、质疑、观点修正、跨专业引用的数量，用数字直接回应"看不出协作"。
4. **共识是逐步形成的**：画布中央的"共识区"随着赞同增多逐步填满，最终的结论就在这里成形。

### 3.2 参考的开源范式（2026 年近期热门）

| 项目 | 时间 / 热度 | 借鉴点 |
|---|---|---|
| [tldraw Fairydraw](https://tldraw.dev/blog/harnessing-the-agents)（[AI Engineer 演讲](https://x.com/aiDotEngineer/status/2050243598676013312)） | 2026.5 | 多个 Agent 在**共享空间**里工作，彼此能看到对方的动作；用动画表示状态，不靠读日志。是"协作板 + 画布"的主要参考 |
| [Hermes Agent Kanban](https://x.com/NousResearch/status/2050997692977844324) | 2026.5 | Agent 在共享看板上认领任务、阻塞时交接，协作通过看板可见 |
| [Mohano](https://hulryung.github.io/mohano/) | 2026.2 | 泳道时间线，跨泳道的箭头表示 Agent 间交互。用于底部的协作时序 |
| [CanvasTTY](https://x.com/monokern/status/2091643463305765365) / [49Agents](https://x.com/so_sthbryan/status/2053260477564604753) | 2026.8 / 2026.5 | 用无限画布代替聊天窗，Agent 是画布上的节点 |
| [DeerFlow 2.0](https://github.com/bytedance/deer-flow) | 8 万+ star | 子 Agent 卡片显示模型、token、状态。用于节点卡片 |
| [Vercel AI Elements](https://elements.ai-sdk.dev/) | 2026.8 更新 | Reasoning / Tool / Shimmer 组件，用于节点详情抽屉 |
| [React Flow](https://reactflow.dev/ui/templates/workflow-editor) + [Animated SVG Edge](https://reactflow.dev/ui/components/animated-svg-edge) | 2026.8 | 沿连线移动的元素，用来实现消息气泡在 Agent 之间飞行 |
| [AG-UI 1.0](https://www.copilotkit.ai/blog/ag-ui-1.0) | 2026.9 | Agent→UI 事件协议，用作事件命名参考 |
| [Pixel Agents](https://marketplace.visualstudio.com/items?itemName=pablodelucca.pixel-agents) | 8.7 万安装 | **不采用**整体风格（偏游戏），只借鉴"用动作表达状态"的思路 |

### 3.3 主屏布局

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ TBM-01 · 环 521–540 推进速度↓35%   ●快照 ●独立研判 ◐交叉互评 ○专项会商 ○会签 ○审核  ⏱ 03:12 │
│ 协作  点对点消息 14 │ 追问 5 │ 质疑 2 │ 观点修正 2 │ 跨专业引用 9 │ 会签 0/4               │
├────────────────────────────────────────────────────┬─────────────────────────────────────┤
│                   圆桌会商画布                        │ [协作板]  [会商记录]                  │
│                    ┌──────┐                         │                                     │
│                    │ 协调 │ 主持                     │ ┌ F2 掘进 · 刀具磨损致扭矩上升 ────┐ │
│                    └──────┘                         │ │ 置信度 ▓▓▓▓▓▓░░░ 0.6 → ▓▓░ 0.3  │ │
│   🔒地质资料                         🔒刀盘监测       │ │ ⚡ 渣土 质疑：FIR 在 518 环就先降 │ │
│      ┌──────┐   💬"525环起含砂卵石"   ┌──────┐       │ │    了 [E4]                       │ │
│      │ 地质 │ ◀━━━━━━━━━━━━━━━━━━━━ │ 刀盘 │       │ │ ✓ 刀盘 补证：磨损量正常 [E9]      │ │
│      └──────┘  ╲   ┌──────────┐  ╱  └──────┘       │ │ ↻ 掘进 修正：采纳 E4、E9，改为次因 │ │
│           ┃     ╲  │  共识区  │ ╱      ┃           │ └─────────────────────────────────┘ │
│           ┃      ╲ │ ▓▓▓▓░░░░ │╱       ┃           │ ┌ F3 渣土 · 渣土改良不足 0.7→0.85 ┐ │
│      ┌──────┐      └──────────┘      ┌──────┐       │ │ ✓ 地质 赞同：地层变化晚于速度下降 │ │
│      │ 掘进 │ ━━━━━━━━━⚡━━━━━━━━━━ │ 渣土 │       │ │ ✓ 掘进 赞同 [E2]                 │ │
│      └──────┘                        └──────┘       │ └─────────────────────────────────┘ │
│   🔒掘进参数                       🔒泡沫/实验室     │                                     │
├────────────────────────────────────────────────────┴─────────────────────────────────────┤
│ 协作时序   协调 ●──────────────────────────────●会商──────────────────●起草──            │
│            地质 ──▇查▇──●发布───────●赞同F3──────────────────────────●签                 │
│            掘进 ──▇查▇▇──●发布──?问地质─────────────↻修正F2────────────●签                 │
│            刀盘 ──▇查▇──●发布─────────────────────●补证──────────────●签                 │
│            渣土 ──▇查▇▇▇──●发布──⚡质疑F2─────────────────────────────●签                 │
│                         （跨泳道箭头连接提问方与被问方）                                     │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

| 区域 | 内容 | 交互 |
|---|---|---|
| 顶栏第一行 | 事件、6 个阶段、计时 | — |
| 顶栏第二行 | **协作计数器**，每次增加时数字跳动 | 点击某项，筛选出对应的交互 |
| 中央画布 | 协调在桌首主持，4 位专业 Agent 围坐，各自背后是只有自己能访问的数据源（带锁图标）。桌尾有一个白色的"现场"节点，平时是暗的，有人问它时才亮起。专业 Agent 之间的连线一开始不存在，**随交互逐渐长出来**，线越粗表示交流越多。桌子中央是共识区 | 点击节点，打开该 Agent 的详情抽屉；点击连线，查看两者之间的全部对话 |
| 右栏：协作板 | 每条判断是一张卡片，下面挂着别人的反应（追问 / 质疑 / 赞同 / 补证）和本人的修正记录，置信度变化用动画表示 | 点击证据编号，查看原始数据 |
| 右栏：会商记录 | 群聊形式，所有 Agent 间的消息按时间排列，带 @ 提及。给想逐句阅读的观众看 | — |
| 底栏：协作时序 | 每个 Agent 一条泳道，跨泳道箭头表示谁对谁说了话 | 点击箭头，画布和右栏定位到对应时刻 |
| 现场回答卡片 | Agent 向现场提问时，从画布底部升起：显示谁在问、为什么问（缺什么数据）、问题本身、选项按钮和输入框。提问的 Agent 节点外圈变成虚线等待环，其他节点照常工作 | 点选项或输入后提交 |
| 节点详情抽屉（二级） | 该 Agent 的流式思考、工具调用卡片（内嵌迷你图）、提交过的判断 | 从右侧滑出，不遮挡画布中央 |

**视觉风格**：工业控制室深色主题（石墨 / 深海军蓝 + 细网格），按 1920×1080 投影设计。每个 Agent 一个固定角色色：协调为青色，地质为琥珀色，掘进为蓝色，刀盘为紫色，渣土为绿色，质疑为红色，人为白色。动画只用在正在发生的交互上。

### 3.4 六个高光时刻

顺序与会商流程一致。画面中的台词都取自技术验证中模型真实生成的内容，正式演示时每次的具体措辞会不同。

| # | 时刻 | 所在阶段 | 画面 |
|---|---|---|---|
| ① | **背靠背取证** | ② | 4 个节点同时亮起，各自连到自己带锁的数据源，粒子流动，彼此之间还没有任何连线。画外音："每位专家先只看自己系统里的数据，独立给出判断。" |
| ② | **问现场** | ② | 渣土发现泡沫原液流量在 518 环骤降，但系统里查不到原因，气泡飞向桌尾的"现场"节点。现场回答卡片升起，演示者点选"泡沫泵 518 环左右报过一次流量低，当班没处理"。回答作为证据 H1 出现在协作板上 |
| ③ | **点对点追问** | ③ | 交流开放后，专家之间的连线开始长出来。掘进冒出气泡："@渣土 泡沫泵 518 环就坏了，为什么 518–520 环速度还正常，滞后 3 环才下降？"渣土用数据回答。**这些都是不经过协调的连线** |
| ④ | **质疑** | ③ | 地质在背靠背阶段把地层变化当成主因，三位同伴先后发出红色闪电："降速始于 521 环，地层界面在 525 环，晚了 4 环。"协作板上地质的卡片挂上三条质疑 |
| ⑤ | **改口** | ③④ | 地质的卡片置信度下降，从"主因"改为"次因"，标注"因 @掘进 E2、@渣土 E3 修正"。掘进也从"岩体变硬"改判为"渣土改良失效"，并引用现场证据 H1 |
| ⑥ | **共识与会签** | ⑤ | 赞同的判断飞入中央共识区，结论在共识区成形；4 位专家依次亮起印章会签。随后用 10 秒**快进回放本次协作网络**：连线从无到有，最后织成一张网 |

### 3.5 第二屏：结论与协作溯源

| 区域 | 内容 |
|---|---|
| 左：结论报告 | 主因、次因、已排除因素、建议措施、待补数据、少数意见。每句话后面带角标，标明出自哪几位专家 |
| 右：协作溯源图 | 结论 → 判断 → 质疑 / 赞同 / 修正 → 证据 → 数据源。会**明确标出**：主因结论用到了渣土、掘进、地质三方的证据，刀盘负责排除干扰项。也就是说，这个结论任何一个 Agent 单独都得不出来 |
| 下：审核栏 | 批准 / 驳回 / 要求补充，审核记录绑定结论版本号 |

### 3.6 前端技术选型

| 用途 | 选型 |
|---|---|
| 框架 | React 19 + Vite + TypeScript |
| 样式 / 组件 | Tailwind v4 + shadcn/ui |
| 画布 / 溯源图 | `@xyflow/react` 12（圆桌布局用固定坐标，溯源图用 `elkjs`），Animated SVG Edge 实现气泡飞行 |
| 动效 | `motion` |
| 详情抽屉中的思考 / 工具展示 | 拷贝 AI Elements 的 Reasoning / Tool / Shimmer 源码，改为由自有事件驱动 |
| 图表 | Recharts |
| 实时通道 | 原生 `EventSource`（SSE） |

---

## 4. 事件协议（前后端契约，D1 冻结）

放在 `packages/shared/events.ts`，前后端共用。命名参考 AG-UI 1.0 的分类。

```ts
type AgentId = 'coordinator' | 'geology' | 'boring' | 'cutter' | 'muck' | 'human'
type Stage = 'snapshot' | 'solo' | 'review' | 'session' | 'signoff' | 'approval' | 'closed'

interface Envelope<T extends string, D> { seq: number; ts: number; runId: string; type: T; data: D }

type RunEvent =
  // 运行与阶段
  | Envelope<'run.started',       { scenarioId: string; question: string; model: string }>
  | Envelope<'stage.changed',     { stage: Stage; reason?: 'normal' | 'timeout' }>
  | Envelope<'snapshot.created',  { rings: [number, number]; series: SeriesRef[]; missing: string[] }>
  // 单个 Agent 内部（二级视图用）
  | Envelope<'agent.status',      { agentId: AgentId; status: 'idle' | 'thinking' | 'tool' | 'waiting' | 'done' | 'error' }>
  | Envelope<'agent.delta',       { agentId: AgentId; kind: 'thinking' | 'text'; delta: string }>
  | Envelope<'tool.started',      { agentId: AgentId; callId: string; tool: string; label: string; args: unknown }>
  | Envelope<'tool.finished',     { agentId: AgentId; callId: string; evidenceId?: string; summary: string; chart?: ChartSpec; isError: boolean }>
  // Agent 之间（主画面用）
  | Envelope<'peer.message',      PeerMessage>
  | Envelope<'finding.posted',    { finding: Finding }>
  | Envelope<'finding.revised',   { findingId: string; before: FindingCore; after: FindingCore; reason: string; cites: string[] }>
  | Envelope<'human.asked',       { questionId: string; agentId: AgentId; gap: string; question: string; options?: string[] }>
  | Envelope<'human.answered',    { questionId: string; evidenceId: string; text: string } | { questionId: string; timeout: true }>
  | Envelope<'session.opened',    { sessionId: string; topic: string; participants: AgentId[] }>
  | Envelope<'session.closed',    { sessionId: string; outcome: string }>
  | Envelope<'conclusion.drafted',{ version: number; conclusion: Conclusion }>
  | Envelope<'signoff.submitted', { agentId: AgentId; version: number; agree: boolean; note?: string }>
  | Envelope<'review.decided',    { version: number; decision: 'approve' | 'reject' | 'revise'; comment?: string }>
  // 统计
  | Envelope<'collab.stats',      CollabStats>
  | Envelope<'usage.updated',     { agentId: AgentId; inputTokens: number; outputTokens: number }>
  | Envelope<'run.finished',      { status: 'completed' | 'failed' | 'aborted'; error?: string }>

interface PeerMessage {
  id: string
  from: AgentId
  to: AgentId | 'all'
  kind: 'ask' | 'answer' | 'challenge' | 'endorse' | 'defend' | 'broadcast'
  brief: string          // ≤ 30 字，用于画布气泡
  text: string           // 全文，用于会商记录
  refs: string[]         // 关联的判断 F* 或证据 E*
  replyTo?: string
}

interface FindingCore { claim: string; confidence: number; role: 'primary' | 'secondary' | 'ruled_out' | 'open' }
interface Finding extends FindingCore {
  id: string; agentId: AgentId
  supports: string[]; against: string[]; missing: string[]
}

interface CollabStats {
  peerMessages: number; asks: number; challenges: number
  revisions: number; crossCitations: number; signoffs: number; humanAsks: number
}
```

- SSE 使用 `id: seq`，断线重连时按 `Last-Event-ID` 从内存日志补发，刷新页面后能恢复画面。
- `agent.delta` 由服务端每 50 ms 合并推送一次。
- 前端用一个 reducer 把事件归约成 `ViewState`，各区域都从它派生。快进回放就是把同一份事件日志按 20 倍速重新喂给 reducer。

### 4.1 REST 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 预检：DeepSeek 连通性、首 token 延迟、5 路并发是否正常 |
| POST | `/api/runs` | `{ scenarioId, question }` → `{ runId }` |
| GET | `/api/runs/:id/events` | SSE |
| GET | `/api/runs/:id/evidence/:eid` | 证据原始数据 |
| POST | `/api/runs/:id/review` | `{ version, decision, comment }` |
| POST | `/api/runs/:id/answer` | `{ questionId, text }`，回答 Agent 向现场提出的问题 |
| GET | `/api/data/rings?from&to` | 参数曲线 |

---

## 5. 场景与数据设计

### 5.1 原则：数据由公式生成，保证自洽

团队里没有盾构专业背景，所以数据**不靠手填**。B 写一个生成脚本，所有数值都从下面的公式和少量"故障设定"推算出来，再用校验脚本检查。这样无论 Agent 从哪个数据域、用哪种方式去交叉核对，数字都对得上。

数值取的是 6 m 级土压平衡盾构（地铁常见规格）的常见量级，只保证内部自洽，不代表某台真实设备。

**场景**：TBM-01 当前掘进到第 540 环，从 521 环起推进速度明显下降。数据快照范围是 500–540 环。

### 5.2 参数说明与计算关系

| 参数 | 白话解释 | 取值 / 公式 |
|---|---|---|
| 刀盘直径 D | 盾构机切削面的直径 | 6.28 m，开挖面积 A = π(D/2)² ≈ 30.97 m² |
| 环宽 | 每掘进一环前进的距离（一环 = 一圈管片） | 1.5 m |
| 推进速度 v | 盾构机每分钟前进多少 | mm/min，见故障设定 |
| 刀盘转速 n | 刀盘每分钟转几圈 | 恒定 1.5 rpm |
| 贯入度 p | 刀盘每转一圈切进土里多深 | p = v / n（mm/r） |
| 单环掘进时间 | 掘进一环要多久 | 1500 / v（分钟），另加 40 分钟拼装管片，用于推算每环的时间戳 |
| 出土量 Q | 每分钟挖出多少土 | Q = A × v / 1000（m³/min） |
| 泡沫原液流量 | 泡沫泵每分钟打出的液体量 | L/min，见故障设定 |
| 发泡倍率 FER | 1 L 原液能发出多少泡沫 | 恒定 10 |
| 泡沫注入率 FIR | 泡沫量占出土量的比例，越低说明渣土越"干" | FIR = 原液流量 × FER / 1000 / Q |
| 坍落度 | 实验室测的渣土稀稠程度，越低越干 | 正常 150–200 mm |
| 刀盘扭矩、总推力 | 转动刀盘、向前顶进需要的力 | 正常值加故障设定的增幅，叠加 ±2% 随机波动 |
| 刀具磨损速率 | 每掘进一环刀具磨掉多少 | mm/环，报警阈值 0.08 |

### 5.3 故障设定（数据的"剧本"，只有这几条是人为设定的）

| # | 设定 | 从哪环开始 | 影响 |
|---|---|---|---|
| S1 | 泡沫泵故障，原液流量从 64 L/min 降到 25 L/min | **518** | FIR 立即下降 |
| S2 | 渣土变干后，土仓里的旧渣土要 2–3 环才被置换完，所以掘进受影响有滞后 | 521 | 推进速度 52 → 40 mm/min（-23%）；扭矩逐步升至 +20%，推力 +15% |
| S3 | 地层由粉质黏土过渡到含砂卵石，卵石含量从 10% 逐环升到 35% | **525** | 推进速度再降到 34 mm/min（累计 -35%）；刀具磨损速率从 0.02 升到 0.03 mm/环（仍远低于阈值） |
| S4 | 渣土实验室只在 519、526、533 环取过样 | — | 其余环没有坍落度数据，作为缺失项 |

### 5.4 推算结果（生成脚本的输出应与此一致）

| 环号 | 推进速度 | 贯入度 | 单环时间 | 原液流量 | FIR | 扭矩 | 坍落度 | 地层 | 刀具磨损速率 |
|---|---|---|---|---|---|---|---|---|---|
| 500–517 | 52 | 34.7 | 28.8 min | 64 | 39.7% | 3200 kN·m | 无取样 | 粉质黏土 | 0.02 |
| 518–520 | 52 | 34.7 | 28.8 min | 25 | **15.5%** | 3200→3400 | 519 环：95 | 粉质黏土 | 0.02 |
| 521–524 | 40 | 26.7 | 37.5 min | 25 | 20.2% | 3600→3840 | — | 粉质黏土 | 0.02 |
| 525–540 | 34 | 22.7 | 44.1 min | 25 | 23.7% | 3840 | 526 环：75；533 环：80 | 粉质黏土夹卵石 → 含砂卵石 | 0.03 |

注意 FIR 在 521 环之后反而略有回升：泵流量没变，但速度变慢、出土量变少，比例就上去了。这是公式自然推出的结果，正好可以测试 Agent 会不会被这个"回升"误导，有没有回到原液流量去看。

### 5.5 各 Agent 单看与合起来看

| 数据域（所属 Agent） | 单看会怎么判断 | 合起来看 |
|---|---|---|
| 掘进参数（掘进） | 扭矩上升，**怀疑刀具磨损** | 速度分两段下降：521 环一次、525 环一次 |
| 泡沫系统 + 渣土实验室（渣土） | 泵流量和 FIR 在 518 环骤降，渣土偏干 | **518 早于 521**，与第一段下降对得上，是主因 |
| 地质资料（地质） | 525 环起出现卵石，**可能认为地层是主因** | **525 晚于 521**，只解释第二段下降，是次因 |
| 刀盘监测（刀盘） | 磨损速率略有上升，但远低于阈值 | 排除刀具磨损，也印证了卵石地层的存在 |

**参考答案**（只用于自测，不给模型看）：主因是泡沫泵故障导致渣土改良不足；次因是 525 环起地层进入含砂卵石层，加剧了下降；排除刀具磨损。建议检修泡沫泵并恢复原液流量，针对卵石地层上调 FIR，并加密渣土取样。

这样会自然出现两组分歧：掘进（刀具磨损）对渣土（泡沫），地质（地层）对渣土（时间先后）。

### 5.6 自洽校验（`npm run check:data`）

生成脚本跑完后，校验脚本逐项断言：

1. 每一环都满足 p = v / n、Q = A × v、FIR = 原液流量 × FER / Q，误差不超过 1%（随机波动只加在扭矩和推力上）。
2. 每环的时间戳由单环时间加拼装时间累加而来，严格递增；各数据域中同一环的时间戳一致。
3. 各数据域的环号范围相同（500–540），没有空洞；只有坍落度按 S4 缺失。
4. 关键先后关系成立：泵流量骤降环（518）< 速度第一次下降环（521）< 地层变化环（525）。
5. 刀具磨损速率所有环都低于报警阈值。
6. 参考答案中的每一条结论，都能由至少一条具体数据支撑（脚本里写死对应关系逐条检查）。

### 5.7 工具清单

| Agent | 数据工具 | 协作工具 |
|---|---|---|
| 地质 | `query_geology` | `post_finding` `ask_peer` `challenge` `endorse` `revise_finding` `sign_off` |
| 掘进 | `query_ring_metrics` | 同上 |
| 刀盘 | `query_cutter_wear` | 同上 |
| 渣土 | `query_foam` `query_muck_lab` | 同上 |
| 协调 | 无 | `open_session` `close_session` `draft_conclusion` |

数据工具的返回都包含 `summary`（给模型看）、`chart`（给前端画迷你图）、`rows`（原始数据，登记为证据）。

### 5.8 运行预算

| 项 | 上限 | 超出时 |
|---|---|---|
| 单个 Agent 每个阶段 | 6 轮 / 60 秒 | 要求立即发布或表态；仍不响应就标记超时，流程继续 |
| `ask_peer` 单次 | 30 秒 | 返回"对方未及时回答" |
| 专项会商 | 2 轮 | 未解决的分歧作为少数意见写入结论 |
| 整轮运行（不含审核） | 5 分钟 | 用已有判断起草结论，并注明未完成的部分 |

---

## 6. 模型配置：DeepSeek V4.1 Flash

| 项 | 配置 |
|---|---|
| pi-ai provider | `deepseek`（内置，走 OpenAI 兼容接口，`https://api.deepseek.com`） |
| 模型 id | `deepseek-flash`（pi-ai 目录中名为 "DeepSeek V4.1 Flash"） |
| 凭证 | 环境变量 `DEEPSEEK_API_KEY`，不进仓库 |
| 思考等级 | `low`。该模型在 pi-ai 中只映射了 low / high / max，`minimal` 和 `medium` 不可用 |
| 备用通道 | 同一模型在 OpenRouter / Fireworks 上也有部署，预先配好一个，`/health` 失败时切换 |
| 实测（第 13 节） | 5 路并发无限流；首 token 约 0.8 秒；单次带工具调用的回答 2–3 秒；工具调用 10/10 成功 |

---

## 7. 三人分工

| 角色 | 交付物 |
|---|---|
| **A 前端** | 圆桌会商画布（节点、连线生长、气泡飞行、共识区）、协作板、会商记录、协作时序、协作计数器、节点详情抽屉、结论与协作溯源页、审核、快进回放；开发期用手写的 `sample-run.jsonl` 脱离后端开发 |
| **B 后端** | **场景数据生成脚本与自洽校验（第 5 节）**、Server 骨架、RunManager 阶段机与预算、EventBus（内存日志 + JSONL + SSE 断线补发）、**CollabHub 的基础设施**（协作板存储、消息路由、待办队列、证据登记表、`collab.stats` 统计）、DataService 与场景数据集、REST 接口、`/health`、演示机部署 |
| **C Agent** | 5 个角色的提示词、数据工具与协作工具的 TypeBox 定义、pi-agent-core 接入与事件桥接、**协作语义**（广播注入、`ask_peer` 应答分身、`ask_human` 挂起等待、质疑后必须回应、会签）、阶段硬性要求的检查、DeepSeek 调参、批量稳定性测试 |

**B 与 C 的边界**：CollabHub 拆成两层。B 负责"存储和投递"（数据结构、队列、事件发出，不涉及模型）；C 负责"何时投递、投递什么内容、Agent 如何回应"（涉及提示词和 Agent 实例）。接口是 `hub.post / hub.route / hub.pending(agentId) / hub.onMessage`，在 D1 定下来。

### 7.1 两周排期

| 天 | A 前端 | B 后端 | C Agent | 检查点 |
|---|---|---|---|---|
| D1 | 共同：冻结事件协议、CollabHub 接口；手写 `sample-run.jsonl`（包含完整的协作过程） | | | 契约合入 |
| D2 | 脚手架、主题、reducer | Server、SSE、EventBus | DeepSeek 接入实测（并发、工具调用）；单个专业 Agent 跑通 | 模型实测报告 |
| D3 | 圆桌画布、节点状态、连线生长 | 数据生成脚本 + `check:data` 通过、数据工具接口、证据登记表 | 4 个专业 Agent + `post_finding`，阶段②并行跑通 | |
| D4 | 协作板卡片、气泡飞行 | CollabHub 存储与路由、阶段机 | `ask_peer` 应答分身、广播注入 | |
| D5 | **联调 M1**：真实运行中出现点对点追问，并在画布上正确显示 | | | M1 |
| D6 | 质疑 / 修正动画、协作计数器、协作时序 | 待办队列、`collab.stats`、断线补发 | 阶段③互评 + 硬性要求检查、`challenge` / `revise_finding` | |
| D7 | 共识区、会签印章、会商记录 | 审核接口、证据查询、`/health` | 阶段④专项会商、阶段⑤起草与会签 | |
| D8 | 结论与协作溯源页、详情抽屉、快进回放、现场回答卡片 | `/answer` 接口、待回答问题与超时、现场证据登记 | `ask_human` 工具与提示词；批量跑 10 次，统计协作指标和正确率，调提示词 | |
| D9 | **完整彩排 ×3**，按问题清单修复 | | | M2 |
| D10 | 视觉打磨 | 演示机部署、备用通道配置 | 最终 10 次稳定性测试 | 冻结 |

---

## 8. 验收标准

### 8.1 协作可见性（本次的重点）

| 指标 | 标准（每次运行） | 测法 |
|---|---|---|
| 点对点消息 | ≥ 8 条不经过协调的 Agent 间消息 | 统计 `peer.message` 中 from/to 都是专业 Agent 的条数 |
| 质疑 | ≥ 1 次（10 次运行中 ≥ 8 次达到 2 次以上） | `challenge` 计数 |
| 观点修正 | ≥ 1 次修正，且引用了其他 Agent 的证据 | `finding.revised` 的 `cites` |
| 结论的协作性 | 主因结论引用 ≥ 3 位不同专业 Agent 的证据 | 结论证据来源去重 |
| 会签 | 4 位全部表态 | `signoff.submitted` |
| 问现场 | 10 次运行中 ≥ 8 次至少出现 1 次 `ask_human`，且提问对应真实的数据缺口 | `human.asked` 的 `gap` |
| 现场证据被引用 | 出现问现场的运行中，H 编号的证据被提问方以外的 Agent 引用 ≥ 1 次 | 引用统计 |
| 门外汉测试 | 找 2 位没参与项目的同事看一遍，问他们"这些 Agent 之间发生了什么"，能说出"互相提问、有人质疑、有人改口"三者中的至少两者 | D9 彩排时做 |

### 8.2 运行质量

| 指标 | 标准 |
|---|---|
| 成功率 | 连续 10 次真实运行 ≥ 9 次走完全部阶段 |
| 正确率 | 10 次中 ≥ 8 次主因判为渣土改良不足，并排除刀具磨损 |
| 时长 | 不含审核 ≤ 5 分钟；点击后 3 秒内画面开始动 |
| 证据真实 | 结论中的证据编号 100% 能打开原始数据 |
| 刷新恢复 | 运行中刷新，3 秒内恢复画面 |
| 画面 | 1920×1080 投影无溢出、动画不卡顿 |

---

## 9. 演示脚本（约 8 分钟）

1. **（1 分钟）开场**：先说清楚前提——"掘进参数、泡沫系统、地质资料、刀盘监测分别在四个系统里，没有任何一位专家能单独看全。"画面上每位专家背后的带锁数据源印证这一点。点击"开始会商"。
2. **（1 分钟）背靠背取证**：高光 ①。
3. **（1 分钟）问现场**：高光 ②。由我方一人按话术卡回答。顺带说明："系统里没有的信息，专家会主动来问现场的人。"
4. **（3 分钟）互评与质疑**：高光 ③④⑤。重点讲某位专家是怎么被同伴的证据说服、当场改口的，同时指着顶栏的协作计数器。
5. **（1 分钟）共识与会签**：高光 ⑤，快进回放协作网络。
6. **（1 分钟）溯源与审核**：切换到第二屏，指出主因结论用到了三方的证据，点一条证据追到原始数据，然后审核批准。
7. **收尾**：平台只给建议、不控制设备，后续可以接入甲方真实的数据和算法。

---

## 10. 风险与应对

| 风险 | 应对 |
|---|---|
| 模型"太客气"，只赞同不质疑 | 提示词要求每位专家"以本专业数据为准，发现与本专业数据矛盾的判断必须质疑"；数据中埋了明确的矛盾点；批量测试中统计质疑率并持续调整 |
| Agent 没有问现场，或者问了话术卡以外的问题 | 提示词说明"关键判断依赖缺失数据时，向现场提问一次"；`gap` 只能从缺失项中选，问题范围可以预料；话术卡外的问题统一回答"不清楚" |
| 交互太多导致超时 | 每个阶段都有上限；`ask_peer` 每个 Agent 每阶段最多 2 次 |
| 并发触发 DeepSeek 限流 | D2 实测；必要时把应答分身改为排队执行 |
| 现场网络或模型不可用 | 演示机用独立热点；开场前跑 `/health` 和一轮完整预热；预先配好备用通道 |
| 广播注入导致上下文膨胀 | 广播只注入 brief 加编号，需要全文时由 Agent 自己查协作板（提供 `read_board` 工具） |

所有运行的事件都写入 JSONL。这份日志用于刷新恢复、快进回放、事后复盘，开发期也用它驱动前端。

---

## 11. 目录结构

```
（仓库根目录）
├─ packages/shared/        events.ts、领域类型、CollabHub 接口
├─ server/
│  ├─ src/run/             RunManager、阶段机、预算              (B)
│  ├─ src/bus/             EventBus、SSE、JSONL                  (B)
│  ├─ src/collab/hub.ts    协作板存储、路由、待办、统计           (B)
│  ├─ src/collab/protocol/ 广播注入、应答分身、会商、会签          (C)
│  ├─ src/data/            场景数据集、DataService、证据登记      (B)
│  ├─ src/agents/          角色提示词、Agent 工厂、事件桥接        (C)
│  ├─ src/tools/           数据工具与协作工具                     (C)
│  └─ scripts/batch-run.ts 批量测试：协作指标 + 正确率             (C)
└─ web/
   ├─ src/state/           reducer、useRunEvents、回放            (A)
   ├─ src/roundtable/      圆桌画布、气泡、共识区                  (A)
   ├─ src/board/           协作板、会商记录                        (A)
   ├─ src/timeline/        协作时序                               (A)
   ├─ src/trace/           结论与协作溯源页                        (A)
   └─ dev/sample-run.jsonl 开发用事件样本                          (A+C)
```

---

## 12. 后续可选：现场插话（steering）

和 2.5 节方向相反：不等 Agent 来问，现场人员主动打一句话发进会商，例如"518 环那天早班换过泡沫泵滤网"。实现上用 pi-agent-core 的 `agent.steer()`，把这句话发给所有正在运行的专业 Agent，它们在下一轮回应；已经跑完的 Agent 用 `followUp()` 或在下一阶段的提示中带上。

这个功能更偏向演示效果（证明不是录好的），实际使用中，现场人员一般不会盯着会商随时插话，所以本期不做。如果 D9 彩排后还有余量，再用约 1 人天加上：一个 `POST /steer` 接口，复用"现场"节点和输入框。

---

## 13. 技术验证结果（2026-10-09）

验证脚本在 `server/spike/`，使用真实的 DeepSeek V4.1 Flash 和第 5 节的场景数据。

### 13.1 并发（`npm run spike:concurrency`）

5 个 Agent 同时运行，每个都调用一次查询工具，跑了 2 轮：

| 指标 | 结果 |
|---|---|
| 限流 / 报错 | 无 |
| 首 token | 0.67–1.16 秒 |
| 单个 Agent 完成 | 2.3–3.2 秒 |
| 工具调用 | 10/10 成功 |

### 13.2 协作（`npm run spike:debate`）

精简版会商：背靠背研判 → 交叉互评 → 回应质疑 → 协调起草结论（不含专项会商和会签）。共跑 6 次：

| 版本 | 次数 | 点对点追问 | 问现场 | 质疑 | 赞同 | 改口（引用他人证据） | 用时 | 结论正确 |
|---|---|---|---|---|---|---|---|---|
| 研判阶段允许互相提问 | 1 | 11 | 2 | **0** | 18 | 3 | 78 秒 | 是 |
| 背靠背 | 3 | 0 | 0–2 | 2–5 | 9 | 3–5 | 51–63 秒 | 3/3 |
| 背靠背 + 互评时提示"无法验证就先追问" | 2 | 5–6 | 2–3 | 3–5 | 8–11 | 5–6 | 45–81 秒 | 2/2 |

**结论**：

1. 背靠背加上追问提示后，追问、问现场、质疑、改口四种协作行为都稳定出现，且改口全部引用了其他 Agent 的证据。这就是第 2.3 节现在的设计。
2. 模型会生成剧本里没有的真实辩论。例如掘进追问渣土"为什么泡沫泵 518 环坏了，速度滞后 3 环才下降"，这是第 5 节"渣土置换滞后"的设定自然引出的。
3. 设计的分歧确实会出现：地质在背靠背阶段有 2 次把地层当成主因，被另外三方用时间先后驳回；掘进有 1 次判为"岩体变硬"后改口。
4. 不含专项会商和会签的精简流程用时约 1 分钟，按完整流程估算在 2–3 分钟，低于第 5.8 节 5 分钟的预算。

### 13.3 发现的问题与处理

| 问题 | 处理 |
|---|---|
| 应答分身会尝试调用发布判断等协作工具 | 应答分身只给数据工具，提示词限定"只回答问题，100 字以内，不发布、不表态"（已在验证脚本中修复） |
| 研判阶段提问过多 | 每个 Agent 每阶段最多 `ask_peer` 2 次（已修复） |
| 偶发工具参数缺字段（1 次） | 模型收到校验错误后自行重试成功；正式版保留这一机制即可 |
| 问现场在一次运行中出现 3 次 | 正式版按 2.5 节限制全队最多 2 次 |
| 回答和判断文字偏长 | 画布气泡使用 `brief`（≤ 30 字），正式版在工具参数中要求模型同时给出简短版本 |

### 13.4 完整流程录制（`npm run record:sample`）

在 13.2 的基础上补齐专项会商（协调主持）、起草结论、会签和模拟审核，按第 4 节事件协议输出事件流。正式录制一次：

| 指标 | 结果 | 第 8 节标准 |
|---|---|---|
| 用时（不含审核） | 143 秒 | ≤ 5 分钟 |
| Agent 间消息（专业 Agent 之间） | 43 | ≥ 8 |
| 追问 / 问现场 | 7 / 2 | 问现场 ≥ 1 |
| 质疑 / 赞同 | 7 / 22 | 质疑 ≥ 1 |
| 改口 | 9 次，均引用了他人证据 | ≥ 1 |
| 跨专业引用 | 54 次 | 主因结论引用 ≥ 3 位专家 |
| 专项会商 | 2 场 | ≤ 2 |
| 会签 | 4/4 同意，其中渣土附保留意见"518 环骤降是调参还是故障尚未查明" | 4 位全部表态 |
| 结论 | 主因泡沫原液骤降致渣土改良失效；次因 525 环起卵石地层；排除刀具 | 与参考答案一致 |

录制中发现并修复：协调曾一次并行发起两场会商，同一位专家被同时调用导致报错。`open_session` 已改为串行执行（`executionMode: 'sequential'`）。

---

## 14. D1 契约交付清单

| 文件 | 内容 | 使用方 |
|---|---|---|
| `packages/shared/src/events.ts` | 事件协议：20 种事件、领域对象（判断、证据、消息、结论、图表）、阶段定义 | A、B、C |
| `packages/shared/src/agents.ts` | Agent 名称、角色、数据域、角色色 | A、C |
| `packages/shared/src/collab-hub.ts` | CollabHub 接口：B 实现存储与投递，C 在协作工具中调用 | B、C |
| `packages/shared/src/validate.ts` | 事件流校验：编号、顺序、引用关系；`npm run check:sample` | A、B |
| `server/src/data/scenario.ts` + `scenario.check.ts` | 场景数据生成与 340 项自洽校验；`npm run check:data` | B、C |
| `server/src/model.ts` | DeepSeek 接入（读环境变量或本机 pi 凭证） | C |
| `server/spike/debate.ts` | 完整会商的可运行原型：提示词、数据工具、协作工具、应答分身、事件桥接。C 的正式实现以它为起点拆分 | C |
| `packages/shared/src/api.ts` | REST 与 SSE 契约：路径、请求响应、状态码、帧格式、端口 | A、B |
| `server/src/contract.ts` | B 与 C 之间的接口：编排入口、事件分工、场景数据 | B、C |
| `web/dev/sample-run.jsonl` + `sample-evidence.json` + `sample-rings.json` | 真实运行录制的事件样本（107 秒），以及证据详情和曲线数据，A 用它们脱离后端开发 | A |

**每个人的详细任务、接口边界和联调检查表见 [三人任务说明与联调约定.md](三人任务说明与联调约定.md)。**

与第 7.1 节排期相比，D1 的契约和 D2 的模型实测已经完成，D3 的数据生成脚本也已完成，C 的协作原型（原计划 D4–D7）有了可运行的初版。建议 A 第一天就基于样本开工，B 按 CollabHub 接口实现正式的服务端，C 把原型拆成正式模块并补齐阶段硬性要求的检查。

---

**参考来源**
[tldraw: spatial harness for agents](https://tldraw.dev/blog/harnessing-the-agents) ·
[Hermes Agent Kanban](https://x.com/NousResearch/status/2050997692977844324) ·
[Mohano](https://hulryung.github.io/mohano/) ·
[CanvasTTY](https://x.com/monokern/status/2091643463305765365) ·
[49Agents](https://x.com/so_sthbryan/status/2053260477564604753) ·
[DeerFlow](https://github.com/bytedance/deer-flow) ·
[AI Elements](https://elements.ai-sdk.dev/) ·
[React Flow Workflow Editor](https://reactflow.dev/ui/templates/workflow-editor) ·
[React Flow Animated SVG Edge](https://reactflow.dev/ui/components/animated-svg-edge) ·
[AG-UI 1.0](https://www.copilotkit.ai/blog/ag-ui-1.0) ·
[Pixel Agents](https://marketplace.visualstudio.com/items?itemName=pablodelucca.pixel-agents) ·
[pi-agent-core README](https://github.com/earendil-works/pi/blob/main/packages/agent/README.md) ·
[DeepSeek V4.1 Flash（OpenRouter）](https://openrouter.ai/deepseek/deepseek-v4.1-flash) ·
[DeepSeek API 文档](https://api-docs.deepseek.com/)
