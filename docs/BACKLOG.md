# AgentPM Backlog

## Active Work

### Skills Builder (January 2025) - Phase 2

| Priority | Feature | Status | Description |
|----------|---------|--------|-------------|
| 1 | Customize button on SkillCard | ✅ Completed | Quick customize button for @fun/ official skills |
| 2 | Edit with AI button | ✅ Completed | Edit existing skills using builder conversation history |
| 3 | Official Skills section | ✅ Completed | Discovery section showing @fun/ skills on SkillsPage |
| 4 | SkillDetailView actions | ✅ Completed | Customize & Edit with AI buttons in detail view |

**Files modified (Phase 2):**
- `src/components/AgentPM/Skills/SkillCard.tsx` - Added Customize and Edit with AI buttons
- `src/components/AgentPM/Skills/SkillDetailView.tsx` - Added Customize and Edit with AI actions
- `src/components/AgentPM/Skills/SkillsPage.tsx` - Added Official Skills discovery section

---

### Skills Builder (January 2025) - Phase 1 MVP ✅

| Priority | Feature | Status | Description |
|----------|---------|--------|-------------|
| 1 | Builder chat UI | ✅ Completed | Two-panel modal with chat on left, preview on right |
| 2 | @fun/ skills search | ✅ Completed | Search official skills during skill creation |
| 3 | Skill customization flow | ✅ Completed | Fork/customize existing skills as starting point |
| 4 | Skill preview & test | ✅ Completed | Preview generated skill, test with sample input |
| 5 | Save to account | ✅ Completed | Save skill with conversation history for future edits |

**Files created (Phase 1):**
- `supabase/migrations/20250120_skills_builder.sql` - Database schema for namespace, forked_from, tier, builder_conversation
- `src/components/AgentPM/Skills/SkillsBuilderModal.tsx` - Main builder UI component
- Updated `src/types/agentpm.ts` with SkillTier, SkillBuilderMessage types
- Updated `src/services/skills/index.ts` with fetchOfficialSkills, createBuilderSkill functions
- Updated `src/stores/skillStore.ts` with officialSkills state and builder actions

---

### Notetaker Improvements (January 2025)

| Priority | Feature | Status | Description |
|----------|---------|--------|-------------|
| 1 | User-created templates | ✅ Completed | Users can create/save custom templates via Export > Save as Template |
| 2 | AI Assistant popup fix | ✅ Completed | Added 400ms delay + right-click detection to prevent popup interference |
| 3 | Numbered list copy/paste | ✅ Completed | CSS fixes for list items + paste HTML transform to clean up spacing |
| 4 | Checkboxes option | ✅ Completed | Added TaskList extension, toolbar button, slash command `/checklist` |
| - | Mobile layout | 🚫 Dropped | Mobile version unusable - dropped for now |

---

## Completed Work

### Skills Manager (January 2025)
- ✅ Skills table with proper RLS policies (user_accounts pattern)
- ✅ File upload for local .md skills (drag-and-drop)
- ✅ GitHub URL import
- ✅ Raw content import

### Radar Integration (January 2025)
- ✅ Settings page with Topics, Email Digests, Preferences
- ✅ Sidebar navigation unified with AgentPM
- ✅ RLS policies fixed for radar tables

---

## Future Ideas / Parking Lot

_Add ideas here that aren't prioritized yet_

- Skills marketplace / sharing between users
- Notetaker mobile-friendly layout (revisit later)

---

## Notes

- Backlog created: 2025-01-20
- Priority system: Lower number = higher priority
- Status legend:
  - 🔄 In Progress
  - ⏳ Pending
  - ✅ Completed
  - 🚫 Dropped
