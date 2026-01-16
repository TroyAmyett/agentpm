# AgentPM Architecture - React + Vite + Supabase
**Version:** 1.0
**Adapted From:** AI-Project-Manager-Spec-v2.md + Funnelists-Enterprise-Base-Data-Model.md
**Target Stack:** React 18 + Vite + Supabase + Zustand
**Date:** January 2025

---

## Overview

This document adapts the AgentPM specification to work within the existing Notetaker application architecture. Instead of Next.js, we use React + Vite with Supabase handling all backend concerns.

### Architecture Mapping

| AgentPM Spec | Adapted Implementation |
|--------------|------------------------|
| Next.js 14 | React 18 + Vite 6 |
| Next.js API Routes | Supabase Edge Functions |
| BullMQ Queue | Supabase pg_cron + Edge Functions |
| PostgreSQL | Supabase PostgreSQL |
| Auth | Supabase Auth (already implemented) |
| Realtime | Supabase Realtime (already implemented) |

---

## Part 1: Data Model (Supabase Schema)

All entities extend BaseEntity fields. Implemented as PostgreSQL tables with Row Level Security (RLS).

### 1.1 Base Entity Fields (Applied to All Tables)

```sql
-- These columns are added to EVERY table
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
account_id UUID NOT NULL REFERENCES accounts(id),

-- Audit: Created
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
created_by UUID NOT NULL,
created_by_type TEXT NOT NULL CHECK (created_by_type IN ('user', 'agent')),

-- Audit: Updated
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_by UUID NOT NULL,
updated_by_type TEXT NOT NULL CHECK (updated_by_type IN ('user', 'agent')),

-- Soft Delete
deleted_at TIMESTAMPTZ,
deleted_by UUID,
deleted_by_type TEXT CHECK (deleted_by_type IN ('user', 'agent')),

-- External Systems
external_ids JSONB DEFAULT '{}',

-- Categorization
tags TEXT[] DEFAULT '{}',

-- i18n
locale TEXT,
timezone TEXT,

-- Operations
idempotency_key TEXT,

-- Permissions
visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'team', 'account', 'public')),
owner_id UUID,

-- Compliance
pii_fields TEXT[],
retention_policy TEXT,

-- ASI Trust
trust_score DECIMAL(3,2),
verified_by UUID[],
signature_hash TEXT
```

### 1.2 Accounts Table

```sql
CREATE TABLE accounts (
  -- Base Entity fields (see 1.1)

  -- Account specific
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),

  -- Settings
  settings JSONB DEFAULT '{
    "defaultLocale": "en-US",
    "defaultTimezone": "America/New_York",
    "defaultCurrency": "USD"
  }',

  -- Billing (reserved)
  currency TEXT DEFAULT 'USD',
  billing_email TEXT,
  stripe_customer_id TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'professional', 'enterprise')),
  plan_expires_at TIMESTAMPTZ,

  -- White Label (reserved)
  branding JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX idx_accounts_slug ON accounts(slug);
CREATE INDEX idx_accounts_status ON accounts(status);
```

### 1.3 Projects Table

```sql
CREATE TABLE projects (
  -- Base Entity fields
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  created_by_type TEXT NOT NULL DEFAULT 'user',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID NOT NULL,
  updated_by_type TEXT NOT NULL DEFAULT 'user',
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  deleted_by_type TEXT,
  external_ids JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  owner_id UUID,

  -- Project specific
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_hold', 'completed', 'cancelled')),

  -- Dates
  start_date DATE,
  target_date DATE,
  completed_date DATE,

  -- Settings
  default_agent_id UUID REFERENCES agent_personas(id),

  -- Stats (computed, updated by trigger)
  stats JSONB DEFAULT '{
    "totalTasks": 0,
    "completedTasks": 0,
    "progress": 0
  }'
);

-- Indexes
CREATE INDEX idx_projects_account_id ON projects(account_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_deleted_at ON projects(deleted_at);
```

### 1.4 Agent Personas Table

```sql
CREATE TABLE agent_personas (
  -- Base Entity fields
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  created_by_type TEXT NOT NULL DEFAULT 'user',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID NOT NULL,
  updated_by_type TEXT NOT NULL DEFAULT 'user',
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  deleted_by_type TEXT,
  tags TEXT[] DEFAULT '{}',
  owner_id UUID,

  -- Agent Type
  agent_type TEXT NOT NULL, -- 'content-writer', 'image-generator', 'researcher', etc.

  -- Persona (Human-Friendly Identity)
  alias TEXT NOT NULL, -- 'Maverick', 'Pixel', 'Scout'
  tagline TEXT, -- 'Your content autopilot'
  avatar TEXT, -- URL to avatar image
  description TEXT,

  -- Hierarchy
  reports_to JSONB, -- { id: string, type: 'agent' | 'user', name?: string }

  -- Capabilities & Restrictions
  capabilities TEXT[] NOT NULL DEFAULT '{}', -- ['web-research', 'write-content']
  restrictions TEXT[] DEFAULT '{}', -- ['edit-production', 'delete-records']
  triggers TEXT[] DEFAULT '{}', -- ['manual', 'task-queue', 'schedule:daily']

  -- Autonomy Settings (ASI Safety)
  autonomy_level TEXT NOT NULL DEFAULT 'supervised' CHECK (autonomy_level IN ('supervised', 'semi-autonomous', 'autonomous')),
  requires_approval TEXT[] DEFAULT '{}', -- ['publish', 'delete', 'send-email']
  max_actions_per_hour INTEGER DEFAULT 50,
  max_cost_per_action INTEGER DEFAULT 100, -- cents
  can_spawn_agents BOOLEAN DEFAULT FALSE,
  can_modify_self BOOLEAN DEFAULT FALSE,

  -- Health & Status
  is_active BOOLEAN DEFAULT TRUE,
  paused_at TIMESTAMPTZ,
  paused_by UUID,
  pause_reason TEXT,
  consecutive_failures INTEGER DEFAULT 0,
  max_consecutive_failures INTEGER DEFAULT 5,
  last_health_check TIMESTAMPTZ,
  health_status TEXT DEFAULT 'healthy' CHECK (health_status IN ('healthy', 'degraded', 'failing', 'stopped')),

  -- Stats (computed)
  stats JSONB DEFAULT '{
    "tasksCompleted": 0,
    "tasksFailed": 0,
    "successRate": 100,
    "avgExecutionTime": 0,
    "totalCost": 0
  }',

  -- Display
  show_on_dashboard BOOLEAN DEFAULT TRUE,
  show_in_org_chart BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0
);

-- Indexes
CREATE INDEX idx_agent_personas_account_id ON agent_personas(account_id);
CREATE INDEX idx_agent_personas_agent_type ON agent_personas(agent_type);
CREATE INDEX idx_agent_personas_is_active ON agent_personas(is_active);
CREATE INDEX idx_agent_personas_deleted_at ON agent_personas(deleted_at);
```

### 1.5 Tasks Table

```sql
CREATE TABLE tasks (
  -- Base Entity fields
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  created_by_type TEXT NOT NULL DEFAULT 'user',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID NOT NULL,
  updated_by_type TEXT NOT NULL DEFAULT 'user',
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  deleted_by_type TEXT,
  external_ids JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  owner_id UUID,

  -- Task Definition
  title TEXT NOT NULL,
  description TEXT,

  -- Relationships
  project_id UUID REFERENCES projects(id),
  parent_task_id UUID REFERENCES tasks(id),
  related_entity_id UUID,
  related_entity_type TEXT,

  -- Assignment
  assigned_to UUID, -- User ID or Agent Persona ID
  assigned_to_type TEXT CHECK (assigned_to_type IN ('user', 'agent')),

  -- Scheduling
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  due_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'in_progress', 'review', 'completed', 'failed', 'cancelled')),
  status_history JSONB DEFAULT '[]', -- Array of { status, changedAt, changedBy, changedByType, note? }

  -- Context
  input JSONB DEFAULT '{}', -- Input data for the task
  output JSONB DEFAULT '{}', -- Result of the task
  error JSONB -- { message, code?, stack? }
);

-- Indexes
CREATE INDEX idx_tasks_account_id ON tasks(account_id);
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_due_at ON tasks(due_at);
CREATE INDEX idx_tasks_deleted_at ON tasks(deleted_at);
```

### 1.6 Agent Actions Table (Reasoning Log)

```sql
CREATE TABLE agent_actions (
  -- Base Entity fields
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  created_by_type TEXT NOT NULL DEFAULT 'agent',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID NOT NULL,
  updated_by_type TEXT NOT NULL DEFAULT 'agent',
  deleted_at TIMESTAMPTZ,

  -- Relationships
  agent_id UUID NOT NULL REFERENCES agent_personas(id),
  task_id UUID REFERENCES tasks(id),
  goal_id UUID,

  -- Action
  action TEXT NOT NULL, -- What was done
  action_type TEXT NOT NULL, -- 'create', 'update', 'delete', 'api-call', etc.
  target TEXT, -- What was acted upon

  -- Result
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
  result JSONB, -- Action output
  error TEXT,

  -- Reasoning (ASI Explainability)
  reasoning TEXT,
  confidence DECIMAL(3,2), -- 0.00 to 1.00
  alternatives JSONB DEFAULT '[]', -- Array of { action, reason, rejectedBecause }

  -- Human Override
  human_override BOOLEAN DEFAULT FALSE,
  human_override_by UUID,
  human_override_reason TEXT,

  -- Cost & Performance
  execution_time_ms INTEGER,
  cost INTEGER, -- cents
  tokens_used INTEGER
);

-- Indexes
CREATE INDEX idx_agent_actions_account_id ON agent_actions(account_id);
CREATE INDEX idx_agent_actions_agent_id ON agent_actions(agent_id);
CREATE INDEX idx_agent_actions_task_id ON agent_actions(task_id);
CREATE INDEX idx_agent_actions_created_at ON agent_actions(created_at);
CREATE INDEX idx_agent_actions_status ON agent_actions(status);
```

### 1.7 Reviews Table

```sql
CREATE TABLE reviews (
  -- Base Entity fields
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  created_by_type TEXT NOT NULL DEFAULT 'user',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID NOT NULL,
  updated_by_type TEXT NOT NULL DEFAULT 'user',
  deleted_at TIMESTAMPTZ,

  -- What's being reviewed
  task_id UUID NOT NULL REFERENCES tasks(id),
  agent_id UUID NOT NULL REFERENCES agent_personas(id),

  -- Review details
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'changes_requested')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  feedback TEXT,

  -- For changes requested
  requested_changes TEXT[]
);

-- Indexes
CREATE INDEX idx_reviews_account_id ON reviews(account_id);
CREATE INDEX idx_reviews_task_id ON reviews(task_id);
CREATE INDEX idx_reviews_status ON reviews(status);
```

### 1.8 Notes Table (Voice/Text Captures)

```sql
CREATE TABLE agent_notes (
  -- Base Entity fields
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  created_by_type TEXT NOT NULL DEFAULT 'user',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID NOT NULL,
  updated_by_type TEXT NOT NULL DEFAULT 'user',
  deleted_at TIMESTAMPTZ,

  -- Raw capture
  content TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('voice', 'text', 'import')),

  -- Voice specific
  audio_url TEXT,
  transcription TEXT,

  -- Processing
  processed_at TIMESTAMPTZ,
  extracted_tasks UUID[] DEFAULT '{}', -- Task IDs created from this note
  extracted_projects UUID[] DEFAULT '{}' -- Project IDs created
);

-- Indexes
CREATE INDEX idx_agent_notes_account_id ON agent_notes(account_id);
CREATE INDEX idx_agent_notes_content_type ON agent_notes(content_type);
CREATE INDEX idx_agent_notes_processed_at ON agent_notes(processed_at);
```

---

## Part 2: Row Level Security (RLS)

All tables use RLS for multi-tenant isolation.

```sql
-- Enable RLS on all tables
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_notes ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's account_id
CREATE OR REPLACE FUNCTION get_user_account_id()
RETURNS UUID AS $$
  SELECT account_id FROM users WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER;

-- Standard RLS policy pattern (apply to each table)
-- Example for tasks table:

CREATE POLICY "Users can view tasks in their account"
  ON tasks FOR SELECT
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

CREATE POLICY "Users can insert tasks in their account"
  ON tasks FOR INSERT
  WITH CHECK (account_id = get_user_account_id());

CREATE POLICY "Users can update tasks in their account"
  ON tasks FOR UPDATE
  USING (account_id = get_user_account_id() AND deleted_at IS NULL);

-- Note: No DELETE policy - we use soft delete via UPDATE
```

---

## Part 3: TypeScript Types

Located in `src/types/agentpm.ts`

```typescript
// Base Entity - all entities extend this
export interface BaseEntity {
  id: string;
  accountId: string;

  // Audit: Created
  createdAt: string; // ISO timestamp
  createdBy: string;
  createdByType: 'user' | 'agent';

  // Audit: Updated
  updatedAt: string;
  updatedBy: string;
  updatedByType: 'user' | 'agent';

  // Soft Delete
  deletedAt?: string;
  deletedBy?: string;
  deletedByType?: 'user' | 'agent';

  // External Systems
  externalIds?: Record<string, string>;

  // Categorization
  tags?: string[];

  // i18n
  locale?: string;
  timezone?: string;

  // Permissions
  visibility?: 'private' | 'team' | 'account' | 'public';
  ownerId?: string;

  // ASI Trust
  trustScore?: number;
  verifiedBy?: string[];
}

// Project
export interface Project extends BaseEntity {
  name: string;
  description?: string;
  status: 'active' | 'on_hold' | 'completed' | 'cancelled';

  startDate?: string;
  targetDate?: string;
  completedDate?: string;

  defaultAgentId?: string;

  stats?: {
    totalTasks: number;
    completedTasks: number;
    progress: number;
  };
}

// Agent Persona
export interface AgentPersona extends BaseEntity {
  agentType: string;

  // Persona
  alias: string;
  tagline?: string;
  avatar?: string;
  description?: string;

  // Hierarchy
  reportsTo?: {
    id: string;
    type: 'agent' | 'user';
    name?: string;
  };

  // Capabilities
  capabilities: string[];
  restrictions: string[];
  triggers: string[];

  // Autonomy (ASI Safety)
  autonomyLevel: 'supervised' | 'semi-autonomous' | 'autonomous';
  requiresApproval: string[];
  maxActionsPerHour?: number;
  maxCostPerAction?: number;
  canSpawnAgents: boolean;
  canModifySelf: boolean;

  // Health
  isActive: boolean;
  pausedAt?: string;
  pausedBy?: string;
  pauseReason?: string;
  consecutiveFailures: number;
  maxConsecutiveFailures: number;
  lastHealthCheck?: string;
  healthStatus: 'healthy' | 'degraded' | 'failing' | 'stopped';

  // Stats
  stats?: {
    tasksCompleted: number;
    tasksFailed: number;
    successRate: number;
    avgExecutionTime: number;
    lastRunAt?: string;
    totalCost?: number;
  };

  // Display
  showOnDashboard: boolean;
  showInOrgChart: boolean;
  sortOrder?: number;
}

// Task
export interface Task extends BaseEntity {
  title: string;
  description?: string;

  projectId?: string;
  parentTaskId?: string;
  relatedEntityId?: string;
  relatedEntityType?: string;

  assignedTo?: string;
  assignedToType?: 'user' | 'agent';

  priority: 'critical' | 'high' | 'medium' | 'low';
  dueAt?: string;
  startedAt?: string;
  completedAt?: string;

  status: 'pending' | 'queued' | 'in_progress' | 'review' | 'completed' | 'failed' | 'cancelled';
  statusHistory: StatusHistoryEntry[];

  input?: Record<string, any>;
  output?: Record<string, any>;
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
}

export interface StatusHistoryEntry {
  status: string;
  changedAt: string;
  changedBy: string;
  changedByType: 'user' | 'agent';
  note?: string;
}

// Agent Action (Reasoning Log)
export interface AgentAction extends BaseEntity {
  agentId: string;
  taskId?: string;
  goalId?: string;

  action: string;
  actionType: string;
  target?: string;

  status: 'pending' | 'success' | 'failed' | 'cancelled';
  result?: any;
  error?: string;

  reasoning?: string;
  confidence?: number;
  alternatives?: {
    action: string;
    reason: string;
    rejectedBecause: string;
  }[];

  humanOverride?: boolean;
  humanOverrideBy?: string;
  humanOverrideReason?: string;

  executionTimeMs?: number;
  cost?: number;
  tokensUsed?: number;
}

// Review
export interface Review extends BaseEntity {
  taskId: string;
  agentId: string;

  status: 'pending' | 'approved' | 'rejected' | 'changes_requested';
  reviewedBy?: string;
  reviewedAt?: string;
  feedback?: string;

  requestedChanges?: string[];
}

// Agent Note (Voice/Text Capture)
export interface AgentNote extends BaseEntity {
  content: string;
  contentType: 'voice' | 'text' | 'import';

  audioUrl?: string;
  transcription?: string;

  processedAt?: string;
  extractedTasks?: string[];
  extractedProjects?: string[];
}

// Actor type for audit trail
export interface Actor {
  id: string;
  type: 'user' | 'agent';
  name?: string;
}

// Default Agent Personas (seeded per account)
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
  },
];
```

---

## Part 4: Zustand Stores

### 4.1 Agent Store (`src/stores/agentStore.ts`)

```typescript
import { create } from 'zustand';
import { supabase } from '../services/supabase/client';
import type { AgentPersona, Task, AgentAction } from '../types/agentpm';

interface AgentState {
  agents: AgentPersona[];
  selectedAgentId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchAgents: () => Promise<void>;
  selectAgent: (id: string | null) => void;
  updateAgent: (id: string, updates: Partial<AgentPersona>) => Promise<void>;
  pauseAgent: (id: string, reason: string) => Promise<void>;
  resumeAgent: (id: string) => Promise<void>;

  // Realtime subscription
  subscribeToAgents: () => () => void;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  selectedAgentId: null,
  isLoading: false,
  error: null,

  fetchAgents: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('agent_personas')
        .select('*')
        .is('deleted_at', null)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      set({ agents: data || [], isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  selectAgent: (id) => set({ selectedAgentId: id }),

  updateAgent: async (id, updates) => {
    // Optimistic update
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      ),
    }));

    const { error } = await supabase
      .from('agent_personas')
      .update(updates)
      .eq('id', id);

    if (error) {
      get().fetchAgents(); // Revert on error
      throw error;
    }
  },

  pauseAgent: async (id, reason) => {
    await get().updateAgent(id, {
      pausedAt: new Date().toISOString(),
      pauseReason: reason,
    });
  },

  resumeAgent: async (id) => {
    await get().updateAgent(id, {
      pausedAt: undefined,
      pauseReason: undefined,
    });
  },

  subscribeToAgents: () => {
    const subscription = supabase
      .channel('agent_personas_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agent_personas' },
        (payload) => {
          // Handle realtime updates
          if (payload.eventType === 'UPDATE') {
            set((state) => ({
              agents: state.agents.map((a) =>
                a.id === payload.new.id ? { ...a, ...payload.new } : a
              ),
            }));
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  },
}));
```

### 4.2 Task Store (`src/stores/taskStore.ts`)

```typescript
import { create } from 'zustand';
import { supabase } from '../services/supabase/client';
import type { Task, StatusHistoryEntry } from '../types/agentpm';

interface TaskState {
  tasks: Task[];
  selectedTaskId: string | null;
  isLoading: boolean;
  error: string | null;

  // Filters
  statusFilter: string | null;
  assigneeFilter: string | null;

  // Actions
  fetchTasks: (projectId?: string) => Promise<void>;
  createTask: (task: Partial<Task>) => Promise<Task>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  assignTask: (id: string, assignedTo: string, assignedToType: 'user' | 'agent') => Promise<void>;
  updateTaskStatus: (id: string, status: Task['status'], note?: string) => Promise<void>;

  // Filters
  setStatusFilter: (status: string | null) => void;
  setAssigneeFilter: (assignee: string | null) => void;

  // Realtime
  subscribeToTasks: () => () => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  selectedTaskId: null,
  isLoading: false,
  error: null,
  statusFilter: null,
  assigneeFilter: null,

  fetchTasks: async (projectId) => {
    set({ isLoading: true, error: null });
    try {
      let query = supabase
        .from('tasks')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (projectId) {
        query = query.eq('project_id', projectId);
      }

      const { data, error } = await query;
      if (error) throw error;
      set({ tasks: data || [], isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  createTask: async (task) => {
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        ...task,
        status_history: [{
          status: 'pending',
          changedAt: new Date().toISOString(),
          changedBy: task.createdBy,
          changedByType: task.createdByType || 'user',
        }],
      })
      .select()
      .single();

    if (error) throw error;

    set((state) => ({ tasks: [data, ...state.tasks] }));
    return data;
  },

  updateTask: async (id, updates) => {
    // Optimistic update
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
    }));

    const { error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', id);

    if (error) {
      get().fetchTasks();
      throw error;
    }
  },

  assignTask: async (id, assignedTo, assignedToType) => {
    await get().updateTask(id, { assignedTo, assignedToType });
  },

  updateTaskStatus: async (id, status, note) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;

    const historyEntry: StatusHistoryEntry = {
      status,
      changedAt: new Date().toISOString(),
      changedBy: 'current-user-id', // Get from auth store
      changedByType: 'user',
      note,
    };

    await get().updateTask(id, {
      status,
      statusHistory: [...(task.statusHistory || []), historyEntry],
      ...(status === 'in_progress' && !task.startedAt ? { startedAt: new Date().toISOString() } : {}),
      ...(status === 'completed' ? { completedAt: new Date().toISOString() } : {}),
    });
  },

  setStatusFilter: (status) => set({ statusFilter: status }),
  setAssigneeFilter: (assignee) => set({ assigneeFilter: assignee }),

  subscribeToTasks: () => {
    const subscription = supabase
      .channel('tasks_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            set((state) => ({ tasks: [payload.new as Task, ...state.tasks] }));
          } else if (payload.eventType === 'UPDATE') {
            set((state) => ({
              tasks: state.tasks.map((t) =>
                t.id === payload.new.id ? { ...t, ...payload.new } : t
              ),
            }));
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  },
}));
```

---

## Part 5: Supabase Edge Functions

### 5.1 Agent Executor (`supabase/functions/agent-executor/index.ts`)

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const anthropic = new Anthropic({
  apiKey: Deno.env.get('ANTHROPIC_API_KEY')!,
});

interface ExecuteTaskRequest {
  taskId: string;
  agentId: string;
}

serve(async (req) => {
  try {
    const { taskId, agentId }: ExecuteTaskRequest = await req.json();

    // Fetch task and agent
    const [taskResult, agentResult] = await Promise.all([
      supabase.from('tasks').select('*').eq('id', taskId).single(),
      supabase.from('agent_personas').select('*').eq('id', agentId).single(),
    ]);

    if (taskResult.error || agentResult.error) {
      throw new Error('Failed to fetch task or agent');
    }

    const task = taskResult.data;
    const agent = agentResult.data;

    // Check agent health and limits
    if (!agent.is_active || agent.paused_at) {
      throw new Error(`Agent ${agent.alias} is not available`);
    }

    if (agent.consecutive_failures >= agent.max_consecutive_failures) {
      throw new Error(`Agent ${agent.alias} is circuit-broken`);
    }

    // Update task status to in_progress
    await supabase
      .from('tasks')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: agentId,
        updated_by_type: 'agent',
      })
      .eq('id', taskId);

    // Execute based on agent type
    const startTime = Date.now();
    let result: any;
    let reasoning: string;
    let tokensUsed = 0;

    try {
      const response = await executeAgentTask(agent, task, anthropic);
      result = response.result;
      reasoning = response.reasoning;
      tokensUsed = response.tokensUsed;

      // Update task with success
      await supabase
        .from('tasks')
        .update({
          status: agent.requires_approval.length > 0 ? 'review' : 'completed',
          output: result,
          completed_at: agent.requires_approval.length > 0 ? null : new Date().toISOString(),
          updated_at: new Date().toISOString(),
          updated_by: agentId,
          updated_by_type: 'agent',
        })
        .eq('id', taskId);

      // Reset failure count on success
      await supabase
        .from('agent_personas')
        .update({
          consecutive_failures: 0,
          health_status: 'healthy',
          last_health_check: new Date().toISOString(),
        })
        .eq('id', agentId);

    } catch (execError) {
      // Update task with failure
      await supabase
        .from('tasks')
        .update({
          status: 'failed',
          error: { message: (execError as Error).message },
          updated_at: new Date().toISOString(),
          updated_by: agentId,
          updated_by_type: 'agent',
        })
        .eq('id', taskId);

      // Increment failure count
      const newFailures = agent.consecutive_failures + 1;
      await supabase
        .from('agent_personas')
        .update({
          consecutive_failures: newFailures,
          health_status: newFailures >= agent.max_consecutive_failures ? 'failing' : 'degraded',
          last_health_check: new Date().toISOString(),
        })
        .eq('id', agentId);

      reasoning = `Failed: ${(execError as Error).message}`;
    }

    // Log the action
    const executionTimeMs = Date.now() - startTime;
    await supabase.from('agent_actions').insert({
      account_id: task.account_id,
      agent_id: agentId,
      task_id: taskId,
      action: `Executed task: ${task.title}`,
      action_type: 'task-execution',
      status: result ? 'success' : 'failed',
      result,
      reasoning,
      execution_time_ms: executionTimeMs,
      tokens_used: tokensUsed,
      created_by: agentId,
      created_by_type: 'agent',
      updated_by: agentId,
      updated_by_type: 'agent',
    });

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

async function executeAgentTask(agent: any, task: any, anthropic: Anthropic) {
  // Build prompt based on agent type
  const systemPrompt = buildSystemPrompt(agent);
  const userPrompt = buildTaskPrompt(task);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = response.content[0];
  const text = content.type === 'text' ? content.text : '';

  return {
    result: { content: text },
    reasoning: `Generated response based on task: "${task.title}"`,
    tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
  };
}

function buildSystemPrompt(agent: any): string {
  return `You are ${agent.alias}, a ${agent.agent_type} agent.
${agent.tagline}

Your capabilities: ${agent.capabilities.join(', ')}
Your restrictions: ${agent.restrictions.join(', ')}

Always explain your reasoning. Be concise but thorough.`;
}

function buildTaskPrompt(task: any): string {
  return `Task: ${task.title}
${task.description ? `\nDescription: ${task.description}` : ''}
${task.input ? `\nInput: ${JSON.stringify(task.input)}` : ''}

Please complete this task and provide the result.`;
}
```

### 5.2 Task Queue Processor (`supabase/functions/process-task-queue/index.ts`)

```typescript
// Triggered by pg_cron every minute
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async () => {
  // Fetch queued tasks
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*, agent_personas(*)')
    .eq('status', 'queued')
    .not('assigned_to', 'is', null)
    .eq('assigned_to_type', 'agent')
    .is('deleted_at', null)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(10);

  if (error || !tasks?.length) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Process each task
  const results = await Promise.all(
    tasks.map(async (task) => {
      try {
        // Call agent-executor function
        const response = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/agent-executor`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              taskId: task.id,
              agentId: task.assigned_to,
            }),
          }
        );

        return { taskId: task.id, success: response.ok };
      } catch (err) {
        return { taskId: task.id, success: false, error: (err as Error).message };
      }
    })
  );

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

---

## Part 6: Component Structure

```
src/components/AgentPM/
├── Dashboard/
│   ├── AgentDashboard.tsx       # Main dashboard with agent grid
│   ├── TaskQueue.tsx            # Pending/active tasks list
│   └── PendingReviews.tsx       # Tasks awaiting approval
│
├── Agents/
│   ├── AgentCard.tsx            # Full agent card display
│   ├── AgentCardCompact.tsx     # Compact card for grid
│   ├── AgentStatusBadge.tsx     # Health status indicator
│   ├── AgentCapabilities.tsx    # Capabilities list
│   ├── AgentStats.tsx           # Performance statistics
│   └── AgentConfigModal.tsx     # Agent settings modal
│
├── OrgChart/
│   ├── OrgChart.tsx             # Visual hierarchy
│   ├── OrgNode.tsx              # Individual node
│   └── OrgConnector.tsx         # Connection lines
│
├── Tasks/
│   ├── TaskList.tsx             # Task list view
│   ├── TaskCard.tsx             # Individual task card
│   ├── TaskDetail.tsx           # Full task view
│   ├── TaskStatusHistory.tsx    # Status timeline
│   ├── CreateTaskModal.tsx      # New task form
│   └── AssignAgentModal.tsx     # Agent assignment
│
├── Reviews/
│   ├── ReviewPanel.tsx          # Review interface
│   ├── ReviewActions.tsx        # Approve/Reject buttons
│   └── FeedbackForm.tsx         # Feedback input
│
├── Actions/
│   ├── ActionLog.tsx            # Agent action history
│   ├── ActionItem.tsx           # Single action entry
│   └── ReasoningDisplay.tsx     # Reasoning visualization
│
└── Capture/
    ├── QuickCapture.tsx         # Quick text input
    ├── VoiceCapture.tsx         # Voice recording (Phase 3)
    └── TaskExtractor.tsx        # AI task extraction
```

---

## Part 7: Implementation Phases

### Phase 1: Foundation (MVP)
- [ ] Database schema creation (all tables)
- [ ] RLS policies
- [ ] TypeScript types
- [ ] Zustand stores (agent, task)
- [ ] Basic AgentCard component
- [ ] Basic TaskList component
- [ ] Manual task creation
- [ ] Manual agent assignment

### Phase 2: Agent Infrastructure
- [ ] Edge Function: agent-executor
- [ ] Edge Function: process-task-queue
- [ ] pg_cron setup for queue processing
- [ ] Realtime subscriptions for task status
- [ ] AgentDashboard with grid view
- [ ] Task status workflow UI
- [ ] Action logging
- [ ] Reasoning display

### Phase 3: Reviews & Controls
- [ ] Review workflow
- [ ] Approval/rejection flow
- [ ] Agent pause/resume
- [ ] Circuit breaker UI
- [ ] Health status indicators

### Phase 4: Org Chart & Polish
- [ ] OrgChart component
- [ ] Drag-to-reorganize
- [ ] Agent persona customization
- [ ] Stats and analytics
- [ ] Dark mode support

### Phase 5: Voice & Intelligence
- [ ] Voice capture
- [ ] AI task extraction
- [ ] Smart agent suggestion
- [ ] Multi-agent coordination

---

## Part 8: Database Triggers

```sql
-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_agent_personas_updated_at
  BEFORE UPDATE ON agent_personas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Update project stats when tasks change
CREATE OR REPLACE FUNCTION update_project_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE projects
  SET stats = (
    SELECT jsonb_build_object(
      'totalTasks', COUNT(*),
      'completedTasks', COUNT(*) FILTER (WHERE status = 'completed'),
      'progress', CASE
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND((COUNT(*) FILTER (WHERE status = 'completed')::numeric / COUNT(*)::numeric) * 100)
      END
    )
    FROM tasks
    WHERE project_id = COALESCE(NEW.project_id, OLD.project_id)
      AND deleted_at IS NULL
  )
  WHERE id = COALESCE(NEW.project_id, OLD.project_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_project_stats_on_task_change
  AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_project_stats();

-- Update agent stats when actions complete
CREATE OR REPLACE FUNCTION update_agent_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE agent_personas
  SET stats = (
    SELECT jsonb_build_object(
      'tasksCompleted', COUNT(*) FILTER (WHERE status = 'success'),
      'tasksFailed', COUNT(*) FILTER (WHERE status = 'failed'),
      'successRate', CASE
        WHEN COUNT(*) = 0 THEN 100
        ELSE ROUND((COUNT(*) FILTER (WHERE status = 'success')::numeric / COUNT(*)::numeric) * 100)
      END,
      'avgExecutionTime', COALESCE(AVG(execution_time_ms), 0),
      'lastRunAt', MAX(created_at),
      'totalCost', COALESCE(SUM(cost), 0)
    )
    FROM agent_actions
    WHERE agent_id = NEW.agent_id
      AND deleted_at IS NULL
  )
  WHERE id = NEW.agent_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_agent_stats_on_action
  AFTER INSERT OR UPDATE ON agent_actions
  FOR EACH ROW EXECUTE FUNCTION update_agent_stats();
```

---

## Part 9: Seed Data

```sql
-- Seed default agent personas for new accounts
-- Run via Supabase trigger on account creation or manually

INSERT INTO agent_personas (
  account_id,
  agent_type,
  alias,
  tagline,
  capabilities,
  restrictions,
  triggers,
  autonomy_level,
  requires_approval,
  is_active,
  consecutive_failures,
  max_consecutive_failures,
  health_status,
  show_on_dashboard,
  show_in_org_chart,
  sort_order,
  created_by,
  created_by_type,
  updated_by,
  updated_by_type
) VALUES
(
  :account_id,
  'content-writer',
  'Maverick',
  'Your content autopilot',
  ARRAY['web-research', 'write-content', 'generate-images', 'post-to-cms'],
  ARRAY['edit-production', 'delete-records'],
  ARRAY['manual', 'task-queue'],
  'semi-autonomous',
  ARRAY['publish', 'delete', 'send-email'],
  true,
  0,
  5,
  'healthy',
  true,
  true,
  1,
  :user_id,
  'user',
  :user_id,
  'user'
),
(
  :account_id,
  'image-generator',
  'Pixel',
  'On-brand visuals, instantly',
  ARRAY['generate-images', 'edit-images'],
  ARRAY['delete-records'],
  ARRAY['manual', 'task-queue'],
  'semi-autonomous',
  ARRAY['publish'],
  true,
  0,
  5,
  'healthy',
  true,
  true,
  2,
  :user_id,
  'user',
  :user_id,
  'user'
),
(
  :account_id,
  'researcher',
  'Scout',
  'Intel on demand',
  ARRAY['web-research', 'summarize', 'report'],
  ARRAY['write-content', 'publish'],
  ARRAY['manual', 'task-queue'],
  'autonomous',
  ARRAY[]::TEXT[],
  true,
  0,
  5,
  'healthy',
  true,
  true,
  3,
  :user_id,
  'user',
  :user_id,
  'user'
),
(
  :account_id,
  'qa-tester',
  'Sentinel',
  'Quality guardian',
  ARRAY['test', 'validate', 'report-issues'],
  ARRAY['write-content', 'publish'],
  ARRAY['manual', 'task-queue', 'schedule:daily'],
  'autonomous',
  ARRAY[]::TEXT[],
  true,
  0,
  5,
  'healthy',
  true,
  true,
  4,
  :user_id,
  'user',
  :user_id,
  'user'
),
(
  :account_id,
  'orchestrator',
  'Dispatch',
  'Mission control',
  ARRAY['route-tasks', 'coordinate-agents', 'monitor'],
  ARRAY['write-content', 'publish'],
  ARRAY['task-queue', 'schedule:hourly'],
  'semi-autonomous',
  ARRAY['spawn-agent'],
  true,
  0,
  5,
  'healthy',
  true,
  true,
  5,
  :user_id,
  'user',
  :user_id,
  'user'
);
```

---

*Adapted from AgentPM Spec v2.0 and Funnelists Enterprise Base Data Model v1.0*
*Target: React 18 + Vite 6 + Supabase + Zustand*
