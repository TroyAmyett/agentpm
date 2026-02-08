// Generates Excalidraw scene JSON from a high-level diagram DSL.
// The LLM produces a simple { nodes, edges } structure;
// this module converts it into full Excalidraw elements.

import { resolveFailoverChain, chatWithFailover } from '@/services/llm'

// ---------------------------------------------------------------------------
// DSL types — what the LLM generates
// ---------------------------------------------------------------------------
interface DiagramNode {
  id: string
  label: string
  x: number
  y: number
  width?: number
  height?: number
  color?: string // hex bg color
  shape?: 'rectangle' | 'ellipse' | 'diamond'
}

interface DiagramEdge {
  from: string
  to: string
  label?: string
}

interface DiagramDSL {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}

// ---------------------------------------------------------------------------
// Excalidraw element builder helpers
// ---------------------------------------------------------------------------
let _seed = 1000

function nextId(): string {
  return `el_${Date.now().toString(36)}_${(++_seed).toString(36)}`
}

function baseElement(overrides: Record<string, unknown>) {
  return {
    id: nextId(),
    fillStyle: 'solid' as const,
    strokeWidth: 2,
    strokeStyle: 'solid' as const,
    roughness: 1,
    opacity: 100,
    angle: 0,
    strokeColor: '#e2e8f0',
    backgroundColor: 'transparent',
    groupIds: [] as string[],
    frameId: null,
    roundness: { type: 3 },
    seed: ++_seed,
    version: 1,
    versionNonce: ++_seed,
    isDeleted: false,
    boundElements: null as any,
    updated: Date.now(),
    link: null,
    locked: false,
    ...overrides,
  }
}

function makeRect(node: DiagramNode) {
  const w = node.width || 180
  const h = node.height || 70
  const boxId = nextId()
  const textId = nextId()

  const box = baseElement({
    id: boxId,
    type: node.shape === 'ellipse' ? 'ellipse' : node.shape === 'diamond' ? 'diamond' : 'rectangle',
    x: node.x,
    y: node.y,
    width: w,
    height: h,
    backgroundColor: node.color || '#364fc7',
    boundElements: [{ id: textId, type: 'text' }],
  })

  const text = baseElement({
    id: textId,
    type: 'text',
    x: node.x + 10,
    y: node.y + h / 2 - 10,
    width: w - 20,
    height: 20,
    text: node.label,
    fontSize: 16,
    fontFamily: 1,
    textAlign: 'center' as const,
    verticalAlign: 'middle' as const,
    strokeColor: '#ffffff',
    backgroundColor: 'transparent',
    containerId: boxId,
    originalText: node.label,
    autoResize: true,
    lineHeight: 1.25,
  })

  return { box, text, boxId }
}

// ---------------------------------------------------------------------------
// Edge direction analysis — determines which side of each node to connect
// ---------------------------------------------------------------------------
type EdgeSide = 'top' | 'bottom' | 'left' | 'right'

function getEdgeSides(fromNode: DiagramNode, toNode: DiagramNode): { fromSide: EdgeSide; toSide: EdgeSide } {
  const fw = fromNode.width || 180
  const fh = fromNode.height || 70
  const tw = toNode.width || 180
  const th = toNode.height || 70

  const fromCx = fromNode.x + fw / 2
  const fromCy = fromNode.y + fh / 2
  const toCx = toNode.x + tw / 2
  const toCy = toNode.y + th / 2

  const absDx = Math.abs(toCx - fromCx)
  const absDy = Math.abs(toCy - fromCy)

  if (absDx >= absDy) {
    return toCx >= fromCx
      ? { fromSide: 'right', toSide: 'left' }
      : { fromSide: 'left', toSide: 'right' }
  } else {
    return toCy >= fromCy
      ? { fromSide: 'bottom', toSide: 'top' }
      : { fromSide: 'top', toSide: 'bottom' }
  }
}

/** Spread focus values when multiple arrows share the same edge of a node */
function spreadFocus(index: number, total: number): number {
  if (total <= 1) return 0
  return -0.6 + (index / (total - 1)) * 1.2
}

function makeArrow(
  edge: DiagramEdge,
  fromId: string,
  toId: string,
  fromNode: DiagramNode,
  toNode: DiagramNode,
  fromFocus: number,
  toFocus: number,
) {
  const fw = fromNode.width || 180
  const fh = fromNode.height || 70
  const tw = toNode.width || 180
  const th = toNode.height || 70

  const fromCx = fromNode.x + fw / 2
  const fromCy = fromNode.y + fh / 2
  const toCx = toNode.x + tw / 2
  const toCy = toNode.y + th / 2

  const absDx = Math.abs(toCx - fromCx)
  const absDy = Math.abs(toCy - fromCy)

  let startX: number, startY: number, endX: number, endY: number

  if (absDx >= absDy) {
    if (toCx >= fromCx) {
      startX = fromNode.x + fw
      startY = fromNode.y + fh / 2 + fromFocus * (fh / 2) * 0.6
      endX = toNode.x
      endY = toNode.y + th / 2 + toFocus * (th / 2) * 0.6
    } else {
      startX = fromNode.x
      startY = fromNode.y + fh / 2 + fromFocus * (fh / 2) * 0.6
      endX = toNode.x + tw
      endY = toNode.y + th / 2 + toFocus * (th / 2) * 0.6
    }
  } else {
    if (toCy >= fromCy) {
      startX = fromNode.x + fw / 2 + fromFocus * (fw / 2) * 0.6
      startY = fromNode.y + fh
      endX = toNode.x + tw / 2 + toFocus * (tw / 2) * 0.6
      endY = toNode.y
    } else {
      startX = fromNode.x + fw / 2 + fromFocus * (fw / 2) * 0.6
      startY = fromNode.y
      endX = toNode.x + tw / 2 + toFocus * (tw / 2) * 0.6
      endY = toNode.y + th
    }
  }

  const dx = endX - startX
  const dy = endY - startY

  const arrowId = nextId()

  const arrow = baseElement({
    id: arrowId,
    type: 'arrow',
    x: startX,
    y: startY,
    width: Math.abs(dx),
    height: Math.abs(dy),
    points: [[0, 0], [dx, dy]],
    startBinding: { elementId: fromId, focus: fromFocus, gap: 4 },
    endBinding: { elementId: toId, focus: toFocus, gap: 4 },
    startArrowhead: null,
    endArrowhead: 'arrow',
    strokeColor: '#94a3b8',
  })

  const elements = [arrow]

  if (edge.label) {
    const labelId = nextId()
    elements.push(baseElement({
      id: labelId,
      type: 'text',
      x: startX + dx / 2 - 30,
      y: startY + dy / 2 - 16,
      width: 60,
      height: 16,
      text: edge.label,
      fontSize: 12,
      fontFamily: 1,
      textAlign: 'center' as const,
      verticalAlign: 'middle' as const,
      strokeColor: '#94a3b8',
      backgroundColor: 'transparent',
      containerId: null,
      originalText: edge.label,
      autoResize: true,
      lineHeight: 1.25,
    }))
  }

  return { elements, arrowId }
}

// ---------------------------------------------------------------------------
// Convert DSL → Excalidraw scene JSON string
// ---------------------------------------------------------------------------
export function dslToExcalidraw(dsl: DiagramDSL): string {
  const elements: Record<string, unknown>[] = []
  const nodeIdMap: Record<string, string> = {} // dsl id → excalidraw box id
  // Track arrow bindings per box so we can update boundElements
  const boxArrows: Record<string, string[]> = {}

  // Create nodes
  for (const node of dsl.nodes) {
    const { box, text, boxId } = makeRect(node)
    nodeIdMap[node.id] = boxId
    boxArrows[boxId] = []
    elements.push(box, text)
  }

  // Pre-analyze: count how many arrows share each edge of each node
  const edgeSidesMap: { fromSide: EdgeSide; toSide: EdgeSide }[] = []
  const fromSideCounts: Record<string, Record<string, number>> = {}
  const toSideCounts: Record<string, Record<string, number>> = {}

  for (const edge of dsl.edges) {
    const fromNode = dsl.nodes.find(n => n.id === edge.from)
    const toNode = dsl.nodes.find(n => n.id === edge.to)
    if (!fromNode || !toNode) {
      edgeSidesMap.push({ fromSide: 'right', toSide: 'left' })
      continue
    }
    const sides = getEdgeSides(fromNode, toNode)
    edgeSidesMap.push(sides)

    fromSideCounts[edge.from] ??= {}
    fromSideCounts[edge.from][sides.fromSide] = (fromSideCounts[edge.from][sides.fromSide] || 0) + 1

    toSideCounts[edge.to] ??= {}
    toSideCounts[edge.to][sides.toSide] = (toSideCounts[edge.to][sides.toSide] || 0) + 1
  }

  // Create edges with spread focus values so arrows don't overlap
  const fromSideIdx: Record<string, Record<string, number>> = {}
  const toSideIdx: Record<string, Record<string, number>> = {}

  for (let i = 0; i < dsl.edges.length; i++) {
    const edge = dsl.edges[i]
    const fromBoxId = nodeIdMap[edge.from]
    const toBoxId = nodeIdMap[edge.to]
    const fromNode = dsl.nodes.find(n => n.id === edge.from)
    const toNode = dsl.nodes.find(n => n.id === edge.to)
    if (!fromBoxId || !toBoxId || !fromNode || !toNode) continue

    const { fromSide, toSide } = edgeSidesMap[i]

    fromSideIdx[edge.from] ??= {}
    fromSideIdx[edge.from][fromSide] ??= 0
    const fromCount = fromSideCounts[edge.from]?.[fromSide] || 1
    const fromFocus = spreadFocus(fromSideIdx[edge.from][fromSide]++, fromCount)

    toSideIdx[edge.to] ??= {}
    toSideIdx[edge.to][toSide] ??= 0
    const toCount = toSideCounts[edge.to]?.[toSide] || 1
    const toFocus = spreadFocus(toSideIdx[edge.to][toSide]++, toCount)

    const { elements: arrowEls, arrowId } = makeArrow(edge, fromBoxId, toBoxId, fromNode, toNode, fromFocus, toFocus)
    elements.push(...arrowEls)

    // Track which arrows bind to each box
    boxArrows[fromBoxId]?.push(arrowId)
    boxArrows[toBoxId]?.push(arrowId)
  }

  // Patch box elements: add arrow IDs to boundElements so moving a box drags its arrows
  for (const el of elements) {
    const arrowIds = boxArrows[el.id as string]
    if (arrowIds && arrowIds.length > 0) {
      const existing = (el.boundElements as any[]) || []
      el.boundElements = [
        ...existing,
        ...arrowIds.map(id => ({ id, type: 'arrow' })),
      ]
    }
  }

  return JSON.stringify({ elements, appState: {}, files: {} })
}

// ---------------------------------------------------------------------------
// System prompt for the LLM to generate the DSL
// ---------------------------------------------------------------------------
const DIAGRAM_SYSTEM_PROMPT = `You are a diagram architect. Given a description, generate a JSON diagram with nodes and edges.

OUTPUT FORMAT — return ONLY valid JSON, no markdown fences, no explanation:
{
  "nodes": [
    { "id": "a", "label": "User", "x": 100, "y": 100, "color": "#e8590c", "shape": "ellipse" },
    { "id": "b", "label": "API Gateway", "x": 400, "y": 100, "color": "#364fc7", "shape": "rectangle" },
    { "id": "c", "label": "Database", "x": 400, "y": 300, "color": "#2b8a3e", "shape": "rectangle" }
  ],
  "edges": [
    { "from": "a", "to": "b", "label": "request" },
    { "from": "b", "to": "c", "label": "query" }
  ]
}

LAYOUT RULES (critical — follow precisely):
- Default node size is 180×70. Use "width" and "height" only if you need a different size.
- HORIZONTAL spacing: nodes in the same row must have x values AT LEAST 280px apart (e.g., x:100, x:380, x:660)
- VERTICAL spacing: nodes in adjacent rows must have y values AT LEAST 160px apart (e.g., y:100, y:260, y:420)
- NEVER overlap nodes — verify that no two nodes share similar x,y coordinates
- Start layout at x:100, y:100
- For left-to-right flows, increase x by 280+ per column
- For top-to-bottom flows, increase y by 160+ per row
- For grid/matrix layouts, use consistent x values per column and y values per row
- Center child nodes under their parent when possible

GENERAL RULES:
- Use descriptive short labels (2-4 words max)
- Arrange logically: inputs on left/top, processing in middle, outputs on right/bottom
- Colors for categories:
  - "#364fc7" (blue) — services, APIs, endpoints
  - "#2b8a3e" (green) — databases, storage, caches
  - "#e8590c" (orange) — users, clients, external
  - "#9c36b5" (purple) — queues, events, messaging
  - "#c92a2a" (red) — auth, security, monitoring
  - "#1098ad" (teal) — CDN, load balancers, infrastructure
- Shapes: "rectangle" (default), "ellipse" (start/end/actors), "diamond" (decisions)
- Keep diagrams focused: 4-12 nodes is ideal
- Edges flow from source to destination
- Edge labels are optional — use them for actions/protocols (e.g., "HTTP", "gRPC", "publishes")`

// ---------------------------------------------------------------------------
// Generate diagram via LLM
// ---------------------------------------------------------------------------
export async function generateDiagram(description: string): Promise<string> {
  const resolved = await resolveFailoverChain('chat-assistant')
  if (resolved.chain.length === 0) {
    throw new Error(resolved.error || 'No LLM API key configured')
  }

  const { response } = await chatWithFailover(
    { chain: resolved.chain },
    [{ role: 'user', content: description }],
    { system: DIAGRAM_SYSTEM_PROMPT, maxTokens: 4096 }
  )

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text || '')
    .join('')
    .trim()

  // Extract JSON from response (handle markdown fences just in case)
  const jsonStr = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim()

  let dsl: DiagramDSL
  try {
    dsl = JSON.parse(jsonStr)
  } catch {
    throw new Error('Failed to parse diagram JSON from AI response')
  }

  if (!dsl.nodes || !Array.isArray(dsl.nodes) || dsl.nodes.length === 0) {
    throw new Error('AI generated an empty diagram')
  }

  return dslToExcalidraw(dsl)
}
