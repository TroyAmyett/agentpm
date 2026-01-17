---
active: true
iteration: 1
max_iterations: 40
completion_promise: "COMPLETE"
started_at: "2026-01-17T02:43:50Z"
---

Implement AgentPM Identity Service Phase 2 - SSO & Tool Registration.

IMPORTANT: Use existing Supabase tables. DO NOT create organizations, organization_memberships, or organization_api_keys tables - these already exist as accounts, user_accounts, and user_api_keys.

PHASE 1: DATABASE - Add only what's missing

Create ONE new table for tool registration:
* tool_registrations:
  - id UUID PRIMARY KEY
  - name TEXT NOT NULL (e.g., 'LeadGen', 'Canvas')
  - description TEXT
  - base_url TEXT NOT NULL (e.g., 'https://leadgen.funnelists.com')
  - callback_url TEXT NOT NULL (OAuth callback)
  - icon_url TEXT
  - required_providers TEXT[] (e.g., ['openai', 'anthropic'])
  - scopes TEXT[] DEFAULT '{}' (e.g., ['read:leads', 'write:leads'])
  - client_id TEXT UNIQUE NOT NULL (generated)
  - client_secret_hash TEXT NOT NULL (hashed, never store plaintext)
  - is_active BOOLEAN DEFAULT true
  - created_at TIMESTAMPTZ DEFAULT NOW()
  - updated_at TIMESTAMPTZ DEFAULT NOW()
  - created_by UUID REFERENCES auth.users(id)

Create oauth_tokens table for SSO sessions:
* oauth_tokens:
  - id UUID PRIMARY KEY
  - user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
  - tool_id UUID REFERENCES tool_registrations(id) ON DELETE CASCADE
  - access_token_hash TEXT NOT NULL
  - refresh_token_hash TEXT
  - scopes TEXT[]
  - expires_at TIMESTAMPTZ NOT NULL
  - created_at TIMESTAMPTZ DEFAULT NOW()
  - last_used_at TIMESTAMPTZ

Create account_invitations table for member invites:
* account_invitations:
  - id UUID PRIMARY KEY
  - account_id UUID REFERENCES accounts(id) ON DELETE CASCADE
  - email TEXT NOT NULL
  - role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer'))
  - invited_by UUID REFERENCES auth.users(id)
  - token TEXT UNIQUE NOT NULL (secure random token)
  - expires_at TIMESTAMPTZ NOT NULL
  - accepted_at TIMESTAMPTZ
  - created_at TIMESTAMPTZ DEFAULT NOW()

Add RLS policies for new tables.

PHASE 2: ACCOUNT MANAGEMENT API

Using existing accounts and user_accounts tables, implement:

* GET /api/accounts - list user's accounts (via user_accounts join)
* POST /api/accounts - create new account
  - Auto-create user_accounts entry with role='owner'
  - Generate slug from name
* GET /api/accounts/:id - get account details
* PATCH /api/accounts/:id - update account (name, settings, billing_email)
  - Check user has admin/owner role
* DELETE /api/accounts/:id - soft delete account
  - Check user is owner

PHASE 3: MEMBER MANAGEMENT API

* GET /api/accounts/:id/members - list members
  - Join user_accounts with auth.users to get email/name
* POST /api/accounts/:id/members/invite - invite member
  - Create account_invitations record
  - Send email with invite link (or log for now)
  - Check inviter has admin/owner role
* POST /api/accounts/:id/members/accept - accept invitation
  - Validate token, create user_accounts entry
* PATCH /api/accounts/:id/members/:userId - update role
  - Check modifier has higher role than target
* DELETE /api/accounts/:id/members/:userId - remove member
  - Cannot remove last owner

PHASE 4: SSO/OAUTH2 ENDPOINTS

Implement OAuth2 Authorization Code flow:

* GET /api/auth/authorize
  - Query params: client_id, redirect_uri, response_type=code, scope, state
  - Validate client_id against tool_registrations
  - If user not logged in, redirect to login with return URL
  - Show consent screen (or auto-approve for trusted tools)
  - Generate authorization code, redirect to callback_url

* POST /api/auth/token
  - Body: grant_type=authorization_code, code, client_id, client_secret, redirect_uri
  - Validate client credentials
  - Exchange code for access_token + refresh_token
  - Store hashed tokens in oauth_tokens
  - Return: { access_token, refresh_token, expires_in, token_type: 'Bearer' }

* POST /api/auth/token (refresh)
  - Body: grant_type=refresh_token, refresh_token, client_id, client_secret
  - Validate and issue new access_token

* GET /api/auth/userinfo
  - Requires Bearer token
  - Returns: { sub, email, name, account_id, role }

PHASE 5: TOOL REGISTRATION ADMIN UI

Create admin pages (only for platform admins):

* /admin/tools - list registered tools
* /admin/tools/new - register new tool
  - Generate client_id (uuid)
  - Generate client_secret (show once, then hash)
* /admin/tools/:id - edit tool settings
* /admin/tools/:id/delete - deactivate tool

PHASE 6: ACCOUNT MANAGEMENT UI

Create user-facing pages:

* /settings/accounts - list user's accounts with role badges
* /settings/accounts/new - create new account form
* /settings/accounts/:id - account settings
  - General: name, slug
  - Members: list, invite, remove
  - API Keys: use existing ApiKeysManager component
  - Billing: plan display (read-only for now)

* /accept-invite?token=xxx - invitation acceptance page

PHASE 7: INTEGRATION

* Update existing auth flow to auto-create account on first signup
* Add account switcher to app header (if user has multiple accounts)
* Store current account_id in user session/context

Success criteria:
* User can create and manage accounts
* User can invite members via email
* Roles properly restrict permissions (owner > admin > member > viewer)
* OAuth2 flow works for tool authentication
* Tools can be registered by admin
* Account switcher works for multi-account users
* No duplicate tables created
* No linter errors
* All endpoints tested

Output <promise>COMPLETE</promise> when done.
