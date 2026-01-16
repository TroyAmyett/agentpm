import type { JSONContent } from '@tiptap/react'

/**
 * Convert Tiptap JSON content to Markdown
 */
export function toMarkdown(content: JSONContent | null): string {
  if (!content || !content.content) return ''

  return content.content.map((node) => nodeToMarkdown(node)).join('\n')
}

function nodeToMarkdown(node: JSONContent, listDepth = 0, orderedIndex?: number): string {
  switch (node.type) {
    case 'heading': {
      const level = node.attrs?.level || 1
      const prefix = '#'.repeat(level)
      const text = getTextContent(node)
      return `${prefix} ${text}\n`
    }

    case 'paragraph': {
      const text = getTextContent(node)
      return text ? `${text}\n` : '\n'
    }

    case 'bulletList': {
      if (!node.content) return ''
      return node.content
        .map((item) => nodeToMarkdown(item, listDepth))
        .join('') + '\n'
    }

    case 'orderedList': {
      if (!node.content) return ''
      return node.content
        .map((item, index) => nodeToMarkdown(item, listDepth, index + 1))
        .join('') + '\n'
    }

    case 'listItem': {
      const indent = '  '.repeat(listDepth)
      const prefix = orderedIndex ? `${orderedIndex}.` : '-'
      const text = node.content
        ?.map((child) => {
          if (child.type === 'paragraph') {
            return getTextContent(child)
          }
          if (child.type === 'bulletList' || child.type === 'orderedList') {
            return '\n' + nodeToMarkdown(child, listDepth + 1)
          }
          return ''
        })
        .join('')
      return `${indent}${prefix} ${text}\n`
    }

    case 'blockquote': {
      if (!node.content) return ''
      const text = node.content
        .map((child) => getTextContent(child))
        .join('\n')
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
      return `${text}\n\n`
    }

    case 'codeBlock': {
      const language = node.attrs?.language || ''
      const code = getTextContent(node)
      return `\`\`\`${language}\n${code}\n\`\`\`\n\n`
    }

    case 'horizontalRule': {
      return '---\n\n'
    }

    case 'hardBreak': {
      return '  \n'
    }

    default:
      return ''
  }
}

function getTextContent(node: JSONContent): string {
  if (node.text) {
    return applyMarks(node.text, node.marks)
  }

  if (!node.content) return ''

  return node.content.map((child) => getTextContent(child)).join('')
}

function applyMarks(text: string, marks?: Array<{ type: string; attrs?: Record<string, unknown> }>): string {
  if (!marks) return text

  let result = text

  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        result = `**${result}**`
        break
      case 'italic':
        result = `*${result}*`
        break
      case 'underline':
        result = `<u>${result}</u>`
        break
      case 'strike':
        result = `~~${result}~~`
        break
      case 'code':
        result = `\`${result}\``
        break
      case 'link':
        result = `[${result}](${mark.attrs?.href || ''})`
        break
    }
  }

  return result
}

/**
 * Download content as a markdown file
 */
export function downloadMarkdown(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.md') ? filename : `${filename}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Copy markdown to clipboard
 */
export async function copyMarkdown(content: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(content)
    return true
  } catch {
    return false
  }
}

/**
 * Generate markdown with frontmatter
 */
export function toMarkdownWithFrontmatter(
  content: JSONContent | null,
  metadata: Record<string, string | string[] | Date>
): string {
  const frontmatter = Object.entries(metadata)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}:\n${value.map((v) => `  - ${v}`).join('\n')}`
      }
      if (value instanceof Date) {
        return `${key}: ${value.toISOString().split('T')[0]}`
      }
      return `${key}: ${value}`
    })
    .join('\n')

  const markdown = toMarkdown(content)

  return `---\n${frontmatter}\n---\n\n${markdown}`
}
