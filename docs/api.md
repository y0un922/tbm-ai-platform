# TBM 前后端接口（按页面）

基址 `http://127.0.0.1:8787/api`。前端 live：`VITE_API_MODE=live`，Vite 把 `/api` 代理过来。

约定：

- JSON 字段全部 **camelCase**
- 时间 ISO-8601 字符串
- 成功 `200` + `application/json`
- 失败 `4xx/5xx` + `text/plain`（正文即错误信息）
- Canvas **不拉图**，只消费 `RuntimeEvent`
- 枚举值与**当前前端已在用的字符串**一致（部分仍是蛇形，如 `user_goal`、`needs_data`）。改驼峰要前后端一起切，见文末

优先级：

- **P0** 马上演示（AI 协同 / 运行视图 / 审核）
- **P1** 演示后（总览、记录、配置页补齐）
- **P2** 以后才做

---

## 0. 顶栏（所有页面）

### `GET /projects`

请求：无。

响应：`Project[]`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | `proj_a` / `proj_b` |
| name | string | 项目名 |
| line | string | 线路，如 `右线区间` |
| stage | string | 施工阶段文案 |
| status | `'normal' \| 'attention' \| 'preparing' \| 'stopped'` | 顶栏不直接画，总览用 |
| ring | number | 当前环 |
| totalRings | number | 总环 |
| lengthKm | number | |
| breakthroughAt | string? | 贯通时间 |

### `GET /runs?projectId={projectId}`

请求 query：

| 字段 | 类型 | 必填 |
|---|---|---|
| projectId | string | 是 |

响应：`Run[]`（字段见附录 A）。顶栏用 `humanReview.status === 'pending'` 做通知红点。

### `GET /trigger-instances?projectId={projectId}`

请求 query：`projectId` 必填。

响应：`TriggerInstance[]`（附录 B）。顶栏取最近 3 条做通知。

---

## 1. 总览 `/` · P1

页面：KPI、趋势、进度、风险、摘要、工程指标；最近触发；活跃 Run；Agent 与待审。

### `GET /dashboard?projectId={projectId}`

| query | 类型 | 必填 |
|---|---|---|
| projectId | string | 是 |

响应：`DashboardSnapshot`

```
{
  project: Project,                    // 同 GET /projects 单项
  metrics: MetricCard[],
  trend: TrendSeries[],
  progress: Progress,
  risks: RiskItem[],
  summary: Summary,
  engineeringMetrics: EngineeringMetric[]
}
```

**MetricCard**

| 字段 | 类型 |
|---|---|
| id | string |
| label | string |
| value | string |
| unit | string? |
| hint | string |
| tone | `'neutral' \| 'good' \| 'warn' \| 'bad'`? |

**TrendSeries**

| 字段 | 类型 |
|---|---|
| id | string |
| name | string |
| unit | string |
| points | `{ x: string, y: number }[]` |

**Progress**

| 字段 | 类型 |
|---|---|
| current | number |
| total | number |
| unit | string |
| caption | string |
| milestones | `{ label: string, detail: string, current?: boolean }[]` |

**RiskItem**

| 字段 | 类型 |
|---|---|
| id | string |
| severity | `'info' \| 'low' \| 'medium' \| 'high'` |
| title | string |
| detail | string |
| at | string |

**Summary**

| 字段 | 类型 |
|---|---|
| text | string |
| updatedAt | string |
| insights | `{ tone: 'ok' \| 'warn' \| 'info', text: string }[]` |

**EngineeringMetric**

| 字段 | 类型 |
|---|---|
| id | string |
| label | string |
| value | string |
| range | string |
| inRange | boolean |

同页还调：

- `GET /runs?projectId=` → 活跃运行（`status` 为 `running` / `review`）、待审（`humanReview.status === 'pending'`）
- `GET /trigger-instances?projectId=` → 最近触发（`name, type, source, timestamp`）
- `GET /agents` → 名字与在线状态

---

## 2. AI 协同 `/collaboration` · **P0**

页面：输入目标 → 开始分析 → 阶段条 → 审核条 → 结论 + Coordinator 调度 → 画布 + 点节点看 thinking/工具。

### `GET /health`

请求：无。

响应：

| 字段 | 类型 | 说明 |
|---|---|---|
| ok | boolean | 进程活着 |
| model | `{ provider: string, id: string } \| null` | 任务框旁徽章 |
| error | string? | 模型读失败时的原因 |

### `POST /runs`

请求：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| projectId | string | 是 | 当前顶栏项目 |
| goal | string | 是 | 1–500 字，用户任务 |
| demo | `'fir'`? | 否 | 省略也走 `pb_eff`，按 goal 调度 |

响应：`Run`（附录 A）。前端跳转 `/collaboration?run={id}`。

### `GET /runs?projectId={projectId}`

同顶栏。协同页用它选中当前 Run（query `run=`，否则取 running/review，再否则最新一条）。

### `GET /runs/:runId`

请求 path：`runId`。

响应：`Run`。审核提交后用返回值更新缓存。

### `GET /runs/:runId/events` · SSE

请求：无 body。`Accept` 按 EventSource。

响应：`text/event-stream`

```
data: {RuntimeEvent}\n\n
: ping\n\n
```

先按时间重放该 Run 全部历史事件，再推增量。15s 注释 ping。

`RuntimeEvent` 与 `data` 见附录 C。画布、结论、调度列表、节点检视器都只吃这个流。

### `POST /runs/:runId/review`

请求：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| decision | `'approve' \| 'reject' \| 'request_more_data'` | 是 | 批准 / 驳回 / 要补数 |
| reviewId | string | 建议 | 必须等于当前 `humanReview.id` |

响应：最新 `Run`。

- `approve` → 关卡完成，进入下一阶段（不等于整次 Run 结束）
- `reject` → `status: 'failed'`，不下发设备
- `request_more_data` → `humanReview.status: 'needs_data'`

### `POST /runs/:runId/supplement`

仅当 `humanReview.status === 'needs_data'`。

请求：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| reviewId | string | 是 | 当前审核 id |
| content | string | 是 | trim 后 1–5000 字 |

响应：最新 `Run`。`humanReview.status` 回到 `pending`，`humanReview.supplement` 为提交文本。**不自动批准**。

---

## 3. 运行视图 `/runtime` · **P0**

页面：选 Run、阶段进度、审核、画布、检视器、时间线/事件/工具/消息/IO/错误。

接口与协同页同一套：

| 方法 | 路径 | 本页用途 |
|---|---|---|
| GET | `/runs?projectId=` | 下拉选 Run |
| GET | `/runs/:runId` | 3s 刷新详情（`id, trigger.name, participatingAgentIds, toolCallCount, messageCount, durationMs, status, playbook, humanReview`） |
| GET | `/runs/:runId/events` | SSE 还原图与 Trace |
| POST | `/runs/:runId/review` | 审核条 |
| POST | `/runs/:runId/supplement` | 补数 |

`?replay=1` 只是前端回放已收事件，不另调接口。

---

## 4. Agent `/agents` · P0（演示要点开看职责）

### `GET /agents`

请求：无。

响应：`AgentRecord[]`

| 字段 | 类型 | 页面用法 |
|---|---|---|
| id | string | 路由 `?agent=` |
| name | string | 标题 |
| code | string | 副标题 |
| role | string | 列表第二行 |
| status | `'online' \| 'standby' \| 'offline'` | 在线点 |
| description | string | 职责卡片 |
| instructions | string | System prompt |
| capabilities | string[] | 编辑 |
| toolIds | string[] | 编辑勾选 |
| apiIds | string[] | 编辑勾选 |
| mcpIds | string[] | 编辑勾选 |
| dataSourceIds | string[] | 编辑勾选 |
| permissions | string[] | 编辑 |
| spawnPolicy | string | 编辑 |
| runtimePolicy | string | 编辑 |
| timeoutSec | number | 编辑 |
| retry | number | 编辑 |
| version | string | prompt 脚注 |
| model | string | 脚注 |
| owner | string | 副标题 |
| updatedAt | string | |
| successRate7d | number | 0–1 |
| runtimeTools | string[]? | 运行时工具列表（C1=`query_geology` 等） |

### `GET /agents/:id`

响应：单个 `AgentRecord`（当前页用列表项，可不调）。

### `PATCH /agents/:id`

请求：`Partial<AgentRecord>`，页面会把整份 draft 打回（含 `id`）。后端忽略不可改的运行时字段亦可。

响应：保存后的 `AgentRecord`，`updatedAt` 刷新。

### `GET /capabilities`

Agent 编辑勾选工具/API/MCP 用。字段见第 7 节。

---

## 5. Playbooks `/playbooks` · P1（演示可用「模拟运行」）

### `GET /playbooks?projectId={projectId}`

响应：`Playbook[]`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | |
| projectId | string | |
| name | string | |
| status | `'enabled' \| 'testing' \| 'disabled'` | 停用不可 test |
| description | string | |
| triggerDefinitionId | string \| null | 一对一 Trigger；解绑必须 `null` |
| version | string | 保存自增 |
| updatedAt | string | |
| constraints | string[] | |
| humanReview | `{ required: boolean, when: string, roles: string[] }` | `required` 由是否有审核关卡推导 |
| output | `{ description: string, destinations: string[] }` | |
| notification | string | |
| archiving | string | |
| stages | PlaybookStage[] | 1–20 个 |

**PlaybookStage**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | |
| name | string | |
| goal | string | 阶段任务 |
| agentIds | string[] | 空 = Coordinator 自选；非空 = 白名单，**不是**调用顺序 |
| output | string | 预期交付描述 |
| requiresReview | boolean | 阶段结束是否卡审核 |

### `POST /playbooks`

请求：创建体 = Playbook **去掉** `id, version, updatedAt`。`projectId` 必填，`name` trim 非空，`stages` 至少 1 条。

响应：完整 `Playbook`（服务端生成 `id, version, updatedAt`）。

### `PATCH /playbooks/:id`

请求：`Partial<Playbook>`，页面提交整份 draft（含 `id`）。保存递增 `version`。已启动 Run 的快照不变。

若改 `triggerDefinitionId`：必须同步该 Trigger 的 `config.playbookId`（同项目一对一）。解绑发 `triggerDefinitionId: null`。

响应：保存后的 `Playbook`。

### `POST /playbooks/:id/test`

请求：无 body（或 `{}`）。

响应：新建 `Run`，`playbook` 为**当前版本快照**。前端跳运行视图。

同页还调 `GET /agents`、`GET /triggers?projectId=`。

---

## 6. Trigger `/triggers` · P1（演示可用「测试」）

### `GET /triggers?projectId={projectId}`

响应：`TriggerDefinition[]`

| 字段 | 类型 |
|---|---|
| id | string |
| name | string |
| type | `'user_goal' \| 'manual' \| 'schedule' \| 'metric_threshold' \| 'system_event' \| 'webhook' \| 'external_api'` |
| enabled | boolean |
| projectId | string |
| description | string? |
| config | object，见下 |

**config（页面会读写的键）**

| 字段 | 类型 | 说明 |
|---|---|---|
| source | string | 必填，来源名 |
| condition | string | 条件文本，后端解释 |
| dataSource | string | |
| debounceSec | number | 防抖秒 |
| cooldownSec | number | 冷却秒 |
| severity | `'info' \| 'low' \| 'medium' \| 'high'` | |
| playbookId | string | 关联 Playbook，空字符串 = 不关联 |
| schedule | string | 仅 `schedule`，Cron |
| metric | string | 仅 `metric_threshold` |

### `POST /triggers`

请求：完整 `TriggerDefinition`。无 `id` 时服务端生成 `def_...`。`name`、`config.source` trim 非空。

响应：保存后的 `TriggerDefinition`。若带 `config.playbookId`，同步该 Playbook 的 `triggerDefinitionId`。

### `PATCH /triggers/:id`

请求：`Partial<TriggerDefinition>`。启停只传 `{ enabled }`。

响应：合并后的定义。改 `config.playbookId` 时双向同步 Playbook。

### `POST /triggers/:id/test`

请求：`{}`。

响应：`Run`。按关联 Playbook 冻结快照并 kick。前端跳 `/runtime?run=`。

### `GET /trigger-instances?projectId={projectId}`

响应：`TriggerInstance[]`（附录 B）。列表用 `name, type, source, summary, timestamp, payload.failed`。

同页 KPI 还调 `GET /runs?projectId=`、`GET /playbooks?projectId=`。

---

## 7. 数据与能力 `/capabilities` · P1

### `GET /capabilities`

请求：无。

响应：`Capability[]`

| 字段 | 类型 | 页面 |
|---|---|---|
| id | string | |
| name | string | 表名 |
| kind | `'data_source' \| 'tool' \| 'api' \| 'mcp' \| 'model' \| 'knowledge'` | 筛选 |
| status | `'online' \| 'degraded' \| 'offline'` | |
| description | string | |
| owner | string | |
| syncedAt | string | 相对时间 |
| agentIds | string[] | 详情 |
| endpoint | string? | 详情 |
| protocol | string? | 详情 |
| latencyMs | number? | 详情 |
| tags | string[] | 搜索 |

无写接口。连通测试不在前端。

---

## 8. 运行记录 `/history` · P1

### `GET /runs?projectId={projectId}`

筛选、KPI、详情侧栏都用这一份列表（前端本地滤 `status` / 关键字）。

侧栏用到的 Run 字段：`id, goal, status, startedAt, durationMs, participatingAgentIds, spawnedAgentIds, toolCallCount, trigger.name, trigger.type, trigger.source, humanReview.status, riskLevel, resultSummary`。

回放按钮只跳 `/runtime?run=&replay=1`，不另调接口。

**P1 拟新增（现没有）：** `GET /runs/:runId/events?format=json` → `RuntimeEvent[]`，给记录页离线回放。

---

## 9. 设置 `/settings` · P1

### `GET /settings`

响应：`PlatformSettings`

| 字段 | 类型 |
|---|---|
| platformName | string |
| timezone | string |
| reviewPolicy | string |
| spawnLimit | number |
| timeoutSec | number |
| retry | number |
| density | `'comfortable' \| 'standard' \| 'compact'` |
| language | string |
| retentionDays | `{ runs: number, logs: number, files: number }` |
| auditRetentionDays | number |

### `PATCH /settings`

请求：整份 `PlatformSettings`（页面把 draft 全量提交）。

响应：保存后的对象。`density` 写入 `document.documentElement.dataset.density`。

当前项目 id 只展示，不通过本接口改。

---

## 附录 A · `Run`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | `run_...` |
| projectId | string | |
| status | `'pending' \| 'running' \| 'review' \| 'completed' \| 'failed'` | |
| goal | string | 用户任务 / 触发摘要 |
| trigger | TriggerInstance | 附录 B |
| coordinatorId | string | 现为 `coordinator` |
| startedAt | string | |
| endedAt | string? | 结束才有 |
| durationMs | number? | 服务端按 now 或 endedAt 计算 |
| participatingAgentIds | string[] | 上过场的 Agent |
| spawnedAgentIds | string[] | 子 Agent |
| toolCallCount | number | |
| messageCount | number | |
| humanReview | HumanReview? | 当前关卡 |
| resultSummary | string? | 结论全文 |
| riskLevel | `'info' \| 'low' \| 'medium' \| 'high'`? | |
| playbook | PlaybookSnapshot? | **启动时冻结**，之后改 Playbook 不影响 |

**PlaybookSnapshot** = `{ id, name, version, stages: PlaybookStage[] }`

**HumanReview**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | 与 reviewId 相同 |
| status | `'pending' \| 'approved' \| 'rejected' \| 'needs_data'` | |
| reason | string | 为何要人审 |
| agentId | string | 现为 `coordinator` |
| result | string | 待审 / 已审结论 |
| risk | string | |
| missing | string[] | 缺数清单 |
| recommendation | string | 处理建议 |
| supplement | string? | 最近一次补数正文 |

---

## 附录 B · `TriggerInstance`

| 字段 | 类型 |
|---|---|
| id | string |
| triggerDefinitionId | string? |
| type | 同 TriggerDefinition.type |
| name | string |
| source | string |
| summary | string |
| timestamp | string |
| payload | object? |

`payload` 演示里会出现：`scene, rule, actual, threshold, window, failed?`。

用户在协同页点「开始分析」时，后端会造一条 `type: 'user_goal'` 的实例再挂到 Run 上。

---

## 附录 C · `RuntimeEvent`

公共头：

| 字段 | 类型 |
|---|---|
| id | string |
| runId | string |
| type | 见下表 |
| timestamp | string |
| sourceId | string? |
| targetId | string? |
| data | object，按下表 |

### `data` 按 type

**trigger.fired**

| 字段 | 类型 |
|---|---|
| instanceId | string |
| definitionId | string? |
| name | string |
| triggerType | string |
| source | string |
| summary | string |
| payload | object |

**run.started**

| 字段 | 类型 |
|---|---|
| goal | string |
| playbook | PlaybookSnapshot? |

**coordinator.started**

| 字段 | 类型 |
|---|---|
| agentId | string |
| name | string |

**stage.started**

| 字段 | 类型 |
|---|---|
| stageId | string |
| name | string |
| goal | string |
| agentIds | string[] |
| autonomous | boolean |

**stage.completed**

| 字段 | 类型 |
|---|---|
| stageId | string |
| name | string |
| summary | string |

**agent.delegated**（协同页「Coordinator 调度」）

| 字段 | 类型 |
|---|---|
| agentId | string |
| name | string |
| role | string |
| stageId | string |
| task | string |

**agent.started** / **agent.completed** / **agent.failed**

| 字段 | 类型 | 何时 |
|---|---|---|
| agentId | string | 都有 |
| stageId | string | 都有 |
| summary | string | completed |
| error | string | failed |

**agent.thinking**（节点「思考」）

| 字段 | 类型 |
|---|---|
| agentId | string |
| stageId | string |
| text | string |

**agent.message**（节点灰气泡）

| 字段 | 类型 |
|---|---|
| agentId | string |
| stageId | string |
| to | string? | 专业 Agent → `coordinator` |
| text | string |

**tool.called / api.called / mcp.called**

| 字段 | 类型 |
|---|---|
| agentId | string |
| stageId | string |
| name | string | 展示名，如 `传感器数据` |
| kind | `'tool' \| 'api' \| 'mcp' \| 'data_source'` |
| toolId | string | 如 `query_ring_metrics` |
| status | `'running' \| 'completed' \| 'failed'` |
| durationMs | number |
| input | unknown |
| output | unknown |

**human_review.requested**

| 字段 | 类型 |
|---|---|
| reviewId | string |
| stageId | string |
| name | string |
| agentId | string |
| reason | string |
| result | string |
| risk | string |
| missing | string[] |
| recommendation | string |
| supplement | string? |

**human_review.decided**

| 字段 | 类型 |
|---|---|
| reviewId | string |
| stageId | string? |
| decision | `'approve' \| 'reject' \| 'request_more_data'` |

**run.completed** → `data.summary: string`（写入 `Run.resultSummary`）  
**run.failed** → `data.error: string`

**agent.spawned**（Mock 剧本有，live 演示可不发）

| 字段 | 类型 |
|---|---|
| agentId | string |
| name | string |
| parentId | string |

---

## 附录 D · 演示最短调用链

```
GET  /health
POST /runs                  { projectId, goal }
GET  /runs/:id/events       SSE
POST /runs/:id/supplement   { reviewId, content }     // 可选
POST /runs/:id/review       { decision, reviewId }
GET  /runs/:id              拉最终结论
```

或 `POST /playbooks/pb_eff/test` / `POST /triggers/def_fir/test`，后面 SSE 相同。

---

## 附录 E · 枚举是否改驼峰（待拍板）

| 现在（页面已接） | 若改 |
|---|---|
| `user_goal` `metric_threshold` `system_event` `external_api` | `userGoal` … |
| `data_source` | `dataSource` |
| `needs_data` | `needsData` |
| `request_more_data` | `requestMoreData` |

字段名已经是 camelCase。**演示用左列。** 要切右列必须前后端同一天改。
