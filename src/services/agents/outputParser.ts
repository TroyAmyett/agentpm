// Output Parser - Extracts files from agent output
// Parses XML-like blocks (<write_code>, <create_file>, etc.) and extracts file content

export interface ParsedFile {
  path: string
  content: string
  mimeType: string
  fileType: string
}

export interface ParsedOutput {
  files: ParsedFile[]
  cleanedContent: string  // Output with file blocks removed (for display)
  hasFiles: boolean
}

// Map file extensions to MIME types
const MIME_TYPES: Record<string, string> = {
  // Web
  'html': 'text/html',
  'htm': 'text/html',
  'css': 'text/css',
  'js': 'application/javascript',
  'ts': 'text/typescript',
  'tsx': 'text/typescript',
  'jsx': 'application/javascript',
  'json': 'application/json',

  // Documents
  'md': 'text/markdown',
  'txt': 'text/plain',
  'csv': 'text/csv',

  // Images (SVG is text-based)
  'svg': 'image/svg+xml',

  // Other
  'xml': 'application/xml',
  'yaml': 'text/yaml',
  'yml': 'text/yaml',
}

// Get file type category
function getFileType(extension: string): string {
  const ext = extension.toLowerCase()

  if (['html', 'htm'].includes(ext)) return 'html'
  if (['css'].includes(ext)) return 'css'
  if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) return 'js'
  if (['md', 'txt'].includes(ext)) return 'text'
  if (['json', 'yaml', 'yml'].includes(ext)) return 'data'
  if (['svg'].includes(ext)) return 'image'
  if (['xml'].includes(ext)) return 'xml'

  return 'other'
}

// Get MIME type from file extension
function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return MIME_TYPES[ext] || 'text/plain'
}

// Parse <write_code> blocks
// Format: <write_code><path>filename.ext</path><content>...</content></write_code>
function parseWriteCodeBlocks(content: string): ParsedFile[] {
  const files: ParsedFile[] = []

  // Match <write_code>...</write_code> blocks
  const writeCodeRegex = /<write_code>([\s\S]*?)<\/write_code>/gi
  let match

  while ((match = writeCodeRegex.exec(content)) !== null) {
    const block = match[1]

    // Extract path
    const pathMatch = block.match(/<path>([\s\S]*?)<\/path>/i)
    const path = pathMatch ? pathMatch[1].trim() : null

    // Extract content
    const contentMatch = block.match(/<content>([\s\S]*?)<\/content>/i)
    const fileContent = contentMatch ? contentMatch[1] : null

    if (path && fileContent) {
      const ext = path.split('.').pop()?.toLowerCase() || ''
      files.push({
        path,
        content: fileContent,
        mimeType: getMimeType(path),
        fileType: getFileType(ext),
      })
    }
  }

  return files
}

// Parse code blocks with filename hints
// Format: ```html:filename.html or ```filename.css
function parseCodeBlocks(content: string): ParsedFile[] {
  const files: ParsedFile[] = []

  // Match code blocks with filename hints
  // Patterns: ```language:filename.ext, ```filename.ext, or <!-- filename.ext --> before block
  const codeBlockRegex = /(?:<!--\s*([\w.-]+)\s*-->\s*)?```(\w+)?(?::([\w./-]+))?\n([\s\S]*?)```/gi
  let match

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const [, commentFilename, language, colonFilename, blockContent] = match

    // Determine filename from various sources
    let filename = colonFilename || commentFilename

    // If no explicit filename but has language, skip (just a code example)
    if (!filename) continue

    const ext = filename.split('.').pop()?.toLowerCase() || language || ''

    files.push({
      path: filename,
      content: blockContent.trim(),
      mimeType: getMimeType(filename),
      fileType: getFileType(ext),
    })
  }

  return files
}

// Parse <create_file> blocks (alternative format some agents use)
// Format: <create_file path="filename.ext">content</create_file>
function parseCreateFileBlocks(content: string): ParsedFile[] {
  const files: ParsedFile[] = []

  const createFileRegex = /<create_file\s+path=["']([^"']+)["']>([\s\S]*?)<\/create_file>/gi
  let match

  while ((match = createFileRegex.exec(content)) !== null) {
    const [, path, fileContent] = match
    const ext = path.split('.').pop()?.toLowerCase() || ''

    files.push({
      path,
      content: fileContent,
      mimeType: getMimeType(path),
      fileType: getFileType(ext),
    })
  }

  return files
}

// Clean content by removing file blocks (for cleaner display)
function cleanContent(content: string): string {
  let cleaned = content

  // Remove <write_code> blocks
  cleaned = cleaned.replace(/<write_code>[\s\S]*?<\/write_code>/gi, '')

  // Remove <create_file> blocks
  cleaned = cleaned.replace(/<create_file\s+path=["'][^"']+["']>[\s\S]*?<\/create_file>/gi, '')

  // Remove <read_codebase>, <create_branch> and similar pseudo-tool blocks
  cleaned = cleaned.replace(/<(read_codebase|create_branch|delete_file)[^>]*>[\s\S]*?<\/\1>/gi, '')
  cleaned = cleaned.replace(/<(read_codebase|create_branch|delete_file)[^>]*\/>/gi, '')
  cleaned = cleaned.replace(/<(read_codebase|create_branch|delete_file)[^>]*>[\s\S]*?(?=<|$)/gi, '')

  // Clean up extra whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim()

  return cleaned
}

// Main parser function
export function parseAgentOutput(rawOutput: string): ParsedOutput {
  // Collect files from all parsing methods
  const allFiles: ParsedFile[] = [
    ...parseWriteCodeBlocks(rawOutput),
    ...parseCreateFileBlocks(rawOutput),
    // parseCodeBlocks is less reliable, only use if no explicit file blocks found
  ]

  // If no files found with explicit blocks, try code block hints
  if (allFiles.length === 0) {
    allFiles.push(...parseCodeBlocks(rawOutput))
  }

  // Deduplicate by path (keep last occurrence)
  const fileMap = new Map<string, ParsedFile>()
  for (const file of allFiles) {
    fileMap.set(file.path, file)
  }

  const files = Array.from(fileMap.values())

  return {
    files,
    cleanedContent: cleanContent(rawOutput),
    hasFiles: files.length > 0,
  }
}

// Helper to generate a safe filename
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\.\./g, '-')
    .replace(/^\/+/, '')
    .trim() || 'untitled'
}

// Get file extension from path
export function getExtension(path: string): string {
  const parts = path.split('.')
  return parts.length > 1 ? parts.pop()!.toLowerCase() : ''
}
