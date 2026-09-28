import type { GraphEdgeKind, GraphNodeKind, NodeStatus, RunStatus, TriggerType } from '@/types'

export const TRIGGER_TYPE_LABEL: Record<TriggerType, string> = {
  user_goal: '用户目标',
  manual: '手动',
  schedule: '定时',
  metric_threshold: '指标阈值',
  system_event: '系统事件',
  webhook: 'Webhook',
  external_api: '外部 API',
}

export const NODE_KIND_LABEL: Record<GraphNodeKind, string> = {
  trigger: 'Trigger',
  coordinator: 'Coordinator',
  agent: 'Agent',
  sub_agent: 'Sub-Agent',
  tool: 'Tool',
  api: 'API',
  mcp: 'MCP',
  data_source: 'Data Source',
  human_review: 'Human Review',
}

export const EDGE_LABEL: Record<GraphEdgeKind, string> = {
  trigger: 'Trigger',
  delegate: 'Delegate',
  spawn: 'Spawn',
  message: 'Message',
  tool_call: 'Tool Call',
  api_call: 'API Call',
  mcp_call: 'MCP Call',
  data: 'Data',
  review: 'Review',
  result: 'Result',
}

export const NODE_STATUS_LABEL: Record<NodeStatus, string> = {
  pending: '等待',
  running: '运行中',
  completed: '完成',
  failed: '失败',
  waiting: '等待数据',
  review: '待审核',
}

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  pending: '待启动',
  running: '运行中',
  review: '待审核',
  completed: '完成',
  failed: '失败',
}

export const EVENT_LABEL: Record<string, string> = {
  'trigger.fired': '触发',
  'run.started': '运行开始',
  'coordinator.started': '协调器启动',
  'agent.delegated': '委派',
  'agent.started': 'Agent 开始',
  'agent.spawned': '派生',
  'agent.message': '消息',
  'agent.thinking': '思考',
  'tool.called': '工具调用',
  'api.called': 'API 调用',
  'mcp.called': 'MCP 调用',
  'human_review.requested': '请求人工审核',
  'human_review.decided': '人工审核决定',
  'stage.started': '阶段开始',
  'stage.completed': '阶段完成',
  'agent.completed': 'Agent 完成',
  'agent.failed': 'Agent 失败',
  'run.completed': '运行完成',
  'run.failed': '运行失败',
}
