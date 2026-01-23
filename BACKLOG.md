# AI Notetaker - Feature Backlog

## High Priority

### Evernote Import
- [ ] Parse .enex files (XML format)
- [ ] Preserve folder/notebook structure
- [ ] Import tags and metadata
- [ ] Handle attachments and images
- [ ] Batch import with progress indicator

### User Authentication
- [ ] Supabase Auth integration
- [ ] Email/password login
- [ ] Google OAuth
- [ ] User profile settings
- [ ] Password reset flow

### Real-time Sync
- [ ] Supabase real-time subscriptions
- [ ] Conflict resolution for concurrent edits
- [ ] Offline mode with sync queue
- [ ] Cross-device sync indicator

### Fix Meeting Notes Template
- [ ] Debug why template changes aren't loading
- [ ] Test template system thoroughly

---

## Medium Priority

### Editor Enhancements
- [ ] Image upload and embedding
- [ ] File attachments
- [ ] Tables support
- [ ] Checkbox/task lists with completion tracking
- [ ] @mentions for linking notes
- [ ] [[wiki-style]] internal links
- [ ] Embed code with syntax highlighting (more languages)

### AI Features
- [ ] Auto-generate meeting summaries
- [ ] Extract action items from notes automatically
- [ ] Smart tag suggestions on save
- [ ] "Related notes" suggestions
- [ ] Daily/weekly digest of notes
- [ ] Voice-to-text transcription

### Search & Organization
- [ ] Full-text search with highlighting
- [ ] Advanced filters (date range, tags, folders)
- [ ] Saved searches
- [ ] Recent notes quick access
- [ ] Favorites/pinned notes
- [ ] Archive functionality

### Templates
- [ ] Custom template creation
- [ ] Template variables (auto-fill date, etc.)
- [ ] Template categories
- [ ] Share templates

---

## Lower Priority

### Collaboration
- [ ] Share notes with others
- [ ] Real-time collaborative editing
- [ ] Comments and annotations
- [ ] Permission levels (view/edit)

### Export & Integration
- [ ] Export all notes as ZIP
- [ ] Notion import
- [ ] Obsidian-compatible markdown export
- [ ] API for external integrations
- [ ] Zapier/Make webhooks

### UI/UX Polish
- [ ] Keyboard shortcuts reference panel
- [ ] Customizable themes
- [ ] Font size/family settings
- [ ] Focus mode (distraction-free writing)
- [ ] Mobile-responsive improvements
- [ ] PWA support for mobile install

### Analytics & Insights
- [ ] Writing stats (word count, notes created)
- [ ] Activity heatmap
- [ ] Tag usage analytics
- [ ] AI-powered insights from your notes

---

## AgentPM Features

### Workflow Rules (Task Automation)
- [ ] Create `workflow_rules` table with account-level configuration
  - trigger_type: 'keyword' | 'manual_flag'
  - trigger_keywords: string[] (e.g., ["CMS", "publish", "blog"])
  - action: 'skip_review' | 'auto_complete' | etc.
  - apply_to_children: boolean
- [ ] Add UI in AgentPM Settings to manage workflow rules
- [ ] Add "Skip Review" checkbox in Create Task modal (manual flag)
- [ ] Hook into task status transitions to apply rules automatically
- [ ] Child tasks inherit parent's workflow flags
- **Use case**: CMS/publishing tasks skip review since review happens in external CMS

### Kanban Improvements
- [ ] Speed up drag-and-drop (currently slow)
- [ ] Subtask visual improvements

### Notes Integration
- [ ] Add image support in notes

---

## Technical Debt

- [ ] Add unit tests
- [ ] Add E2E tests with Playwright
- [ ] Error boundary components
- [ ] Better error handling for API calls
- [ ] Performance optimization for large note collections
- [ ] Virtualized list for 1000+ notes
- [ ] IndexedDB for offline-first architecture

---

## Completed Features

- [x] Notion-like block editor with Tiptap
- [x] Slash commands for block types
- [x] Formatting toolbar
- [x] AI writing assistant (rewrite, expand, summarize)
- [x] Chat with notes (RAG)
- [x] Nested folder structure
- [x] Drag-and-drop organization
- [x] Markdown export
- [x] Export with frontmatter
- [x] Folder export as ZIP
- [x] Project templates (README, PRD, Brainstorm, etc.)
- [x] Dark mode
- [x] Local storage persistence
- [x] Search notes

---

*Last updated: January 23, 2026*
