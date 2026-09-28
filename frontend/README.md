# 盾构机 AI 多智能体协同平台 · 前端

UI 包。仓库根目录见上一级 `README.md`。Goal / Trigger 驱动的工业 Multi-Agent 前端。Playbook 编辑业务阶段，阶段内由 Coordinator 自主组织协作；运行 Canvas 仍是只读事件可视化，不是自由连线编辑器。

```bash
npm install
npm run dev
npm run check:graph
npm run check:review
npm run check:runtime
npm run check:playbook
npm run build
```

默认 `VITE_API_MODE=mock`。接后端：`npm run dev:live`（Vite 把 `/api` 代理到 `http://127.0.0.1:8787`）。也可设 `VITE_API_BASE`。事件流为 `GET /api/runs/:runId/events`（SSE）。

## 本轮体验路径

- AI 协同：等待演示运行进入审核 → 要求补数 → 填写材料 → 提交补数并重新送审 → 批准或驳回。
- 运行视图：输入输出页签可查看调用 JSON 与补充材料；切换 Run 会退出旧回放。
- Playbooks：新建工作流 → 配置阶段任务/参与 Agent/预期输出/审核关卡 → 添加、上下移动或删除阶段 → 保存 → 模拟运行。审核批准后继续下一阶段，驳回终止。
- Playbooks / AI 协同：切换到项目 B，不保留项目 A 的编辑器或运行图；项目 B 也可新建自己的工作流。
- Trigger：定时类型编辑 Cron，指标类型编辑监控指标；只保存配置，不在浏览器执行规则。

Mock 数据仅保存在当前页面内存，刷新会重置。补数演示只重新请求人工审核，不执行材料真实性校验、模型分析或设备控制。

## 阶段编排契约（待后端确认）

`Playbook.stages` 为有序数组（1–20 个），每项为：

```ts
{ id: string; name: string; goal: string; agentIds: string[]; output: string; requiresReview: boolean }
```

- `agentIds: []` 表示 Coordinator 自主选择，非空表示限定参与范围；这里不配置内部工具调用顺序或条件分支。
- `output` 是预期交付描述，不是真实分析结果。Mock 按阶段生成明确标注的示例事件，不调用模型、工具或设备。
- 未包含 `stages` 的旧策略在编辑器中映射成一个分析阶段，保留原人工审核要求；保存时写入显式阶段。
- 新建 `POST /api/playbooks`，保存 `PATCH /api/playbooks/:id`，测试已保存版本 `POST /api/playbooks/:id/test` → `Run`。测试中/启用状态可测试，停用不可测试。
- `triggerDefinitionId` 与 `Trigger.config.playbookId` 在 Mock 保存接口保持同项目一对一关联；解除关联发送 `triggerDefinitionId: null`（不能用 JSON 会省略的 `undefined`）。真实后端应使用事务保证一致性。
- Run 携带 `playbook: { id, name, version, stages }` 启动快照；事件新增 `stage.started`、`stage.completed`（`data.stageId`）及 `human_review.decided`（`data.reviewId`、`data.decision`）。
- 审核请求传 `{ decision, reviewId }`，必须对应当前关卡；批准关卡不等于完成整个 Run。补数重新送审，不自动批准。

保存递增版本，已启动的模拟运行不受后续编辑影响。Mock 不提供发布审批、真实权限控制、持久化或真实调度；这些仍由后端负责。当前范围不含任意分支、循环和跨阶段并行。

### 待后端确认的补数接口

`POST /api/runs/:runId/supplement`，请求 `{ reviewId: string, content: string }`，返回最新 `Run`。
`content` 去除首尾空格后为 1–5000 字；仅允许当前审核为 `needs_data` 且 reviewId 匹配时提交。Mock 返回 `pending` 审核，并追加 `human_review.requested` 事件，材料放在 `data.supplement` 和 `data.input.content`；Run 的审核对象增加可选 `supplement` 字段。

这是供联调讨论的前端契约，不代表真实后端已支持。Live 模式须由后端负责权限、幂等、材料验证与续跑调度；前端不自行判定补数成功。
