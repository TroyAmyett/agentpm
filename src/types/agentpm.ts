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
// PROJECT (Project Space)
// =============================================================================

export interface Project extends BaseEntity {
  name: string
  description?: string
  status: 'active' | 'on_hold' | 'completed' | 'cancelled'

  startDate?: string
  targetDate?: string
  completedDate?: string

  defaultAgentId?: string

  // Repository configuration (for Forge)
  repositoryUrl?: string
  repositoryPath?: string
  baseBranch: string
  testCommand?: string
  buildCommand?: string

  // Defaults
  defaultPriority: TaskPriority

  stats?: {
    totalTasks: number
    completedTasks: number
    progress: number
  }
}

// =============================================================================
// PROJECT LINKED ITEM (Many-to-Many: Projects <-> Folders/Notes)
// =============================================================================

export interface ProjectLinkedItem {
  id: string
  accountId: string
  projectId: string
  itemType: 'folder' | 'note'
  itemId: string
  addedAt: string
  addedBy: string
  addedByType: 'user' | 'agent'
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
  | 'forge' // Developer agent - executes PRDs against code

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
  | 'draft'       // Inbox - safe zone for tasks being created/refined
  | 'pending'     // Ready - approved for work, will be auto-routed
  | 'queued'      // Assigned to agent, waiting for execution
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
  milestoneId?: string
  skillId?: string
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

  // Estimation
  estimatedHours?: number
  storyPoints?: number
  actualHours?: number

  // Calculated dates (from dependencies)
  scheduledStartDate?: string
  scheduledEndDate?: string
  calculatedStartDate?: string
  calculatedEndDate?: string

  // Source tracking (which note/section generated this task)
  sourceNoteId?: string
  sourceSection?: string

  // Context
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  error?: TaskError

  // Computed dependency info (from view)
  blockedBy?: string[]
  blocks?: string[]
  isBlocked?: boolean
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
// MILESTONE
// =============================================================================

export type MilestoneStatus = 'not_started' | 'in_progress' | 'completed'

export type ScheduleType = 'none' | 'once' | 'daily' | 'weekly' | 'monthly'

export interface MilestoneSchedule {
  type: ScheduleType
  hour: number // 0-23, hour of day to run (on the hour only)
  dayOfWeek?: number // 0-6 (Sunday-Saturday) for weekly
  dayOfMonth?: number // 1-31 for monthly
  runDate?: string // ISO date for one-time schedules
  endDate?: string // Optional end date for recurring schedules
}

export interface Milestone extends BaseEntity {
  projectId: string

  name: string
  description?: string

  status: MilestoneStatus
  sortOrder: number

  dueDate?: string
  completedAt?: string

  // Scheduling
  schedule?: MilestoneSchedule
  nextRunAt?: string // Next scheduled execution time
  lastRunAt?: string // Last time this schedule ran
  isScheduleActive?: boolean // Whether the schedule is enabled
}

// =============================================================================
// TASK DEPENDENCY
// =============================================================================

// Dependency types (standard PM terminology)
// FS = Finish-to-Start (most common: B can't start until A finishes)
// SS = Start-to-Start (B can't start until A starts)
// FF = Finish-to-Finish (B can't finish until A finishes)
// SF = Start-to-Finish (B can't finish until A starts, rare)
export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF'

export interface TaskDependency {
  id: string
  accountId: string

  // The task that has the dependency
  taskId: string

  // The task it depends on
  dependsOnTaskId: string

  // Dependency type
  dependencyType: DependencyType

  // Lag time in days (positive = delay, negative = overlap)
  lagDays?: number

  // Audit
  createdAt: string
  createdBy: string
  createdByType: 'user' | 'agent'
}

// =============================================================================
// SYSTEM KNOWLEDGE (Global Level - Applies to ALL users)
// =============================================================================

export type SystemKnowledgeCategory =
  | 'platform'      // General Funnelists platform info
  | 'tool'          // Specific tool documentation
  | 'integration'   // How tools work together
  | 'workflow'      // Best practices and workflows
  | 'best-practice' // Tips and recommendations

export type FunnelistsTool = 'agentpm' | 'canvas' | 'radar' | 'leadgen'

export interface SystemKnowledge {
  id: string

  // Categorization
  category: SystemKnowledgeCategory
  toolName?: FunnelistsTool // null for general platform knowledge

  // Content
  title: string
  content: string

  // Metadata
  tags: string[]
  priority: number // Lower = higher priority

  // Status
  isActive: boolean

  // Audit
  createdAt: string
  createdBy?: string
  updatedAt: string
  updatedBy?: string
}

// =============================================================================
// KNOWLEDGE ENTRY (Account/Team/Project Level)
// =============================================================================

export type KnowledgeType =
  | 'fact'        // "API uses REST, not GraphQL"
  | 'decision'    // "We chose Tailwind over CSS modules"
  | 'constraint'  // "Must support IE11"
  | 'reference'   // "Brand guidelines at /docs/brand.md"
  | 'glossary'    // "PRD = Product Requirements Document"

// Knowledge scope determines visibility level
export type KnowledgeScope =
  | 'account'   // Visible to all users in the account
  | 'team'      // Visible to team members (future)
  | 'project'   // Visible only in the project context

export interface KnowledgeEntry extends BaseEntity {
  // Scope and hierarchy
  scope: KnowledgeScope
  projectId?: string  // Required for project-scope, optional for account/team
  teamId?: string     // For team-scoped knowledge (future)

  knowledgeType: KnowledgeType
  content: string

  // Source tracking
  sourceNoteId?: string
  sourceTaskId?: string
  extractedAt?: string
  extractedBy?: string  // AI model name or user ID

  // Validation
  isVerified: boolean
  verifiedAt?: string

  // Relevance
  relatedEntityIds?: string[]
}

// =============================================================================
// TIME ENTRY
// =============================================================================

export interface TimeEntry {
  id: string
  accountId: string
  taskId: string

  // Who logged time
  userId?: string
  agentId?: string

  // Time logged
  hours: number
  description?: string
  entryDate: string

  // Audit
  createdAt: string
  createdBy: string
  createdByType: 'user' | 'agent'
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

// Fixed demo agent UUIDs for hierarchy references
export const DEMO_ORCHESTRATOR_ID = '00000000-0000-0000-0000-000000000005'

export const DEFAULT_AGENT_PERSONAS: Partial<AgentPersona>[] = [
  // Orchestrator first (index 0) - reports to user
  {
    agentType: 'orchestrator',
    alias: 'Atlas',
    tagline: 'Mission control',
    capabilities: ['route-tasks', 'coordinate-agents', 'monitor'],
    restrictions: ['write-content', 'publish'],
    triggers: ['task-queue', 'schedule:hourly'],
    autonomyLevel: 'semi-autonomous',
    requiresApproval: ['spawn-agent'],
    canSpawnAgents: true,
    canModifySelf: false,
    consecutiveFailures: 0,
    maxConsecutiveFailures: 5,
    healthStatus: 'healthy',
    isActive: true,
    showOnDashboard: true,
    showInOrgChart: true,
    sortOrder: 1,
    reportsTo: { type: 'user', id: 'user' },
  },
  // Workers report to orchestrator
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
    sortOrder: 2,
    reportsTo: { type: 'agent', id: DEMO_ORCHESTRATOR_ID, name: 'Atlas' },
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
    sortOrder: 3,
    reportsTo: { type: 'agent', id: DEMO_ORCHESTRATOR_ID, name: 'Atlas' },
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
    sortOrder: 4,
    reportsTo: { type: 'agent', id: DEMO_ORCHESTRATOR_ID, name: 'Atlas' },
  },
  {
    agentType: 'forge',
    alias: 'Forge',
    tagline: 'Code from PRDs, autonomously',
    description: 'Developer agent that transforms PRDs into working code using Claude Code CLI. Creates branches, implements features, runs tests, and submits pull requests.',
    capabilities: [
      'read-codebase',
      'analyze-code',
      'create-branch',
      'write-code',
      'run-tests',
      'commit-changes',
      'push-to-remote',
      'create-pull-request',
    ],
    restrictions: [
      'force-push',
      'delete-branches',
      'merge-to-main',
      'delete-repositories',
      'modify-ci-config',
    ],
    triggers: ['manual', 'task-queue'],
    autonomyLevel: 'semi-autonomous',
    requiresApproval: ['push-to-remote', 'create-pull-request'],
    maxActionsPerHour: 50,
    maxCostPerAction: 1000, // 10 dollars in cents
    canSpawnAgents: false,
    canModifySelf: false,
    consecutiveFailures: 0,
    maxConsecutiveFailures: 3,
    healthStatus: 'healthy',
    isActive: true,
    showOnDashboard: true,
    showInOrgChart: true,
    sortOrder: 5,
    reportsTo: { type: 'agent', id: DEMO_ORCHESTRATOR_ID, name: 'Atlas' },
  },
]

// =============================================================================
// SKILL
// =============================================================================

export type SkillSourceType = 'github' | 'local' | 'marketplace'
export type SkillTier = 'free' | 'pro' | 'business' | 'enterprise'

export interface SkillBuilderMessage {
  role: 'user' | 'assistant'
  content: string
}

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

  // Categorization
  category?: string
  icon?: string
  slug?: string

  // Status
  isEnabled: boolean
  isOrgShared: boolean

  // Skills Builder fields
  namespace?: string // '@fun' for official skills, null for user-created
  forkedFrom?: string // UUID of the skill this was customized from
  tier: SkillTier // Subscription tier required
  builderConversation?: SkillBuilderMessage[] // Chat history for editing

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
  category?: SkillCategory
}

// =============================================================================
// SKILLS INDEX (Agent-Agnostic Curated Skills)
// =============================================================================

// Supported AI agents/platforms
export type SkillAgent =
  | 'universal'   // Works with any agent
  | 'claude'      // Anthropic Claude
  | 'gemini'      // Google Gemini
  | 'gpt'         // OpenAI GPT
  | 'grok'        // xAI Grok
  | 'llama'       // Meta Llama
  | 'mistral'     // Mistral AI
  | 'copilot'     // GitHub Copilot

// Skill categories
export type SkillCategory =
  | 'development'     // Coding, debugging, code review
  | 'writing'         // Content creation, documentation
  | 'analysis'        // Data analysis, research
  | 'productivity'    // Task management, planning
  | 'design'          // UI/UX, visual design
  | 'devops'          // CI/CD, infrastructure
  | 'security'        // Security audits, vulnerability analysis
  | 'data'            // Data processing, ETL
  | 'communication'   // Email, presentations
  | 'integration'     // API integrations, platform connectors (Salesforce, etc.)
  | 'testing'         // QA, performance testing, test automation
  | 'other'

// Approval status
export type SkillApprovalStatus =
  | 'pending'     // Submitted, awaiting review
  | 'approved'    // Reviewed and approved
  | 'rejected'    // Reviewed and rejected
  | 'deprecated'  // Was approved but now outdated

// Skills Index entry (curated, approved skills)
export interface SkillIndexEntry {
  id: string

  // Basic info
  name: string
  slug: string
  description: string
  longDescription?: string

  // Categorization
  category: SkillCategory
  tags: string[]

  // Authorship
  authorName?: string
  authorUrl?: string
  authorVerified: boolean

  // Source
  githubUrl?: string
  githubOwner?: string
  githubRepo?: string
  githubPath?: string
  githubBranch: string
  rawContentUrl?: string

  // Version tracking
  version: string
  lastCommitSha?: string
  contentHash?: string

  // Agent compatibility
  compatibleAgents: SkillAgent[]
  minContextWindow?: number
  requiresTools: string[]

  // Skill format
  formatVersion: string
  hasConditionalSections: boolean

  // Approval & curation
  approvalStatus: SkillApprovalStatus
  approvedBy?: string
  approvedAt?: string
  rejectionReason?: string

  // Featuring
  isFeatured: boolean
  featuredOrder?: number
  featuredAt?: string

  // Stats
  importCount: number
  starCount: number

  // Preview
  previewSnippet?: string

  // Timestamps
  createdAt: string
  updatedAt: string
  lastSyncedAt?: string

  // Soft delete
  deletedAt?: string
  deletedBy?: string
}

// Search result with ranking
export interface SkillIndexSearchResult extends SkillIndexEntry {
  rank: number
}

// Search filters
export interface SkillIndexFilters {
  query?: string
  category?: SkillCategory
  agent?: SkillAgent
  tags?: string[]
}

// Skill import tracking
export interface SkillImport {
  id: string
  skillsIndexId: string
  skillId: string
  accountId: string
  userId?: string
  importedVersion: string
  importedAt: string
  updateAvailable: boolean
  lastCheckedAt?: string
}

// =============================================================================
// SKILL DISCOVERY (Trending/Hot Skills from GitHub)
// =============================================================================

export type DiscoverySourceType = 'official' | 'curated' | 'community'
export type DiscoverySortOption = 'hotness' | 'stars' | 'recent' | 'new'

export interface DiscoveredSkill {
  id: string
  githubId: number
  fullName: string
  name: string
  ownerLogin: string
  ownerAvatarUrl: string | null
  description: string | null
  htmlUrl: string
  stargazersCount: number
  forksCount: number
  openIssuesCount: number
  topics: string[]
  defaultBranch: string
  licenseName: string | null
  sourceType: DiscoverySourceType
  category: string | null
  skillMdUrl: string | null
  skillMdContent: string | null
  aiSummary: string | null
  aiSummaryUpdatedAt: string | null
  githubCreatedAt: string
  githubUpdatedAt: string
  githubPushedAt: string
  createdAt: string
  updatedAt: string
  // Computed from view
  hotnessScore: number
  isNew: boolean
  isRecentlyUpdated: boolean
  isHot: boolean
}

export interface DiscoveryStats {
  total: number
  totalStars: number
  newThisWeek: number
  hotCount: number
}

// Agent display info for UI
export const SKILL_AGENT_INFO: Record<SkillAgent, { label: string; icon?: string; color: string }> = {
  universal: { label: 'Universal', color: 'gray' },
  claude: { label: 'Claude', color: 'orange' },
  gemini: { label: 'Gemini', color: 'blue' },
  gpt: { label: 'GPT', color: 'green' },
  grok: { label: 'Grok', color: 'purple' },
  llama: { label: 'Llama', color: 'indigo' },
  mistral: { label: 'Mistral', color: 'cyan' },
  copilot: { label: 'Copilot', color: 'slate' },
}

// Category display info for UI
export const SKILL_CATEGORY_INFO: Record<SkillCategory, { label: string; icon?: string }> = {
  development: { label: 'Development' },
  writing: { label: 'Writing' },
  analysis: { label: 'Analysis' },
  productivity: { label: 'Productivity' },
  design: { label: 'Design' },
  devops: { label: 'DevOps' },
  security: { label: 'Security' },
  data: { label: 'Data' },
  communication: { label: 'Communication' },
  integration: { label: 'Integration' },
  testing: { label: 'Testing & QA' },
  other: { label: 'Other' },
}

// =============================================================================
// FORGE AGENT TYPES (Developer Agent)
// =============================================================================

// Forge task input - PRD and repository configuration
export interface ForgeTaskInput {
  // PRD content (from note or direct input)
  prdContent: string
  prdNoteId?: string // Link back to source note

  // Repository configuration
  repositoryPath: string // Local path to codebase
  repositoryUrl?: string // Git remote URL
  baseBranch: string // Branch to base work off (e.g., 'main')
  targetBranch?: string // Custom branch name (auto-generated if not provided)

  // Execution settings
  runTests: boolean
  createPullRequest: boolean
  autoCommit: boolean

  // Context
  codebaseContext?: string // Additional context about the codebase
  relevantFiles?: string[] // Specific files to focus on
  testCommand?: string // Custom test command (e.g., 'npm test')
}

// Forge task output - execution results
export interface ForgeTaskOutput {
  // Branch info
  branchName: string
  branchCreatedAt?: string

  // Commits made
  commits: ForgeCommit[]

  // Pull request (if created)
  pullRequest?: ForgePullRequest

  // Test results
  testResults?: ForgeTestResults

  // Files changed
  filesChanged: ForgeFileChange[]

  // Execution summary
  summary: string
  totalTokensUsed?: number
  totalCost?: number
  executionTimeMs?: number
}

export interface ForgeCommit {
  sha: string
  message: string
  filesChanged: string[]
  timestamp: string
}

export interface ForgePullRequest {
  number: number
  url: string
  title: string
  body: string
  createdAt: string
  headBranch: string
  baseBranch: string
}

export interface ForgeTestResults {
  passed: boolean
  totalTests: number
  passedTests: number
  failedTests: number
  skippedTests: number
  output?: string
  failedTestNames?: string[]
}

export interface ForgeFileChange {
  path: string
  changeType: 'added' | 'modified' | 'deleted' | 'renamed'
  additions: number
  deletions: number
  oldPath?: string // For renamed files
}

// Forge action types for logging
export type ForgeActionType =
  | 'analyze-prd'
  | 'read-codebase'
  | 'create-branch'
  | 'write-file'
  | 'delete-file'
  | 'run-tests'
  | 'commit'
  | 'push'
  | 'create-pr'
  | 'claude-code-execute'

// Forge execution status
export type ForgeExecutionStatus =
  | 'initializing'
  | 'analyzing'
  | 'implementing'
  | 'testing'
  | 'committing'
  | 'pushing'
  | 'creating-pr'
  | 'completed'
  | 'failed'
  | 'awaiting-approval'

// Forge session - tracks a single PRD execution
export interface ForgeSession {
  id: string
  taskId: string
  agentId: string
  accountId: string

  // Input
  input: ForgeTaskInput

  // Status
  status: ForgeExecutionStatus
  currentStep?: string
  progress?: number // 0-100

  // Output (built up during execution)
  output?: Partial<ForgeTaskOutput>

  // Claude Code CLI integration
  claudeCodeSessionId?: string
  claudeCodeOutputPath?: string

  // Error tracking
  error?: string
  errorStep?: string

  // Timestamps
  startedAt: string
  completedAt?: string
  lastActivityAt: string

  // Audit
  createdBy: string
  createdByType: 'user' | 'agent'
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
