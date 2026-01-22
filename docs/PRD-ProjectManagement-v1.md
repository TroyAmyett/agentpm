# PRD: Project Management & Automation System

**Version:** 1.0
**Status:** Draft
**Created:** 2025-01-22
**Author:** Troy + Claude

---

## Executive Summary

Transform AgentPM from a notes app with AI chat into a full project management system with AI agent automation. The system enables users to capture ideas as notes, organize them into projects, decompose them into tasks, and have AI agents execute work autonomously.

---

## Core Concepts

### Project Space
A container that brings together all artifacts for a body of work:
- **Sources** - Linked folders/notes (PRDs, meeting notes, research)
- **Knowledge** - Extracted facts, decisions, context (AI-consumable)
- **Backlog** - Tasks extracted from notes or manually created
- **Milestones** - Task groupings with deadlines
- **Settings** - Git repo, default agents, test commands, team

### Workflow
```
Note → Project Space → Tasks → Agent Queue → Execution → Delivery
         ↓
      Knowledge
      (context for AI)
```

---

## Data Model Additions

### 1. Task Dependencies

```typescript
type DependencyType = 'FS' | 'SS' | 'FF' | 'SF'
// FS = Finish-to-Start (most common)
// SS = Start-to-Start
// FF = Finish-to-Finish
// SF = Start-to-Finish

interface TaskDependency {
  id: string
  accountId: string
  taskId: string           // The dependent task
  dependsOnTaskId: string  // The prerequisite task
  type: DependencyType
  lagDays?: number         // Delay between tasks
  createdAt: string
  createdBy: string
  createdByType: 'user' | 'agent'
}
```

### 2. Project Space (extends existing Project)

```typescript
interface ProjectSpace extends Project {
  // Source linking
  linkedFolderIds: string[]
  linkedNoteIds: string[]

  // Git integration
  repositoryUrl?: string
  repositoryPath?: string
  baseBranch: string
  testCommand?: string
  buildCommand?: string

  // Defaults
  defaultAgentId?: string
  defaultPriority: TaskPriority

  // Team
  teamMembers: ProjectContact[]
}
```

### 3. Knowledge Entry

```typescript
type KnowledgeType =
  | 'fact'        // "API uses REST, not GraphQL"
  | 'decision'    // "We chose Tailwind over CSS modules"
  | 'constraint'  // "Must support IE11"
  | 'reference'   // "Brand guidelines at /docs/brand.md"
  | 'glossary'    // "PRD = Product Requirements Document"

interface KnowledgeEntry {
  id: string
  accountId: string
  projectId: string

  type: KnowledgeType
  content: string

  // Source tracking
  sourceNoteId?: string
  sourceTaskId?: string
  extractedAt?: string
  extractedBy?: string  // AI model or user

  // Validation
  isVerified: boolean
  verifiedBy?: string
  verifiedAt?: string

  // Relevance
  tags: string[]
  relatedEntityIds: string[]

  // Timestamps
  createdAt: string
  updatedAt: string
}
```

### 4. Workflow / BPM

```typescript
type WorkflowNodeType =
  | 'trigger'     // Event that starts the flow
  | 'action'      // Do something
  | 'condition'   // Branch based on criteria
  | 'approval'    // Wait for human approval
  | 'delay'       // Wait for time period
  | 'parallel'    // Split into parallel paths
  | 'join'        // Merge parallel paths

interface WorkflowNode {
  id: string
  type: WorkflowNodeType
  label: string
  config: Record<string, unknown>
  position: { x: number; y: number }
}

interface WorkflowEdge {
  id: string
  sourceNodeId: string
  targetNodeId: string
  condition?: string  // For condition branches
  label?: string
}

interface Workflow {
  id: string
  accountId: string
  projectId?: string  // null = account-wide template

  name: string
  description?: string

  nodes: WorkflowNode[]
  edges: WorkflowEdge[]

  isActive: boolean
  isTemplate: boolean

  // Triggers
  triggerType: 'manual' | 'event' | 'schedule'
  triggerConfig?: Record<string, unknown>

  // Stats
  runCount: number
  lastRunAt?: string
  avgDurationMs?: number

  createdAt: string
  updatedAt: string
}

interface WorkflowRun {
  id: string
  workflowId: string

  status: 'running' | 'completed' | 'failed' | 'cancelled'
  currentNodeId?: string

  // Context
  inputData: Record<string, unknown>
  outputData?: Record<string, unknown>

  // Execution log
  nodeResults: {
    nodeId: string
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
    startedAt?: string
    completedAt?: string
    output?: unknown
    error?: string
  }[]

  startedAt: string
  completedAt?: string

  triggeredBy: string
  triggeredByType: 'user' | 'agent' | 'system'
}
```

### 5. Time Estimation

```typescript
// Add to Task interface
interface Task {
  // ... existing fields ...

  // Estimation
  estimatedHours?: number
  storyPoints?: number

  // Tracking
  actualHours?: number
  timeEntries?: TimeEntry[]

  // Scheduling
  scheduledStartDate?: string
  scheduledEndDate?: string
  calculatedStartDate?: string  // Auto-computed from dependencies
  calculatedEndDate?: string
}

interface TimeEntry {
  id: string
  taskId: string
  userId?: string
  agentId?: string

  hours: number
  description?: string
  date: string

  createdAt: string
}
```

---

## Views

### Phase 1: Foundation

#### 1.1 Kanban View (exists - enhance)
- Swimlanes by assignee, priority, or milestone
- WIP limits per column
- Quick filters (my tasks, blocked, due soon)
- Card previews with progress indicator

#### 1.2 List View
- Sortable columns: title, status, priority, assignee, due date, estimate
- Inline editing
- Bulk actions (assign, move, delete)
- Saved filter presets

#### 1.3 Dashboard View
- Project progress (tasks complete / total)
- Burndown chart
- Agent status cards (health, current task, queue depth)
- Upcoming deadlines
- Recent activity feed

### Phase 2: Planning

#### 2.1 Gantt View
- Timeline with task bars
- Dependency arrows (FS, SS, FF, SF)
- Critical path highlighting
- Drag to reschedule (cascades dependents)
- Milestone markers
- Today line
- Zoom: day / week / month / quarter

#### 2.2 Calendar View
- Month / week / day views
- Tasks by due date
- Milestones as events
- Drag to reschedule
- Agent availability overlay

### Phase 3: Automation

#### 3.1 Agent Queue View
- Priority-ordered task list
- Filtered by: ready (unblocked), capability-matched
- Estimated cost / time per task
- One-click assign to agent
- Bulk queue operations

#### 3.2 BPM / Workflow View
- Visual flow builder (drag-drop nodes)
- Node types: trigger, action, condition, approval, delay
- Connect nodes with edges
- Condition editor (if/then branches)
- Test run with sample data
- Execution history

### Phase 4: Intelligence

#### 4.1 Knowledge Graph View
- Notes as nodes
- Extracted knowledge as connected nodes
- Semantic similarity links
- Filter by project / tag / type
- Click to navigate

#### 4.2 Network View (Dependencies)
- Tasks as nodes
- Dependencies as directed edges
- Color by status
- Highlight critical path
- Cluster by milestone

---

## Features

### F1: Project Space Management

**F1.1 Create Project Space**
- Name, description, status
- Link existing folders/notes
- Set git repository
- Configure default agent
- Add team members

**F1.2 Project Dashboard**
- Progress metrics
- Active tasks
- Knowledge entries count
- Recent activity
- Quick actions

**F1.3 Project Settings**
- Repository configuration
- Agent assignments
- Notification preferences
- Archive / delete

### F2: Note → Task Extraction

**F2.1 AI Task Decomposition**
- Select note (PRD, meeting notes, etc.)
- AI analyzes and suggests task breakdown
- User reviews / edits suggestions
- Bulk create tasks
- Link tasks back to source note sections

**F2.2 Meeting Notes → Action Items**
- Identify action items from meeting notes
- Extract assignees (if mentioned)
- Extract deadlines (if mentioned)
- Create tasks with context

**F2.3 Continuous Extraction**
- Watch for note updates
- Suggest new tasks from additions
- Flag completed items

### F3: Knowledge Management

**F3.1 Auto-Extraction**
- AI scans notes for facts, decisions, constraints
- Creates knowledge entries
- Links to source

**F3.2 Manual Entry**
- Add knowledge directly
- Categorize (fact, decision, constraint, etc.)
- Tag for discoverability

**F3.3 Knowledge Context**
- When agent starts task, inject relevant knowledge
- "Here's what you need to know about this project..."

### F4: Dependency Management

**F4.1 Create Dependencies**
- Link tasks with dependency type
- Visual feedback (Gantt, Network view)
- Circular dependency detection

**F4.2 Dependency Enforcement**
- Block task start if dependencies incomplete
- Auto-update status when blockers clear
- Notify when blocked

**F4.3 Schedule Calculation**
- Auto-calculate start/end dates from dependencies
- Recalculate on changes
- Critical path identification

### F5: Agent Automation

**F5.1 Smart Queue**
- Priority scoring (urgency + importance + age)
- Capability matching (agent can do X)
- Workload balancing
- Cost estimation

**F5.2 Auto-Assignment**
- Rules-based: "All 'content' tasks → Maverick"
- Capability-based: match task type to agent skills
- Load-based: assign to least busy capable agent

**F5.3 Execution Monitoring**
- Real-time progress
- Cost tracking
- Error alerting
- Auto-retry with backoff

### F6: Workflow Automation

**F6.1 Built-in Workflows**
- PRD → Tasks → Development → Review → Deploy
- Meeting → Action Items → Tasks
- Bug Report → Triage → Fix → Test → Close

**F6.2 Custom Workflows**
- Visual builder
- Trigger types: event, schedule, manual
- Action library: create task, assign agent, send notification, call API
- Conditions: if status = X, if assignee = Y

**F6.3 Workflow Templates**
- Save workflows as templates
- Share across projects
- Import from marketplace (future)

### F7: Notifications & Alerts

**F7.1 Task Notifications**
- Assigned to you
- Status changed
- Comment added
- Due soon / overdue

**F7.2 Project Notifications**
- Milestone approaching
- Milestone completed
- Blocked tasks threshold

**F7.3 Agent Alerts**
- Task failed
- Approval needed
- Cost threshold exceeded
- Agent unhealthy

---

## User Stories

### Project Setup
- As a user, I can create a project space and link it to a git repository
- As a user, I can link existing folders/notes to a project
- As a user, I can add team members to a project

### Task Management
- As a user, I can create tasks manually or extract them from notes
- As a user, I can set dependencies between tasks
- As a user, I can view tasks in Kanban, List, Gantt, or Calendar view
- As a user, I can assign tasks to agents or team members

### AI Assistance
- As a user, I can ask AI to decompose a PRD into tasks
- As a user, I can ask AI to extract action items from meeting notes
- As a user, I can see AI-extracted knowledge for a project

### Agent Automation
- As a user, I can see the agent queue and what's ready to be worked
- As a user, I can start an agent on a task with one click
- As a user, I can monitor agent progress in real-time
- As a user, I can review and approve agent work

### Workflow
- As a user, I can create automated workflows with a visual builder
- As a user, I can set triggers for workflows (event, schedule, manual)
- As a user, I can view workflow execution history

---

## Technical Considerations

### Database
- Add tables: task_dependencies, knowledge_entries, workflows, workflow_runs
- Add columns to tasks: estimated_hours, scheduled_dates, etc.
- Add columns to projects: repository config, linked folders

### Real-time
- Subscribe to task changes for Kanban/views
- Subscribe to agent status updates
- Subscribe to workflow run progress

### Performance
- Dependency graph calculation should be efficient (topological sort)
- Critical path algorithm for Gantt
- Cache computed dates

### AI Integration
- Task extraction prompt engineering
- Knowledge extraction prompt engineering
- Context injection for agents

---

## Milestones

### M1: Project Spaces (Foundation)
- [ ] Project Space data model
- [ ] Create/edit project space UI
- [ ] Link folders/notes to project
- [ ] Project dashboard view
- [ ] Git repository configuration

### M2: Task Dependencies
- [ ] TaskDependency data model
- [ ] Create/edit dependencies UI
- [ ] Circular dependency detection
- [ ] Blocked status enforcement
- [ ] Network view (dependency graph)

### M3: Enhanced Views
- [ ] Gantt view with dependencies
- [ ] Calendar view
- [ ] Enhanced Kanban (swimlanes, WIP limits)
- [ ] List view with sorting/filtering

### M4: AI Extraction
- [ ] PRD → Tasks extraction
- [ ] Meeting notes → Action items
- [ ] Knowledge auto-extraction
- [ ] Knowledge management UI

### M5: Agent Queue
- [ ] Smart queue prioritization
- [ ] Capability matching
- [ ] Agent queue view
- [ ] One-click execution

### M6: Workflow Automation
- [ ] Workflow data model
- [ ] Visual workflow builder
- [ ] Built-in workflow templates
- [ ] Workflow execution engine

### M7: Dashboard & Metrics
- [ ] Project dashboard
- [ ] Burndown charts
- [ ] Agent performance metrics
- [ ] Activity timeline

---

## Open Questions

1. **Multi-tenant**: Should projects be account-level or user-level?
2. **Permissions**: Who can see/edit project knowledge?
3. **Versioning**: Should we version knowledge entries?
4. **Integrations**: Priority for GitHub Issues, Linear, Jira sync?
5. **Mobile**: What views are essential for mobile?

---

## Appendix: View Mockups

### Gantt View
```
                    Jan 20   Jan 27   Feb 3    Feb 10
Task 1 ████████████─────────────────────────────────
Task 2        ├────▶████████████────────────────────
Task 3                    ├────▶████████────────────
Task 4                              ├────▶██████████
       ─────────────────────|─────────────────────────
                         Today    ◆ Milestone
```

### BPM View
```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ PRD Note │────▶│ Extract  │────▶│  Create  │
│ Created  │     │  Tasks   │     │  Tasks   │
└──────────┘     └──────────┘     └──────────┘
                                       │
                      ┌────────────────┴────────────────┐
                      ▼                                 ▼
               ┌──────────┐                      ┌──────────┐
               │  Design  │                      │   Dev    │
               │  Tasks   │                      │  Tasks   │
               └──────────┘                      └──────────┘
                      │                                 │
                      └────────────────┬────────────────┘
                                       ▼
                                ┌──────────┐
                                │  Review  │
                                │  Gate    │
                                └──────────┘
```

### Agent Queue View
```
┌─────────────────────────────────────────────────────────────┐
│ Agent Queue                                    [Auto-assign]│
├─────────────────────────────────────────────────────────────┤
│ ● Ready (5)  ○ Blocked (2)  ○ In Progress (1)              │
├─────────────────────────────────────────────────────────────┤
│ #  Task                    Priority  Agent Match  Est Cost  │
│ 1  Implement auth flow     Critical  Forge ✓      $0.50    │
│ 2  Write homepage copy     High      Maverick ✓   $0.20    │
│ 3  Generate hero image     High      Pixel ✓      $0.30    │
│ 4  Research competitors    Medium    Scout ✓      $0.10    │
│ 5  Fix button alignment    Low       Forge ✓      $0.05    │
└─────────────────────────────────────────────────────────────┘
```
