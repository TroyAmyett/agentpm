---
active: true
iteration: 1
max_iterations: 30
completion_promise: "COMPLETE"
started_at: "2026-01-18T19:29:53Z"
---

Unify navigation across Canvas and LeadGen to match AgentPM pattern.

STANDARD LAYOUT (all apps must follow):
┌─────────────────────────────────────────────────────────────────────────┐
│  [Logo] AppName    [Tool Switcher ▼]                    🔔  [User]  ⚙️ │
├────────────┬────────────────────────────────────────────────────────────┤
│            │                                                            │
│  Sidebar   │   Content Area                                            │
│            │                                                            │
└────────────┴────────────────────────────────────────────────────────────┘

HEADER (56px height):
* Left: App logo + name
* Center-left: Tool switcher dropdown (AgentPM, Radar, Canvas, LeadGen)
* Right: Notification bell (placeholder), User avatar/menu, Settings gear
* Background: bg-[#0a0a0f] or bg-white/[0.02]
* Border: border-b border-white/10

SIDEBAR (240px width):
* Background: bg-white/[0.02]
* Border: border-r border-white/10
* Navigation items with icons (Lucide)
* Active item: cyan highlight
* Collapsible on mobile

CANVAS UPDATES:
* Add sidebar with: Generate, History, Templates, Settings
* Move configuration from left panel to sidebar or keep as content
* Header should match standard pattern
* Tool switcher should work

LEADGEN UPDATES:
* Add sidebar with: Dashboard, Leads, Import, Enrichment, Settings
* Header should match standard pattern
* Tool switcher should work

SHARED STYLES:
* All apps use same colors: bg-[#0a0a0f], cyan accent #0ea5e9
* All apps use same glassmorphism: bg-white/[0.02], backdrop-blur, border-white/10
* All apps use Lucide icons
* All apps use Inter font

Success criteria:
* Canvas has sidebar + standard header
* LeadGen has sidebar + standard header
* Tool switcher works in both apps
* Navigation pattern matches AgentPM/Radar
* Consistent glassmorphism styling
* No linter errors

Output <promise>COMPLETE</promise> when done.
