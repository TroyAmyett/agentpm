// AgentPM Types
// Based on Funnelists Enterprise Base Data Model v1.0

// =============================================================================
// BASE ENTITY
// =============================================================================

export interface BaseEntity {
  id: string
  accountId: string

  // Audit: Created
  createdAt: string
  createdBy: string
  createdByType: 'user' | 'agent'

  // Audit: Updated
  updatedAt: string
  updatedBy: string
  updatedByType: 'user' | 'agent'

  // Soft Delete
  deletedAt?: string
  deletedBy?: string
  deletedByType?: 'user' | 'agent'

  // External Systems
  externalIds?: Record<string, string>

  // Categorization
  tags?: string[]

  // i18n
  locale?: string
  timezone?: string

  // Operations
  idempotencyKey?: string

  // Permissions
  visibility?: 'private' | 'team' | 'account' | 'public'
  ownerId?: string

  // Compliance
  piiFields?: string[]
  retentionPolicy?: string

  // ASI Trust
  trustScore?: number
  verifiedBy?: string[]
  signatureHash?: string
}

// Actor type for audit trail
export interface Actor {
  id: string
  type: 'user' | 'agent'
  name?: string
}

// =============================================================================
// ACCOUNT
// =============================================================================

export interface Account extends BaseEntity {
  name: string
  slug: string
  status: 'active' | 'suspended' | 'cancelled'

  settings?: {
    defaultLocale?: string
    defaultTimezone?: string
    defaultCurrency?: string
  }

  // Billing (reserved)
  currency?: string
  billingEmail?: string
  stripeCustomerId?: string
  plan?: 'free' | 'starter' | 'professional' | 'enterprise'
  planExpiresAt?: string

  // White Label (reserved)
  branding?: {
    logo?: string
    primaryColor?: string
    accentColor?: string
    customDomain?: string
  }
}

// =============================================================================
// PROJECT
// =============================================================================

export interface Project extends BaseEntity {
  name: string
  description?: string
  status: 'active' | 'on_hold' | 'completed' | 'cancelled'

  startDate?: string
  targetDate?: string
  completedDate?: string

  defaultAgentId?: string

  stats?: {
    totalTasks: number
    completedTasks: number
    progress: number
  }
}

// =============================================================================
// AGENT PERSONA
// =============================================================================

export type AgentType =
  | 'content-writer'
  | 'image-generator'
  | 'researcher'
  | 'qa-tester'
  | 'orchestrator'

export type AutonomyLevel = 'supervised' | 'semi-autonomous' | 'autonomous'

export type HealthStatus = 'healthy' | 'degraded' | 'failing' | 'stopped'

export interface AgentPersona extends BaseEntity {
  agentType: AgentType | string

  // Persona (Human-Friendly Identity)
  alias: string
  tagline?: string
  avatar?: string
  description?: string

  // Hierarchy - determines org chart structure
  // reportsTo.type = 'user' means reports to human owner
  // reportsTo.type = 'agent' means reports to another agent (e.g., orchestrator)
  reportsTo?: {
    id: string
    type: 'agent' | 'user'
    name?: string
  }

  // Capabilities & Restrictions
  capabilities: string[]
  restrictions: string[]
  triggers: string[]

  // Autonomy Settings (ASI Safety)
  autonomyLevel: AutonomyLevel
  requiresApproval: string[]
  maxActionsPerHour?: number
  maxCostPerAction?: number
  canSpawnAgents: boolean
  canModifySelf: boolean

  // Health & Status
  isActive: boolean
  pausedAt?: string
  pausedBy?: string
  pauseReason?: string
  consecutiveFailures: number
  maxConsecutiveFailures: number
  lastHealthCheck?: string
  healthStatus: HealthStatus

  // Stats (computed)
  stats?: AgentStats

  // Display
  showOnDashboard: boolean
  showInOrgChart: boolean
  sortOrder?: number
}

export interface AgentStats {
  tasksCompleted: number
  tasksFailed: number
  successRate: number
  avgExecutionTime: number
  lastRunAt?: string
  totalCost?: number
}

// =============================================================================
// TASK
// =============================================================================

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low'

export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'in_progress'
  | 'review'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface StatusHistoryEntry {
  status: TaskStatus
  changedAt: string
  changedBy: string
  changedByType: 'user' | 'agent'
  note?: string
}

export interface TaskError {
  message: string
  code?: string
  stack?: string
}

export interface Task extends BaseEntity {
  title: string
  description?: string

  // Relationships
  projectId?: string
  parentTaskId?: string
  relatedEntityId?: string
  relatedEntityType?: string

  // Assignment
  assignedTo?: string
  assignedToType?: 'user' | 'agent'

  // Scheduling
  priority: TaskPriority
  dueAt?: string
  startedAt?: string
  completedAt?: string

  // Status
  status: TaskStatus
  statusHistory: StatusHistoryEntry[]

  // Context
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  error?: TaskError
}

// =============================================================================
// AGENT ACTION (Reasoning Log)
// =============================================================================

export type ActionStatus = 'pending' | 'success' | 'failed' | 'cancelled'

export interface ActionAlternative {
  action: string
  reason: string
  rejectedBecause: string
}

export interface AgentAction extends BaseEntity {
  agentId: string
  taskId?: string
  goalId?: string

  action: string
  actionType: string
  target?: string

  status: ActionStatus
  result?: unknown
  error?: string

  // Reasoning (ASI Explainability)
  reasoning?: string
  confidence?: number
  alternatives?: ActionAlternative[]

  // Human Override
  humanOverride?: boolean
  humanOverrideBy?: string
  humanOverrideReason?: string

  // Cost & Performance
  executionTimeMs?: number
  cost?: number
  tokensUsed?: number
}

// =============================================================================
// AGENT GOAL
// =============================================================================

export type GoalStatus = 'active' | 'achieved' | 'failed' | 'abandoned'

export interface AgentGoal extends BaseEntity {
  agentId: string

  objective: string
  successCriteria: string[]
  constraints: string[]

  status: GoalStatus
  progress?: number

  // ASI Alignment
  alignedWith?: string[]
  conflictsWith?: string[]
  humanApproved: boolean
  expiresAt?: string
}

// =============================================================================
// AGENT MESSAGE
// =============================================================================

export type MessageType = 'request' | 'response' | 'broadcast' | 'alert' | 'status'
export type MessageProtocol = 'a2a' | 'mcp' | 'internal'
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed'

export interface AgentMessage extends BaseEntity {
  fromId: string
  fromType: 'agent' | 'user'

  toId: string
  toType: 'agent' | 'user'

  messageType: MessageType
  subject?: string
  content: string

  // Threading
  sessionId?: string
  inReplyTo?: string

  // Protocol (A2A/MCP Ready)
  protocol?: MessageProtocol

  // Verification
  signatureHash?: string
  verified?: boolean

  // Status
  status: MessageStatus
  readAt?: string
}

// =============================================================================
// REVIEW
// =============================================================================

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested'

export interface Review extends BaseEntity {
  taskId: string
  agentId: string

  status: ReviewStatus
  reviewedBy?: string
  reviewedAt?: string
  feedback?: string

  requestedChanges?: string[]
}

// =============================================================================
// AGENT NOTE (Voice/Text Capture)
// =============================================================================

export type CaptureContentType = 'voice' | 'text' | 'import'

export interface AgentNote extends BaseEntity {
  content: string
  contentType: CaptureContentType

  // Voice specific
  audioUrl?: string
  transcription?: string

  // Processing
  processedAt?: string
  extractedTasks?: string[]
  extractedProjects?: string[]
}

// =============================================================================
// CONTACT (Unified - Can Become User)
// =============================================================================

export type AuthProvider = 'google' | 'email' | 'microsoft' | 'github'

export interface Contact extends BaseEntity {
  // Identity
  firstName: string
  lastName: string
  email: string
  phone?: string
  avatarUrl?: string

  // Role at account
  title?: string
  department?: string

  // User enablement
  isUser: boolean
  authProvider?: AuthProvider
  lastLoginAt?: string
  permissions?: string[]

  // Metadata
  notes?: string
}

// Helper to get full name
export const getContactFullName = (contact: Contact): string =>
  `${contact.firstName} ${contact.lastName}`.trim()

// =============================================================================
// PROJECT CONTACT (Roles/Assignments)
// =============================================================================

export type ProjectRole = 'owner' | 'stakeholder' | 'reviewer' | 'contributor'

export interface ProjectContact {
  id: string
  accountId: string
  projectId: string
  contactId: string

  role: ProjectRole

  // Notifications
  notifyOnTaskComplete: boolean
  notifyOnMilestone: boolean
  notifyOnReview: boolean

  // Audit
  addedAt: string
  addedBy: string
  addedByType: 'user' | 'agent'

  // Soft Delete
  deletedAt?: string
  deletedBy?: string
  deletedByType?: 'user' | 'agent'
}

// =============================================================================
// MILESTONE (Optional Grouping)
// =============================================================================

export type MilestoneStatus = 'not_started' | 'in_progress' | 'completed'

export interface Milestone extends BaseEntity {
  projectId: string

  name: string
  description?: string

  status: MilestoneStatus
  sortOrder: number

  dueDate?: string
  completedAt?: string
}

// =============================================================================
// AGENT API KEY
// =============================================================================

export type ApiKeyScope =
  | 'queue:read'
  | 'queue:write'
  | 'task:read'
  | 'task:update'
  | 'agent:read'
  | 'agent:update'

export interface AgentApiKey {
  id: string
  accountId: string

  // Key details
  name: string
  keyHash: string // Never exposed to client
  keyPrefix: string // First 8 chars for identification

  // Restrictions
  agentType?: string
  agentId?: string

  // Permissions
  scopes: ApiKeyScope[]

  // Rate limiting
  rateLimitPerMinute: number
  rateLimitPerHour: number

  // Status
  isActive: boolean
  expiresAt?: string

  // Usage tracking
  lastUsedAt?: string
  totalRequests: number

  // Audit
  createdAt: string
  createdBy: string
  createdByType: 'user' | 'agent'
  updatedAt: string
  updatedBy: string
  updatedByType: 'user' | 'agent'

  // Revocation
  revokedAt?: string
  revokedBy?: string
  revokedReason?: string

  tags?: string[]
}

// =============================================================================
// EXTENDED ACCOUNT (with PRD config)
// =============================================================================

export type AccountType = 'internal' | 'client' | 'personal'

export interface AccountConfig {
  website?: string
  cmsEndpoint?: string
  cmsApiKey?: string // Encrypted

  // Brand settings
  brandGuidelines?: string
  defaultTone?: string
  logoUrl?: string
  primaryColor?: string

  // Social
  socialLinks?: {
    linkedin?: string
    twitter?: string
    youtube?: string
  }

  // Agent instructions
  specialInstructions?: string

  // Integrations
  salesforceOrg?: string
  salesforceConnected?: boolean
}

// Extend Account interface with type and config
export interface AccountWithConfig extends Account {
  type: AccountType
  config: AccountConfig
}

// =============================================================================
// DEFAULT AGENT PERSONAS
// =============================================================================

export const DEFAULT_AGENT_PERSONAS: Partial<AgentPersona>[] = [
  {
    agentType: 'content-writer',
    alias: 'Maverick',
    tagline: 'Your content autopilot',
    capabilities: ['web-research', 'write-content', 'generate-images', 'post-to-cms'],
    restrictions: ['edit-production', 'delete-records'],
    triggers: ['manual', 'task-queue'],
    autonomyLevel: 'semi-autonomous',
    requiresApproval: ['publish', 'delete', 'send-email'],
    canSpawnAgents: false,
    canModifySelf: false,
    consecutiveFailures: 0,
    maxConsecutiveFailures: 5,
    healthStatus: 'healthy',
    isActive: true,
    showOnDashboard: true,
    showInOrgChart: true,
    sortOrder: 1,
  },
  {
    agentType: 'image-generator',
    alias: 'Pixel',
    tagline: 'On-brand visuals, instantly',
    capabilities: ['generate-images', 'edit-images'],
    restrictions: ['delete-records'],
    triggers: ['manual', 'task-queue'],
    autonomyLevel: 'semi-autonomous',
    requiresApproval: ['publish'],
    canSpawnAgents: false,
    canModifySelf: false,
    consecutiveFailures: 0,
    maxConsecutiveFailures: 5,
    healthStatus: 'healthy',
    isActive: true,
    showOnDashboard: true,
    showInOrgChart: true,
    sortOrder: 2,
  },
  {
    agentType: 'researcher',
    alias: 'Scout',
    tagline: 'Intel on demand',
    capabilities: ['web-research', 'summarize', 'report'],
    restrictions: ['write-content', 'publish'],
    triggers: ['manual', 'task-queue'],
    autonomyLevel: 'autonomous',
    requiresApproval: [],
    canSpawnAgents: false,
    canModifySelf: false,
    consecutiveFailures: 0,
    maxConsecutiveFailures: 5,
    healthStatus: 'healthy',
    isActive: true,
    showOnDashboard: true,
    showInOrgChart: true,
    sortOrder: 3,
  },
  {
    agentType: 'qa-tester',
    alias: 'Sentinel',
    tagline: 'Quality guardian',
    capabilities: ['test', 'validate', 'report-issues'],
    restrictions: ['write-content', 'publish'],
    triggers: ['manual', 'task-queue', 'schedule:daily'],
    autonomyLevel: 'autonomous',
    requiresApproval: [],
    canSpawnAgents: false,
    canModifySelf: false,
    consecutiveFailures: 0,
    maxConsecutiveFailures: 5,
    healthStatus: 'healthy',
    isActive: true,
    showOnDashboard: true,
    showInOrgChart: true,
    sortOrder: 4,
  },
  {
    agentType: 'orchestrator',
    alias: 'Dispatch',
    tagline: 'Mission control',
    capabilities: ['route-tasks', 'coordinate-agents', 'monitor'],
    restrictions: ['write-content', 'publish'],
    triggers: ['task-queue', 'schedule:hourly'],
    autonomyLevel: 'semi-autonomous',
    requiresApproval: ['spawn-agent'],
    canSpawnAgents: false,
    canModifySelf: false,
    consecutiveFailures: 0,
    maxConsecutiveFailures: 5,
    healthStatus: 'healthy',
    isActive: true,
    showOnDashboard: true,
    showInOrgChart: true,
    sortOrder: 5,
  },
]

// =============================================================================
// SKILL
// =============================================================================

export type SkillSourceType = 'github' | 'local' | 'marketplace'

export interface Skill {
  id: string
  accountId: string
  userId?: string

  // Metadata
  name: string
  description?: string
  version: string
  author?: string
  tags: string[]

  // Content
  content: string

  // Source tracking
  sourceType: SkillSourceType
  sourceUrl?: string
  sourceRepo?: string
  sourcePath?: string
  sourceBranch: string
  sourceSha?: string

  // Status
  isEnabled: boolean
  isOrgShared: boolean

  // Timestamps
  createdAt: string
  updatedAt: string
  lastSyncedAt?: string

  // Soft delete
  deletedAt?: string
}

export interface ProjectSkill {
  id: string
  projectId: string
  skillId: string
  isEnabled: boolean
  createdAt: string
  updatedAt: string
}

// Skill metadata from frontmatter
export interface SkillMetadata {
  name?: string
  description?: string
  version?: string
  author?: string
  tags?: string[]
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

// For creating new entities (omit auto-generated fields)
export type CreateEntity<T extends BaseEntity> = Omit<
  T,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'deletedBy' | 'deletedByType'
>

// For updating entities (partial, omit immutable fields)
export type UpdateEntity<T extends BaseEntity> = Partial<
  Omit<T, 'id' | 'accountId' | 'createdAt' | 'createdBy' | 'createdByType'>
>

// Database field name conversion (camelCase to snake_case)
export type SnakeCase<S extends string> = S extends `${infer T}${infer U}`
  ? `${T extends Capitalize<T> ? '_' : ''}${Lowercase<T>}${SnakeCase<U>}`
  : S
