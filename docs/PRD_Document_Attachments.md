# PRD: Document Attachments & Rich Media Support

## Overview
Enable Notetaker and AgentPM to handle rich document formats (.docx, .pptx, .xlsx, .pdf) as attachments, with support for company branding/theming in generated documents.

## Problem Statement
- Claude and other AI tools now generate documents in Office formats (.docx), not just markdown
- Users need to attach supporting documents to notes and tasks
- Agent outputs (PRDs, reports, presentations) should follow company brand guidelines
- No current way to store or preview rich media in the platform

## Goals
1. Allow file attachments on Notes (Notetaker) and Tasks (AgentPM)
2. Support preview/download for common document formats
3. Enable agents to generate branded documents using company templates
4. Maintain fast performance with lazy-loading of attachments

## Non-Goals (v1)
- Real-time collaborative editing of documents
- Full in-browser Office document editing
- Automatic document conversion between formats

---

## User Stories

### Notetaker
1. **As a user**, I want to drag-and-drop files onto a note to attach them
2. **As a user**, I want to see thumbnails/icons for attached documents
3. **As a user**, I want to click an attachment to preview or download it
4. **As a user**, I want to delete attachments I no longer need

### AgentPM
1. **As a user**, I want agents to attach their generated documents to task outputs
2. **As a user**, I want to download agent-generated PRDs, reports, and presentations
3. **As a user**, I want generated documents to use my company's branding (logo, colors, fonts)
4. **As an admin**, I want to upload brand templates that agents will use

---

## Technical Design

### Database Schema

```sql
-- Attachments (shared between Notes and Tasks)
CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),

  -- Polymorphic association
  entity_type TEXT NOT NULL CHECK (entity_type IN ('note', 'task', 'execution')),
  entity_id UUID NOT NULL,

  -- File metadata
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,  -- 'docx', 'pdf', 'xlsx', 'pptx', 'image', 'other'
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,  -- Supabase Storage path

  -- Optional metadata
  description TEXT,
  thumbnail_path TEXT,  -- For images/PDFs

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID NOT NULL,
  created_by_type TEXT NOT NULL CHECK (created_by_type IN ('user', 'agent')),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_attachments_entity ON attachments(entity_type, entity_id);
CREATE INDEX idx_attachments_account ON attachments(account_id);

-- Brand Settings (per account)
CREATE TABLE brand_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) UNIQUE,

  -- Brand colors
  primary_color TEXT DEFAULT '#0ea5e9',
  secondary_color TEXT DEFAULT '#6366f1',
  accent_color TEXT DEFAULT '#22c55e',

  -- Brand assets (Supabase Storage paths)
  logo_path TEXT,
  logo_dark_path TEXT,  -- For dark mode
  favicon_path TEXT,

  -- Typography
  heading_font TEXT DEFAULT 'Inter',
  body_font TEXT DEFAULT 'Inter',

  -- Document templates (Supabase Storage paths)
  template_docx_path TEXT,  -- Word template with styles
  template_pptx_path TEXT,  -- PowerPoint master template
  template_xlsx_path TEXT,  -- Excel template with styles

  -- Metadata
  company_name TEXT,
  tagline TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Supabase Storage Buckets

```
attachments/
  ├── {account_id}/
  │   ├── notes/
  │   │   └── {note_id}/
  │   │       └── {filename}
  │   ├── tasks/
  │   │   └── {task_id}/
  │   │       └── {filename}
  │   └── executions/
  │       └── {execution_id}/
  │           └── {filename}

brand-assets/
  ├── {account_id}/
  │   ├── logo.png
  │   ├── logo-dark.png
  │   ├── templates/
  │   │   ├── document.docx
  │   │   ├── presentation.pptx
  │   │   └── spreadsheet.xlsx
```

### Storage Policies (RLS)
```sql
-- Users can only access their account's attachments
CREATE POLICY "Users can view own account attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'attachments' AND
  (storage.foldername(name))[1] = (
    SELECT id::text FROM accounts
    WHERE id IN (SELECT account_id FROM user_accounts WHERE user_id = auth.uid())
  )
);

-- Similar policies for INSERT, UPDATE, DELETE
```

---

## UI Components

### 1. AttachmentDropzone
Drag-and-drop zone for file uploads.

```tsx
interface AttachmentDropzoneProps {
  entityType: 'note' | 'task' | 'execution'
  entityId: string
  onUpload: (attachment: Attachment) => void
  maxSizeMB?: number  // Default: 10MB
  allowedTypes?: string[]  // Default: all supported
}
```

### 2. AttachmentList
Display list of attachments with preview/download actions.

```tsx
interface AttachmentListProps {
  attachments: Attachment[]
  onDelete?: (id: string) => void
  viewMode: 'grid' | 'list'
}
```

### 3. AttachmentPreview
Modal preview for supported formats.

```tsx
interface AttachmentPreviewProps {
  attachment: Attachment
  onClose: () => void
}
```

Supported previews:
- **Images**: Inline display
- **PDF**: Embedded PDF viewer (pdf.js)
- **Office docs**: Show metadata + download button (full preview would require conversion API)

### 4. BrandSettingsPanel
Admin panel for configuring brand assets.

```tsx
interface BrandSettingsPanelProps {
  accountId: string
  onSave: (settings: BrandSettings) => void
}
```

---

## Agent Integration

### Document Generation Flow

1. Agent receives task with `outputFormat: 'docx' | 'pptx' | 'pdf'`
2. Agent generates content (markdown/structured data)
3. System fetches account's brand settings + template
4. Document is generated using template + brand assets
5. Document is uploaded to Supabase Storage
6. Attachment record is created linked to task execution

### Template Variables
Templates support these placeholder variables:

```
{{company_name}}
{{company_logo}}
{{document_title}}
{{created_date}}
{{author_name}}
{{content}}
```

### Agent Skill Extension

```typescript
interface DocumentOutputSkill extends Skill {
  outputFormats: ('md' | 'docx' | 'pptx' | 'pdf')[]
  templateOverride?: string  // Custom template path
  brandingEnabled: boolean
}
```

---

## Implementation Phases

### Phase 1: Basic Attachments (Notetaker)
- [ ] Create `attachments` table and RLS policies
- [ ] Create Supabase Storage bucket with policies
- [ ] Build `AttachmentDropzone` component
- [ ] Build `AttachmentList` component
- [ ] Add attachments to Note editor UI
- [ ] Implement upload/download/delete actions

### Phase 2: Task Attachments (AgentPM)
- [ ] Add attachments to TaskDetail view
- [ ] Add attachments to task execution outputs
- [ ] Show attachment count in task list/cards
- [ ] Link execution outputs as attachments

### Phase 3: Brand Settings
- [ ] Create `brand_settings` table
- [ ] Build `BrandSettingsPanel` in Account settings
- [ ] Upload/manage logo and templates
- [ ] Preview brand settings

### Phase 4: Branded Document Generation
- [ ] Integrate docx templating library (docxtemplater or similar)
- [ ] Implement template variable substitution
- [ ] Add brand assets injection (logo, colors)
- [ ] Agent skill for document output format selection

---

## File Size & Type Limits

| Type | Max Size | Extensions |
|------|----------|------------|
| Documents | 25 MB | .docx, .pdf, .xlsx, .pptx |
| Images | 10 MB | .png, .jpg, .jpeg, .gif, .webp |
| Other | 10 MB | .txt, .csv, .json, .md |

Total storage per account: 1 GB (free tier), 10 GB (paid)

---

## Security Considerations

1. **File Validation**: Validate MIME type matches extension
2. **Virus Scanning**: Consider integration with ClamAV or similar
3. **Access Control**: RLS ensures users only access their account's files
4. **Signed URLs**: Use time-limited signed URLs for downloads
5. **Content Security**: Sanitize file names, prevent path traversal

---

## Success Metrics

- Attachment upload success rate > 99%
- Average upload time < 3s for files under 5MB
- User adoption: 30% of notes have attachments within 30 days
- Agent document generation: 50% of PRD tasks use .docx output

---

## Dependencies

- Supabase Storage (already available)
- PDF.js for PDF preview
- docxtemplater or mammoth.js for Word doc generation
- Optional: LibreOffice/unoconv for Office preview conversion

---

## Open Questions

1. Should we support real-time collaborative viewing of attachments?
2. Do we need version history for attachments?
3. Should agents be able to read/analyze attached documents as input?
4. Integration with external storage (Google Drive, OneDrive)?

---

## Appendix: Supported MIME Types

```typescript
const SUPPORTED_MIME_TYPES = {
  // Documents
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',

  // Images
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',

  // Text
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'application/json': 'json',
}
```
