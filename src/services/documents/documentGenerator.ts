// Document Generator Service
// Generates branded documents from note content

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Header,
  Footer,
  PageNumber,
  AlignmentType,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
} from 'docx'
import type { JSONContent } from '@tiptap/react'
import type { DocumentTypeCode, BrandConfig } from '@/types/brand'
import { DOCUMENT_TYPE_INFO } from '@/types/brand'
import { useBrandStore } from '@/stores/brandStore'
import { uploadAttachment, type Attachment } from '@/services/attachments/attachmentService'

// ============================================================================
// TYPES
// ============================================================================

export interface GenerateDocumentParams {
  accountId: string
  userId: string
  noteId: string
  noteTitle: string
  noteContent: JSONContent
  documentType: DocumentTypeCode
  format: 'docx' | 'md'
}

// ============================================================================
// TIPTAP CONTENT CONVERSION
// ============================================================================

/**
 * Convert Tiptap JSONContent to plain text
 */
function jsonContentToText(content: JSONContent): string {
  if (!content) return ''

  const lines: string[] = []

  function processNode(node: JSONContent, depth = 0): void {
    if (!node) return

    if (node.type === 'text') {
      // Direct text node
      lines.push(node.text || '')
      return
    }

    // Handle different node types
    switch (node.type) {
      case 'doc':
        node.content?.forEach(child => processNode(child, depth))
        break

      case 'paragraph':
        const text = extractText(node)
        if (text) lines.push(text)
        lines.push('') // Empty line after paragraph
        break

      case 'heading': {
        const headingText = extractText(node)
        const level = node.attrs?.level || 1
        const prefix = '#'.repeat(level) + ' '
        if (headingText) lines.push(prefix + headingText)
        lines.push('')
        break
      }

      case 'bulletList':
      case 'orderedList':
        node.content?.forEach((item, index) => {
          const marker = node.type === 'bulletList' ? '- ' : `${index + 1}. `
          const itemText = extractText(item)
          if (itemText) lines.push(marker + itemText)
        })
        lines.push('')
        break

      case 'taskList':
        node.content?.forEach(item => {
          const checked = item.attrs?.checked ? '[x]' : '[ ]'
          const itemText = extractText(item)
          if (itemText) lines.push(`- ${checked} ${itemText}`)
        })
        lines.push('')
        break

      case 'blockquote':
        const quoteText = extractText(node)
        if (quoteText) lines.push('> ' + quoteText)
        lines.push('')
        break

      case 'codeBlock':
        lines.push('```')
        const codeText = extractText(node)
        if (codeText) lines.push(codeText)
        lines.push('```')
        lines.push('')
        break

      case 'horizontalRule':
        lines.push('---')
        lines.push('')
        break

      default:
        // Process children for unknown node types
        node.content?.forEach(child => processNode(child, depth))
    }
  }

  function extractText(node: JSONContent): string {
    if (!node) return ''
    if (node.type === 'text') return node.text || ''
    if (!node.content) return ''
    return node.content.map(child => extractText(child)).join('')
  }

  processNode(content)

  // Clean up extra empty lines
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Convert Tiptap JSONContent to markdown
 */
function jsonContentToMarkdown(content: JSONContent): string {
  // For now, the text conversion produces valid markdown
  return jsonContentToText(content)
}

// ============================================================================
// WORD DOCUMENT GENERATION
// ============================================================================

/**
 * Generate a Word document with branded styling
 */
async function generateWordDocument(
  content: string,
  title: string,
  documentNumber: string,
  brand?: BrandConfig
): Promise<Blob> {
  const primaryColor = (brand?.colors.primary || '#0ea5e9').replace('#', '')
  const secondaryColor = (brand?.colors.secondary || '#64748b').replace('#', '')
  const companyName = brand?.companyName || ''
  const tagline = brand?.tagline || ''
  const headingFont = brand?.fonts.heading || 'Arial'
  const bodyFont = brand?.fonts.body || 'Arial'

  // Parse content into sections
  const sections = parseContentToSections(content)

  // Build document children
  const children: (Paragraph | Table)[] = []

  // Title
  children.push(
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 200 },
    })
  )

  // Document info table
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ text: 'Document Number:' })],
              width: { size: 25, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.SOLID, color: 'F5F5F5' },
            }),
            new TableCell({
              children: [new Paragraph({ text: documentNumber })],
              width: { size: 75, type: WidthType.PERCENTAGE },
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ text: 'Date:' })],
              shading: { type: ShadingType.SOLID, color: 'F5F5F5' },
            }),
            new TableCell({
              children: [new Paragraph({ text: new Date().toLocaleDateString() })],
            }),
          ],
        }),
      ],
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
        left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
        right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
        insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      },
    })
  )

  // Spacing after table
  children.push(new Paragraph({ text: '', spacing: { before: 300, after: 200 } }))

  // Content sections
  for (const section of sections) {
    if (section.type === 'heading') {
      children.push(
        new Paragraph({
          text: section.text,
          heading: section.level === 1 ? HeadingLevel.HEADING_1
                 : section.level === 2 ? HeadingLevel.HEADING_2
                 : HeadingLevel.HEADING_3,
          spacing: { before: 240, after: 120 },
        })
      )
    } else if (section.type === 'list') {
      for (const item of section.items || []) {
        children.push(
          new Paragraph({
            text: item,
            bullet: { level: 0 },
            spacing: { before: 60, after: 60 },
          })
        )
      }
    } else {
      children.push(
        new Paragraph({
          text: section.text,
          spacing: { before: 120, after: 120 },
        })
      )
    }
  }

  const doc = new Document({
    creator: companyName || 'AgentPM',
    title: title,
    description: `${documentNumber} - ${title}`,
    styles: {
      default: {
        document: {
          run: {
            font: bodyFont,
            size: 24,
          },
        },
        heading1: {
          run: {
            font: headingFont,
            size: 36,
            bold: true,
            color: primaryColor,
          },
          paragraph: {
            spacing: { before: 240, after: 120 },
          },
        },
        heading2: {
          run: {
            font: headingFont,
            size: 28,
            bold: true,
            color: primaryColor,
          },
          paragraph: {
            spacing: { before: 200, after: 80 },
          },
        },
        heading3: {
          run: {
            font: headingFont,
            size: 24,
            bold: true,
            color: secondaryColor,
          },
          paragraph: {
            spacing: { before: 160, after: 60 },
          },
        },
        title: {
          run: {
            font: headingFont,
            size: 48,
            bold: true,
            color: primaryColor,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: companyName,
                    bold: true,
                    color: primaryColor,
                    size: 20,
                  }),
                  new TextRun({
                    text: tagline ? `  |  ${tagline}` : '',
                    color: secondaryColor,
                    size: 18,
                    italics: true,
                  }),
                ],
                alignment: AlignmentType.LEFT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: documentNumber,
                    color: secondaryColor,
                    size: 18,
                  }),
                  new TextRun({
                    text: '    |    Page ',
                    color: secondaryColor,
                    size: 18,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 18,
                  }),
                  new TextRun({
                    text: ' of ',
                    color: secondaryColor,
                    size: 18,
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 18,
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children,
      },
    ],
  })

  return await Packer.toBlob(doc)
}

/**
 * Parse text content into structured sections
 */
interface ContentSection {
  type: 'heading' | 'paragraph' | 'list'
  text: string
  level?: number
  items?: string[]
}

function parseContentToSections(content: string): ContentSection[] {
  const sections: ContentSection[] = []
  const lines = content.split('\n')

  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()

    if (!line) {
      i++
      continue
    }

    // Check for heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      sections.push({
        type: 'heading',
        text: headingMatch[2],
        level: headingMatch[1].length,
      })
      i++
      continue
    }

    // Check for list
    const listMatch = line.match(/^[-*]\s+(.+)$/)
    const numberedMatch = line.match(/^\d+\.\s+(.+)$/)
    if (listMatch || numberedMatch) {
      const items: string[] = []
      while (i < lines.length) {
        const listLine = lines[i].trim()
        const itemMatch = listLine.match(/^[-*]\s+(.+)$/) || listLine.match(/^\d+\.\s+(.+)$/)
        if (itemMatch) {
          items.push(itemMatch[1])
          i++
        } else {
          break
        }
      }
      sections.push({
        type: 'list',
        text: '',
        items,
      })
      continue
    }

    // Regular paragraph
    sections.push({
      type: 'paragraph',
      text: line,
    })
    i++
  }

  return sections
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

/**
 * Generate a document from note content
 */
export async function generateDocumentFromNote(
  params: GenerateDocumentParams
): Promise<Attachment | null> {
  const {
    accountId,
    userId,
    noteId,
    noteTitle,
    noteContent,
    documentType,
    format,
  } = params

  try {
    // Get brand config from store
    const brandStore = useBrandStore.getState()
    const brand = brandStore.brandConfig?.brandConfig

    // Get next document number
    const docNumber = await brandStore.getNextDocumentNumber(accountId, documentType)
    const documentNumber = docNumber.formatted

    // Convert content to text/markdown
    const contentText = format === 'md'
      ? jsonContentToMarkdown(noteContent)
      : jsonContentToText(noteContent)

    // Generate file
    let blob: Blob
    let fileName: string
    let mimeType: string

    const typeInfo = DOCUMENT_TYPE_INFO[documentType]
    const safeTitle = noteTitle.replace(/[^a-zA-Z0-9-_\s]/g, '').replace(/\s+/g, '_')

    if (format === 'docx') {
      blob = await generateWordDocument(contentText, noteTitle, documentNumber, brand || undefined)
      fileName = `${documentNumber}_${safeTitle}.docx`
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    } else {
      // Markdown format
      const mdContent = `# ${noteTitle}\n\n**Document Number:** ${documentNumber}\n**Type:** ${typeInfo.fullName}\n**Date:** ${new Date().toLocaleDateString()}\n\n---\n\n${contentText}`
      blob = new Blob([mdContent], { type: 'text/markdown' })
      fileName = `${documentNumber}_${safeTitle}.md`
      mimeType = 'text/markdown'
    }

    // Create a File object from the blob
    const file = new File([blob], fileName, { type: mimeType })

    // Upload as attachment to the note
    const result = await uploadAttachment(
      file,
      accountId,
      'note',
      noteId,
      userId,
      'user'
    )

    if (!result.success || !result.attachment) {
      console.error('[DocumentGenerator] Failed to upload attachment:', result.error)
      return null
    }

    console.log(`[DocumentGenerator] Generated ${documentNumber}: ${fileName}`)
    return result.attachment

  } catch (error) {
    console.error('[DocumentGenerator] Generation failed:', error)
    throw error
  }
}
