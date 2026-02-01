---
active: true
iteration: 1
max_iterations: 30
completion_promise: "COMPLETE"
started_at: "2026-01-18T20:52:54Z"
---

Replace embedded Radar in AgentPM with standalone Radar code.

GOAL:
The Radar module in AgentPM should be IDENTICAL to standalone Radar. Not similar - identical.

DELETE AND REPLACE:
* Delete everything in agentpm/app/radar/
* Delete everything in agentpm/components/radar/
* Delete everything in agentpm/lib/radar/

COPY FROM STANDALONE:
* Copy C:/dev/funnelists/radar/app/* to agentpm/app/radar/
* Copy C:/dev/funnelists/radar/components/* to agentpm/components/radar/
* Copy C:/dev/funnelists/radar/lib/* to agentpm/lib/radar/
* Copy any other Radar-specific code

FIX IMPORTS:
* Update all import paths to work within AgentPM structure
* Radar should use AgentPM's existing:
  - Auth (useAuth hook)
  - Supabase client
  - Layout wrapper (keep AgentPM header)

RADAR SIDEBAR:
* Keep the Radar sidebar inside Radar section
* Items: Dashboard, What's Hot, Sources, Experts, Saved, Settings
* AgentPM main sidebar should have 'Radar' link that goes to /radar

SETTINGS MUST HAVE:
* Topics section - editable, deletable topics
* Topics: Agentforce, AI Tools, Blockchain AI, Claude Code, Partners, Competitors
* NO 'Advisors' topic, NO 'Video' topic
* Email Digests section - full configuration
* Preferences section - toggles

ALL LABELS:
* 'Experts' everywhere (not 'Advisors')

DO NOT:
* Create new/different components
* Simplify or change the UI
* Remove any features

Success criteria:
* /radar in AgentPM looks exactly like standalone Radar
* Settings page has Topics, Email Digests, Preferences
* Topics are editable and deletable
* All features work
* No 'Advisors' anywhere
* No linter errors

Output <promise>COMPLETE</promise> when done.
