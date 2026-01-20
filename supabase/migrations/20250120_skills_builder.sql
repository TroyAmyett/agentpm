-- Skills Builder Migration
-- Adds columns needed for Skills Builder feature

-- Add namespace column for @fun/ official skills vs user skills
ALTER TABLE skills
ADD COLUMN IF NOT EXISTS namespace VARCHAR(50) DEFAULT NULL;

-- Add forked_from to track which skill was used as a base
ALTER TABLE skills
ADD COLUMN IF NOT EXISTS forked_from UUID REFERENCES skills(id) ON DELETE SET NULL;

-- Add tier for subscription-based access control
-- free: Use @fun/ skills only
-- pro: + Create custom skills (limit 5)
-- business: + Unlimited skills, customize @fun/
-- enterprise: + Private skill library, team sharing
CREATE TYPE skill_tier AS ENUM ('free', 'pro', 'business', 'enterprise');

ALTER TABLE skills
ADD COLUMN IF NOT EXISTS tier skill_tier DEFAULT 'free';

-- Add builder_conversation to store the chat history for editing
ALTER TABLE skills
ADD COLUMN IF NOT EXISTS builder_conversation JSONB DEFAULT NULL;

-- Add index on namespace for filtering official skills
CREATE INDEX IF NOT EXISTS idx_skills_namespace ON skills(namespace) WHERE namespace IS NOT NULL;

-- Add index on forked_from for finding customized skills
CREATE INDEX IF NOT EXISTS idx_skills_forked_from ON skills(forked_from) WHERE forked_from IS NOT NULL;

-- Comment on columns for documentation
COMMENT ON COLUMN skills.namespace IS '@fun for official Funnelists skills, NULL for customer-created skills';
COMMENT ON COLUMN skills.forked_from IS 'UUID reference to the base skill this was customized from';
COMMENT ON COLUMN skills.tier IS 'Subscription tier required to access this skill';
COMMENT ON COLUMN skills.builder_conversation IS 'JSONB array of chat messages used to create/edit this skill';

-- Seed some @fun/ official skills for MVP
-- These are placeholder skills that will be replaced with actual content

INSERT INTO skills (
  id,
  account_id,
  user_id,
  name,
  description,
  version,
  author,
  tags,
  content,
  source_type,
  namespace,
  tier,
  is_enabled,
  is_org_shared
) VALUES
(
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000', -- System account placeholder
  NULL,
  'project-planning',
  'Create comprehensive project plans with tasks, milestones, and dependencies',
  '1.0.0',
  'Funnelists',
  ARRAY['planning', 'project-management', 'productivity'],
  E'---\nname: project-planning\ndescription: Create comprehensive project plans with tasks, milestones, and dependencies\nversion: 1.0.0\nauthor: Funnelists\ntags: [planning, project-management, productivity]\n---\n\n# Project Planning\n\n## When to Use This Skill\n\n- Starting a new project and need to break it down\n- Creating a roadmap with milestones\n- Identifying dependencies between tasks\n- Estimating effort and timelines\n\n## Instructions\n\n1. **Gather Context**: Ask about the project goals, constraints, team size, and deadline\n2. **Break Down**: Decompose into phases, then tasks\n3. **Dependencies**: Identify which tasks depend on others\n4. **Milestones**: Define key checkpoints\n5. **Timeline**: Estimate duration for each task\n6. **Output**: Generate a structured plan in markdown format\n\n## Output Format\n\n```markdown\n# Project: [Name]\n\n## Overview\n[Brief description]\n\n## Phases\n### Phase 1: [Name]\n- [ ] Task 1 (X days)\n- [ ] Task 2 (X days) - depends on Task 1\n\n## Milestones\n1. [Milestone 1] - [Date]\n2. [Milestone 2] - [Date]\n\n## Risks\n- [Risk 1]: [Mitigation]\n```',
  'local',
  '@fun',
  'free',
  true,
  true
),
(
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  NULL,
  'code-review',
  'Perform thorough code reviews with security, performance, and best practice checks',
  '1.0.0',
  'Funnelists',
  ARRAY['code-review', 'development', 'quality'],
  E'---\nname: code-review\ndescription: Perform thorough code reviews with security, performance, and best practice checks\nversion: 1.0.0\nauthor: Funnelists\ntags: [code-review, development, quality]\n---\n\n# Code Review\n\n## When to Use This Skill\n\n- Reviewing pull requests\n- Checking code quality before merge\n- Learning best practices from code examples\n- Security auditing\n\n## Instructions\n\n1. **Read the Code**: Understand the overall structure and purpose\n2. **Check Logic**: Verify correctness of algorithms and business logic\n3. **Security Review**: Look for common vulnerabilities (injection, XSS, etc.)\n4. **Performance**: Identify potential bottlenecks or inefficiencies\n5. **Style**: Check adherence to coding standards\n6. **Tests**: Verify test coverage and quality\n7. **Documentation**: Check for adequate comments and docs\n\n## Review Categories\n\n### 🔴 Critical\n- Security vulnerabilities\n- Data loss risks\n- Breaking changes\n\n### 🟡 Important\n- Performance issues\n- Logic errors\n- Missing error handling\n\n### 🟢 Suggestions\n- Code style improvements\n- Refactoring opportunities\n- Documentation gaps',
  'local',
  '@fun',
  'free',
  true,
  true
),
(
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  NULL,
  'brainstorm',
  'Generate creative ideas using structured brainstorming techniques',
  '1.0.0',
  'Funnelists',
  ARRAY['brainstorming', 'creativity', 'ideation'],
  E'---\nname: brainstorm\ndescription: Generate creative ideas using structured brainstorming techniques\nversion: 1.0.0\nauthor: Funnelists\ntags: [brainstorming, creativity, ideation]\n---\n\n# Brainstorm\n\n## When to Use This Skill\n\n- Starting a new project or feature\n- Stuck on a problem and need fresh ideas\n- Exploring alternatives before deciding\n- Team ideation sessions\n\n## Instructions\n\n1. **Define the Challenge**: Clarify what problem we''re solving\n2. **Divergent Thinking**: Generate many ideas without judgment\n3. **Techniques**:\n   - SCAMPER (Substitute, Combine, Adapt, Modify, Put to other uses, Eliminate, Reverse)\n   - Mind mapping\n   - \"What if\" scenarios\n   - Analogies from other domains\n4. **Convergent Thinking**: Group and prioritize ideas\n5. **Output**: Present top ideas with pros/cons\n\n## Output Format\n\n```markdown\n# Brainstorm: [Topic]\n\n## Challenge Statement\n[What we''re trying to solve]\n\n## Ideas Generated\n\n### Idea 1: [Name]\n**Description**: [What it is]\n**Pros**: [Benefits]\n**Cons**: [Drawbacks]\n**Effort**: Low/Medium/High\n\n### Idea 2: [Name]\n...\n\n## Recommended Approach\n[Top pick with reasoning]\n```',
  'local',
  '@fun',
  'free',
  true,
  true
),
(
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  NULL,
  'documentation',
  'Generate comprehensive documentation for code, APIs, and systems',
  '1.0.0',
  'Funnelists',
  ARRAY['documentation', 'technical-writing', 'api'],
  E'---\nname: documentation\ndescription: Generate comprehensive documentation for code, APIs, and systems\nversion: 1.0.0\nauthor: Funnelists\ntags: [documentation, technical-writing, api]\n---\n\n# Documentation Generator\n\n## When to Use This Skill\n\n- Documenting new features or APIs\n- Creating README files\n- Writing technical specifications\n- Generating API reference docs\n\n## Instructions\n\n1. **Understand the Subject**: Read code/specs to understand what''s being documented\n2. **Identify Audience**: Developers? End users? Both?\n3. **Structure**: Choose appropriate format (README, API docs, guide)\n4. **Content**:\n   - Overview/Introduction\n   - Installation/Setup\n   - Usage examples\n   - API reference (if applicable)\n   - Troubleshooting\n5. **Examples**: Include practical code examples\n6. **Review**: Check for accuracy and completeness\n\n## Templates\n\n### README Template\n```markdown\n# Project Name\n\n## Overview\n[What it does]\n\n## Installation\n```bash\nnpm install package-name\n```\n\n## Quick Start\n[Basic usage example]\n\n## API Reference\n[Functions/methods]\n\n## Contributing\n[How to contribute]\n```',
  'local',
  '@fun',
  'free',
  true,
  true
),
(
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  NULL,
  'meeting-notes',
  'Capture and organize meeting notes with action items and follow-ups',
  '1.0.0',
  'Funnelists',
  ARRAY['meetings', 'notes', 'productivity'],
  E'---\nname: meeting-notes\ndescription: Capture and organize meeting notes with action items and follow-ups\nversion: 1.0.0\nauthor: Funnelists\ntags: [meetings, notes, productivity]\n---\n\n# Meeting Notes\n\n## When to Use This Skill\n\n- Taking notes during meetings\n- Summarizing recorded meetings\n- Creating meeting agendas\n- Tracking action items\n\n## Instructions\n\n1. **Header**: Meeting title, date, attendees\n2. **Agenda**: Topics to cover (if planning) or topics covered (if summarizing)\n3. **Discussion**: Key points from each topic\n4. **Decisions**: What was decided\n5. **Action Items**: Who does what by when\n6. **Follow-ups**: Next meeting date, topics to revisit\n\n## Output Format\n\n```markdown\n# Meeting: [Title]\n**Date**: [Date]\n**Attendees**: [Names]\n\n## Agenda\n1. [Topic 1]\n2. [Topic 2]\n\n## Discussion Notes\n\n### [Topic 1]\n- Point discussed\n- Another point\n\n## Decisions Made\n- [ ] Decision 1\n- [ ] Decision 2\n\n## Action Items\n| Task | Owner | Due Date |\n|------|-------|----------|\n| [Task] | [Name] | [Date] |\n\n## Next Steps\n- Next meeting: [Date]\n- Topics to follow up: [List]\n```',
  'local',
  '@fun',
  'free',
  true,
  true
)
ON CONFLICT DO NOTHING;
