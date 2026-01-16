import type { JSONContent } from '@tiptap/react'

export interface ProjectTemplate {
  id: string
  name: string
  description: string
  icon: string
  content: JSONContent
}

export const projectTemplates: ProjectTemplate[] = [
  {
    id: 'readme',
    name: 'README',
    description: 'Project documentation template',
    icon: 'file-text',
    content: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Project Name' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Brief description of what this project does and who it\'s for.' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Features' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Feature 1' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Feature 2' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Feature 3' }] }] },
        ]},
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Installation' }] },
        { type: 'codeBlock', attrs: { language: 'bash' }, content: [{ type: 'text', text: 'npm install your-package' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Usage' }] },
        { type: 'codeBlock', attrs: { language: 'javascript' }, content: [{ type: 'text', text: 'import { something } from \'your-package\'\n\n// Example usage' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'API Reference' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Document your API here.' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Contributing' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Contributions are welcome! Please read the contributing guidelines first.' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'License' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'MIT' }] },
      ],
    },
  },
  {
    id: 'prd',
    name: 'Product Requirements',
    description: 'PRD template for new features',
    icon: 'clipboard-list',
    content: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Product Requirements Document' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Overview' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Brief summary of the feature/product.' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Problem Statement' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'What problem are we solving? Who has this problem?' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Goals & Success Metrics' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Goal 1 - Metric: ...' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Goal 2 - Metric: ...' }] }] },
        ]},
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'User Stories' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'As a [user type], I want [goal] so that [benefit].' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Requirements' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Must Have' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Requirement 1' }] }] },
        ]},
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Nice to Have' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Requirement 1' }] }] },
        ]},
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Technical Considerations' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Any technical constraints or dependencies.' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Timeline' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Key milestones and dates.' }] },
      ],
    },
  },
  {
    id: 'meeting',
    name: 'Meeting Notes',
    description: 'Comprehensive meeting documentation',
    icon: 'users',
    content: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Meeting: [Title]' }] },
        { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Date: ' }, { type: 'text', text: '__/__/____  |  ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Time: ' }, { type: 'text', text: '__:__ - __:__' }] },
        { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Location: ' }, { type: 'text', text: '[Room / Video Call Link]' }] },
        { type: 'horizontalRule' },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Participants' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Facilitator: ' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Note-taker: ' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Attendees: ' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Absent: ' }] }] }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Meeting Objective' }] },
        { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'What do we need to accomplish by the end of this meeting?' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Context and Pre-read' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Link to relevant docs' }] }] }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Agenda' }] },
        { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Topic 1 (X min) - @owner' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Topic 2 (X min) - @owner' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Wrap-up and Action Items (5 min)' }] }] }] },
        { type: 'horizontalRule' },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Discussion Notes' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Topic 1' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Topic 2' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] }] },
        { type: 'horizontalRule' },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Key Decisions' }] },
        { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Decision: ' }] }] }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Action Items' }] },
        { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Format: [ ] Task - @Owner - Due: Date' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '[ ] Task - @Owner - Due: ' }] }] }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Parking Lot' }] },
        { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Topics to revisit later' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Next Meeting' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Date/Time: ' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Proposed Agenda: ' }] }] }] },
      ],
    },
  },
  {
    id: 'brainstorm',
    name: 'Brainstorm',
    description: 'Ideation and brainstorming',
    icon: 'lightbulb',
    content: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Brainstorm: [Topic]' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Problem / Opportunity' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'What are we trying to solve or explore?' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Raw Ideas' }] },
        { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Dump all ideas here - no judgment!' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
        ]},
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Top Ideas (Refined)' }] },
        { type: 'orderedList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Idea 1: ' }, { type: 'text', text: '' }] }] },
        ]},
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Questions to Explore' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
        ]},
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Next Actions' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
        ]},
      ],
    },
  },
  {
    id: 'api-docs',
    name: 'API Documentation',
    description: 'Document API endpoints',
    icon: 'code',
    content: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'API Documentation' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Base URL: ' }, { type: 'text', marks: [{ type: 'code' }], text: 'https://api.example.com/v1' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Authentication' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'All requests require an API key in the header:' }] },
        { type: 'codeBlock', attrs: { language: 'bash' }, content: [{ type: 'text', text: 'Authorization: Bearer YOUR_API_KEY' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Endpoints' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'GET /resource' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Description of what this endpoint does.' }] },
        { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Parameters:' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: 'id' }, { type: 'text', text: ' (required) - Resource ID' }] }] },
        ]},
        { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Response:' }] },
        { type: 'codeBlock', attrs: { language: 'json' }, content: [{ type: 'text', text: '{\n  "id": "123",\n  "name": "Example"\n}' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'POST /resource' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Create a new resource.' }] },
        { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Request Body:' }] },
        { type: 'codeBlock', attrs: { language: 'json' }, content: [{ type: 'text', text: '{\n  "name": "New Resource"\n}' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Error Codes' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: '400' }, { type: 'text', text: ' - Bad Request' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: '401' }, { type: 'text', text: ' - Unauthorized' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: '404' }, { type: 'text', text: ' - Not Found' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'code' }], text: '500' }, { type: 'text', text: ' - Server Error' }] }] },
        ]},
      ],
    },
  },
  {
    id: 'changelog',
    name: 'Changelog',
    description: 'Track version changes',
    icon: 'git-branch',
    content: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Changelog' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'All notable changes to this project will be documented here.' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '[Unreleased]' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Added' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'New feature' }] }] },
        ]},
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Changed' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Updated feature' }] }] },
        ]},
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Fixed' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bug fix' }] }] },
        ]},
        { type: 'horizontalRule' },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '[1.0.0] - YYYY-MM-DD' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Added' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Initial release' }] }] },
        ]},
      ],
    },
  },
]

export function getTemplateById(id: string): ProjectTemplate | undefined {
  return projectTemplates.find((t) => t.id === id)
}
