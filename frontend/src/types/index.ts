export type TriggerType =
  | 'user_goal'
  | 'manual'
  | 'schedule'
  | 'metric_threshold'
  | 'system_event'
  | 'webhook'
  | 'external_api'

export type Severity = 'info' | 'low' | 'medium' | 'high'

/** 系统配置。规则是否成立由后端 Trigger Engine 判断。 */
export interface TriggerDefinition {
  id: string
  name: string
  type: TriggerType
  enabled: boolean
  projectId: string
  description?: string
  config: Record<string, unknown>
}

/** 已经发生的一次触发。 */
export interface TriggerInstance {
  id: string
  triggerDefinitionId?: string
  type: TriggerType
  name: string
  source: string
  summary: string
  timestamp: string
  payload?: Record<string, unknown>
}

export type RuntimeEventType =
  | 'trigger.fired'
  | 'run.started'
  | 'coordinator.started'
  | 'agent.delegated'
  | 'agent.started'
  | 'agent.spawned'
  | 'agent.message'
  | 'agent.thinking'
  | 'tool.called'
  | 'api.called'
  | 'mcp.called'
  | 'human_review.requested'
  | 'human_review.decided'
  | 'stage.started'
  | 'stage.completed'
  | 'agent.completed'
  | 'agent.failed'
  | 'run.completed'
  | 'run.failed'

export interface RuntimeEvent {
  id: string
  runId: string
  type: RuntimeEventType
  timestamp: string
  sourceId?: string
  targetId?: string
  data: Record<string, unknown>
}

export type RunStatus = 'pending' | 'running' | 'review' | 'completed' | 'failed'
export type ReviewDecision = 'approve' | 'reject' | 'request_more_data'
export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'needs_data'

export interface HumanReview {
  id: string
  status: ReviewStatus
  reason: string
  agentId: string
  result: string
  risk: string
  missing: string[]
  recommendation: string
  supplement?: string
}

export interface Run {
  id: string
  projectId: string
  status: RunStatus
  goal: string
  trigger: TriggerInstance
  coordinatorId: string
  startedAt: string
  endedAt?: string
  durationMs?: number
  participatingAgentIds: string[]
  spawnedAgentIds: string[]
  toolCallCount: number
  messageCount: number
  humanReview?: HumanReview
  resultSummary?: string
  riskLevel?: Severity
  /** Frozen definition used by this run; edits never rewrite running work. */
  playbook?: { id: string; name: string; version: string; stages: PlaybookStage[] }
}

export interface Project {
  id: string
  name: string
  line: string
  stage: string
  status: 'normal' | 'attention' | 'preparing' | 'stopped'
  ring: number
  totalRings: number
  lengthKm: number
  breakthroughAt?: string
}

export type AgentAvailability = 'online' | 'standby' | 'offline'

export interface AgentRecord {
  id: string
  name: string
  code: string
  role: string
  status: AgentAvailability
  description: string
  instructions: string
  capabilities: string[]
  toolIds: string[]
  apiIds: string[]
  mcpIds: string[]
  dataSourceIds: string[]
  permissions: string[]
  spawnPolicy: string
  runtimePolicy: string
  timeoutSec: number
  retry: number
  version: string
  model: string
  owner: string
  updatedAt: string
  successRate7d: number
  runtimeTools?: string[]
}

export type PlaybookStatus = 'enabled' | 'testing' | 'disabled'

export interface PlaybookStage {
  id: string
  name: string
  goal: string
  /** Empty means Coordinator chooses participants autonomously. */
  agentIds: string[]
  output: string
  requiresReview: boolean
}

/** Ordered business stages; Coordinator chooses collaboration within each stage. */
export interface Playbook {
  id: string
  projectId: string
  name: string
  status: PlaybookStatus
  description: string
  triggerDefinitionId?: string | null
  version: string
  updatedAt: string
  constraints: string[]
  humanReview: { required: boolean; when: string; roles: string[] }
  output: { description: string; destinations: string[] }
  notification: string
  archiving: string
  /** Optional only for legacy definitions; editor saves explicit stages. */
  stages?: PlaybookStage[]
}

export type CapabilityKind = 'data_source' | 'tool' | 'api' | 'mcp' | 'model' | 'knowledge'
export type CapabilityStatus = 'online' | 'degraded' | 'offline'

export interface Capability {
  id: string
  name: string
  kind: CapabilityKind
  status: CapabilityStatus
  description: string
  owner: string
  syncedAt: string
  agentIds: string[]
  endpoint?: string
  protocol?: string
  latencyMs?: number
  tags: string[]
}

export interface MetricCard {
  id: string
  label: string
  value: string
  unit?: string
  hint: string
  tone?: 'neutral' | 'good' | 'warn' | 'bad'
}

export interface TrendSeries {
  id: string
  name: string
  unit: string
  points: { x: string; y: number }[]
}

export interface RiskItem {
  id: string
  severity: Severity
  title: string
  detail: string
  at: string
}

export interface DashboardSnapshot {
  project: Project
  metrics: MetricCard[]
  trend: TrendSeries[]
  progress: {
    current: number
    total: number
    unit: string
    caption: string
    milestones: { label: string; detail: string; current?: boolean }[]
  }
  risks: RiskItem[]
  summary: {
    text: string
    updatedAt: string
    insights: { tone: 'ok' | 'warn' | 'info'; text: string }[]
  }
  engineeringMetrics: { id: string; label: string; value: string; range: string; inRange: boolean }[]
}

export interface PlatformSettings {
  platformName: string
  timezone: string
  reviewPolicy: string
  spawnLimit: number
  timeoutSec: number
  retry: number
  density: 'comfortable' | 'standard' | 'compact'
  language: string
  retentionDays: { runs: number; logs: number; files: number }
  auditRetentionDays: number
}

export type GraphNodeKind =
  | 'trigger'
  | 'coordinator'
  | 'agent'
  | 'sub_agent'
  | 'tool'
  | 'api'
  | 'mcp'
  | 'data_source'
  | 'human_review'

export type GraphEdgeKind =
  | 'trigger'
  | 'delegate'
  | 'spawn'
  | 'message'
  | 'tool_call'
  | 'api_call'
  | 'mcp_call'
  | 'data'
  | 'review'
  | 'result'

export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'waiting' | 'review'

export interface GraphNodeModel {
  id: string
  kind: GraphNodeKind
  name: string
  typeLabel: string
  status: NodeStatus
  startedAt?: string
  endedAt?: string
  durationMs?: number
  count: number
  actorId: string
  detail: Record<string, unknown>
}

export interface GraphEdgeModel {
  id: string
  source: string
  target: string
  kind: GraphEdgeKind
  label: string
}

export type GraphMode = 'aggregated' | 'expanded'
