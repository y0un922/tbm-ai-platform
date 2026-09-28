# 后端

HTTP + 内存库 + SSE。阶段编排在本进程；每个专业 Agent / Coordinator 是一次 **pi SDK session**（`createAgentSession`，关掉 bash/read/write，只挂业务 Tool）。

```bash
npm install
npm run dev          # http://127.0.0.1:8787/api
npm run check        # TBM_NO_PI=1 状态机自检，不打模型
```

凭证走本机 `~/.pi/agent`。未 /login 时 Run 失败。

演示路径：Trigger `def_fir` 或协同页「开始分析」→ `pb_eff` 四阶段（收集 → 诊断 → 审核 → 1251/1252 验证）。Canvas 上应看到真实 `tool.called` / `api.called` / `agent.message`。

---

# 契约

## 分层

| 层 | 职责 | 第一期 |
|---|---|---|
| 前端 | 展示、人工审核、Playbook 编辑。Canvas 只还原事件 | 已有，不改契约 |
| 任务层 | Trigger 判定、Run 生命周期、Playbook 快照、审核闸门、SSE | **后端第一刀** |
| 协同层 | Coordinator：选人、并行、补证、综合、升级审核 | 先写死剧本，后换模型 |
| Agent | 专业判断，只写自己的证据分区 | 先不出模型 |
| Tool | 取数 / 计算 / 模型。禁止写设备 | 先纯函数 Mock |
| 数据 | 环参数、地质、泡沫 | 内存种子，对 1246–1252 环 |

pi 只可能出现在 Agent 循环里，且必须 in-process SDK。CLI / RPC 不当 runtime。

## 对象

前端 `frontend/src/types/index.ts` 是 API 真源。后端字段名与之对齐。

- **Project** 运行隔离。当前 Demo 只用 `proj_a`。
- **TriggerDefinition** 规则配置。浏览器不执行规则。
- **TriggerInstance** 一次已发生的触发。`failed: true` 只记账，不建 Run。
- **Playbook** 有序业务阶段（1–20）。`agentIds: []` = Coordinator 自选；非空 = 白名单，**不是**调用顺序。
- **Run** 一次执行。启动时冻结 `playbook: { id, name, version, stages }`。之后改 Playbook 不影响在途 Run。
- **HumanReview** 当前闸门。批准当前关卡 ≠ 结束整个 Run。
- **RuntimeEvent** Canvas 唯一输入。后端不推「节点图」，只推事件。

Trigger ↔ Playbook 同项目一对一。解绑发 `triggerDefinitionId: null`（不要靠 JSON 省略）。保存须两边一起改。

## Run 状态

```
pending → running ⇄ review → completed
                         ↘ failed
```

| 现状 | 谁推进 |
|---|---|
| `running` | 当前阶段未设审核，或审核已通过后进入下一阶段 |
| `review` + `humanReview.status=pending` | 等人批 / 驳 / 要补数 |
| `review` + `needs_data` | 等人 `POST /supplement` |
| `completed` | 所有阶段走完（含验证） |
| `failed` | 驳回、超时、阶段无法继续 |

审核决定：

- `approve` → `human_review.decided` → `stage.completed` → 下一阶段
- `reject` → `human_review.decided` → `run.failed`（不下发设备）
- `request_more_data` → 停住；补数校验通过后重新 `human_review.requested`（`pending`），**不自动批准**
- 补数：`content` trim 后 1–5000 字；仅当当前审核是 `needs_data` 且 `reviewId` 匹配

Mock 补数只重开审核、不分析材料。真后端第一期也先重开审核，但要把材料挂在事件 `data.supplement` / `data.input.content` 上。不要在这一期做真实性校验。

## 阶段（业务门，不是 Agent 流程图）

Demo Playbook `pb_eff` 现有前端 Mock 是三阶段（收集 → 诊断 → 复核）。闭环按 PPT 应能验证「处理后指标是否恢复」，**接 live 时用下面四阶段**；先不要改前端 Mock 种子。

| id | 名称 | 白名单 | 审核 |
|---|---|---|---|
| `eff_collect` | 工况与证据 | c2, c6 | 否 |
| `eff_diagnose` | 多 Agent 诊断 | c1, c2, c6 | 否 |
| `eff_review` | 建议复核 | Coordinator 自选 | 是 |
| `eff_verify` | 效果验证 | c2 | 否 |

管片 Agent（c4）本期不上场。刀盘（c3）诊断阶段可缺席；证据不足就写缺失项，不准编。

阶段内 Coordinator 可并行委派，可少用白名单里的人，不可用名单外的人。不配置工具顺序、不配置 if/else。

## 证据黑板（后端内存，前端经事件看见）

```
state.evidence.geology      仅 c1 写
state.evidence.tunneling    仅 c2 写
state.evidence.muck         仅 c6 写
state.evidence.cutterhead   仅 c3 写
state.conclusion            仅 Coordinator 写
```

每条证据：`agentId, toolId, ring, timestamp, source, value`。越权写入拒绝。

Coordinator：只读全量证据；用分区是否已填当进度；冲突保留候选，不强行收敛；结论必须引用证据，禁止只靠模型发挥。

本期前端没有独立 evidence API。用 `agent.message` / `tool.called` 的 `data` 把证据带上即可。

## 事件（顺序约束）

类型集合不准扩大，除非前端 `RuntimeEventType` 先改。

一次 FIR Demo 的合法骨架：

1. `trigger.fired`（带 rule / actual / threshold / ring）
2. `run.started`（goal + playbook 快照）
3. `coordinator.started`
4. 每个阶段：`stage.started` → 若干 `agent.delegated` / `agent.started` / `tool.called`|`api.called` / `agent.message` / `agent.completed` → `stage.completed`
5. 审核阶段在 `stage.completed` 之前插 `human_review.requested`，停住
6. 人决策后 `human_review.decided`
7. 验证阶段用后续环 Mock 数据
8. `run.completed`（摘要写明未下发 PLC）

禁止：没有 `stage.started` 就 `stage.completed`；审核中继续下一阶段；把 pi 的 `message_update` 原样推给前端。

## HTTP（与 `frontend/src/mocks/router.ts` 对齐）

前缀 `/api`。SSE：`GET /api/runs/:runId/events`，每条 `data: <RuntimeEvent JSON>`。

| 方法 | 路径 | 第一期 |
|---|---|---|
| GET | `/projects` `/dashboard` `/agents` `/capabilities` `/settings` | 种子数据，可先只读 |
| PATCH | `/agents/:id` `/settings` | 可稍后 |
| GET/POST/PATCH | `/triggers` | 要。规则在服务端评 |
| POST | `/triggers/:id/test` | 要。禁用的 Trigger 拒绝 |
| GET | `/trigger-instances` | 要 |
| GET/POST/PATCH | `/playbooks` | 要。校验同 `frontend/src/features/playbooks/model.ts` |
| POST | `/playbooks/:id/test` | 要。停用拒绝；冻结 stages |
| GET | `/runs` `/runs/:id` | 要 |
| POST | `/runs` | 要。`demo=fir` 必须走 `def_fir` + `pb_eff` 快照（不要抄 Mock 的无 Playbook 脚本） |
| POST | `/runs/:id/review` `{ decision, reviewId }` | 要 |
| POST | `/runs/:id/supplement` `{ reviewId, content }` | 要 |
| GET | `/runs/:id/events` | SSE；订阅时先重放已有事件 |

Trigger 引擎：第一期只实现 `manual`（test 接口）和 `metric_threshold`（对内存环序列）。Cron / webhook / PLC event 只存配置。

## Demo 数据（写死，可复现）

项目 A，当前环 1250。指标口径：掘进效率 = m/h；贯入度 = 推进速度 / 刀盘转速（mm/r）。

Trigger `def_fir`：FIR 连续 5 环下降 > 20%。种子让 1246–1250 满足，从而 `test` 或 `demo=fir` 必触发。

1250 环同时给到 Tool 的现象（与 PPT 一致）：贯入度下降、推力与扭矩增加、螺旋机电流上升、渣土流动性下降、泡沫供给波动。

验证阶段读 1251–1252：默认「泡沫提高后 FIR 止跌」——这是剧本，不是现场结论。事件里标明 `mock: true`。

Tool 第一期四个函数就够，返回值冻结：

- `query_ring_metrics(ring)`
- `query_foam(ring)`
- `query_geology(ring)`
- `query_lab_muck(ring)`（可缺，缺则证据写缺失项）

没有写接口。没有 bash。

## 明确不做

- pi CLI / RPC 当进程
- 真 SCADA / PLC / 地质库（环数据是冻结 Mock，Agent 是真的）
- 任意 DAG、循环、跨阶段并行
- 补数材料真实性分析
- 发布审批、权限、持久化（内存即可）
