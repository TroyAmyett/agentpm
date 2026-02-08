// Excalidraw Drawing Reader — extracts human-readable context from Excalidraw scene JSON
// Used by agents to understand drawing content in notes

interface ExcalidrawElementBasic {
  id: string
  type: string
  text?: string
  label?: { text: string }
  originalText?: string
  isDeleted?: boolean
  groupIds?: string[]
  boundElements?: Array<{ id: string; type: string }>
  startBinding?: { elementId: string }
  endBinding?: { elementId: string }
}

interface ExcalidrawScene {
  elements?: ExcalidrawElementBasic[]
}

const SHAPE_NAMES: Record<string, string> = {
  rectangle: 'rectangle',
  ellipse: 'ellipse',
  diamond: 'diamond',
  line: 'line',
  arrow: 'arrow',
  freedraw: 'freehand drawing',
  text: 'text',
  image: 'image',
  frame: 'frame',
}

/**
 * Extracts a human-readable summary from Excalidraw scene JSON.
 * Returns a string suitable for LLM context.
 */
export function extractDrawingContext(sceneDataStr: string | null): string | null {
  if (!sceneDataStr) return null

  let scene: ExcalidrawScene
  try {
    scene = JSON.parse(sceneDataStr)
  } catch {
    return null
  }

  const elements = scene.elements?.filter((e) => !e.isDeleted) || []
  if (elements.length === 0) return null

  // Collect text content
  const textElements: string[] = []
  elements.forEach((el) => {
    if (el.type === 'text' && (el.text || el.originalText)) {
      textElements.push(el.text || el.originalText || '')
    }
    // Also check labels on shapes (bound text)
    if (el.label?.text) {
      textElements.push(el.label.text)
    }
  })

  // Count shape types
  const shapeCounts = new Map<string, number>()
  elements.forEach((el) => {
    if (el.type === 'text') return // Already handled
    const name = SHAPE_NAMES[el.type] || el.type
    shapeCounts.set(name, (shapeCounts.get(name) || 0) + 1)
  })

  // Find arrow connections
  const connections: string[] = []
  const elementTextMap = new Map<string, string>()

  // Build a map of element IDs to their text content (for connection labels)
  elements.forEach((el) => {
    if (el.type === 'text' && el.text) {
      elementTextMap.set(el.id, el.text)
    }
    // Check if element has bound text elements
    if (el.boundElements) {
      el.boundElements.forEach((bound) => {
        if (bound.type === 'text') {
          const textEl = elements.find((e) => e.id === bound.id)
          if (textEl?.text) {
            elementTextMap.set(el.id, textEl.text)
          }
        }
      })
    }
  })

  // Trace arrow connections
  elements.forEach((el) => {
    if (el.type === 'arrow' && el.startBinding && el.endBinding) {
      const fromLabel = elementTextMap.get(el.startBinding.elementId) || 'shape'
      const toLabel = elementTextMap.get(el.endBinding.elementId) || 'shape'
      connections.push(`"${fromLabel}" → "${toLabel}"`)
    }
  })

  // Count groups
  const groupIds = new Set<string>()
  elements.forEach((el) => {
    el.groupIds?.forEach((g) => groupIds.add(g))
  })

  // Build summary
  const parts: string[] = []

  if (textElements.length > 0) {
    const labels = textElements.map((t) => `"${t.trim()}"`).join(', ')
    parts.push(`${textElements.length} text label${textElements.length !== 1 ? 's' : ''}: ${labels}`)
  }

  if (shapeCounts.size > 0) {
    const shapes = Array.from(shapeCounts.entries())
      .map(([name, count]) => `${count} ${name}${count !== 1 ? 's' : ''}`)
      .join(', ')
    parts.push(shapes)
  }

  if (connections.length > 0) {
    parts.push(`${connections.length} connection${connections.length !== 1 ? 's' : ''}: ${connections.join(', ')}`)
  }

  if (groupIds.size > 0) {
    parts.push(`${groupIds.size} group${groupIds.size !== 1 ? 's' : ''}`)
  }

  return `[Drawing: ${parts.join('; ')}]`
}

/**
 * Extracts all text content from an Excalidraw scene (for search/indexing).
 */
export function extractDrawingText(sceneDataStr: string | null): string {
  if (!sceneDataStr) return ''

  let scene: ExcalidrawScene
  try {
    scene = JSON.parse(sceneDataStr)
  } catch {
    return ''
  }

  const elements = scene.elements?.filter((e) => !e.isDeleted) || []
  const texts: string[] = []

  elements.forEach((el) => {
    if (el.type === 'text' && (el.text || el.originalText)) {
      texts.push(el.text || el.originalText || '')
    }
    if (el.label?.text) {
      texts.push(el.label.text)
    }
  })

  return texts.join(' ').trim()
}
