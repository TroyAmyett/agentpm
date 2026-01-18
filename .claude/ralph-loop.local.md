---
active: true
iteration: 1
max_iterations: 35
completion_promise: "COMPLETE"
started_at: "2026-01-18T17:31:04Z"
---

Embed Radar into AgentPM as /radar route.

COPY RADAR INTO AGENTPM:
* Copy from C:/dev/funnelists/radar into AgentPM:
  - app/ pages → app/radar/
  - components/ → components/radar/
  - lib/sources/ → lib/radar/sources/
  - lib/ai/ → lib/radar/ai/
* Update all imports to reflect new paths
* Remove duplicate dependencies

ROUTES:
* /radar - Dashboard (card stream)
* /radar/sources - Manage sources
* /radar/experts - Manage experts
* /radar/saved - Saved items
* /radar/settings - Radar preferences

SIDEBAR:
* Add 'Radar' to AgentPM sidebar
* Icon: Radio (from lucide-react)
* Position: after Dashboard, before Projects
* Highlight when on /radar/* routes

AUTH:
* Use AgentPM's existing useAuth hook
* No separate login needed
* User context already available

INLINE ACTIONS:
* 'Create Task' from Radar card → opens task modal (not external link)
* 'Save to Notes' from Radar card → creates note directly

Success criteria:
* Radar accessible at /radar in AgentPM
* Radar appears in sidebar
* Uses AgentPM auth
* Create Task works inline
* Save to Notes works inline
* All Radar features work
* No linter errors

Output <promise>COMPLETE</promise> when done.
