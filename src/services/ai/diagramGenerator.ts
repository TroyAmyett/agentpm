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

function makeArrow(
  edge: DiagramEdge,
  fromId: string,
  toId: string,
  fromNode: DiagramNode,
  toNode: DiagramNode,
) {
  const fw = fromNode.width || 180
  const fh = fromNode.height || 70
  const th = toNode.height || 70

  const startX = fromNode.x + fw
  const startY = fromNode.y + fh / 2
  const endX = toNode.x
  const endY = toNode.y + th / 2

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
    startBinding: { elementId: fromId, focus: 0, gap: 4 },
    endBinding: { elementId: toId, focus: 0, gap: 4 },
    startArrowhead: null,
    endArrowhead: 'arrow',
    strokeColor: '#94a3b8',
  })

  const elements = [arrow]

  // Optional label on the arrow
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

  return elements
}

// ---------------------------------------------------------------------------
// Convert DSL → Excalidraw scene JSON string
// ---------------------------------------------------------------------------
export function dslToExcalidraw(dsl: DiagramDSL): string {
  const elements: Record<string, unknown>[] = []
  const nodeIdMap: Record<string, string> = {} // dsl id → excalidraw box id

  // Create nodes
  for (const node of dsl.nodes) {
    const { box, text, boxId } = makeRect(node)
    nodeIdMap[node.id] = boxId
    elements.push(box, text)
  }

  // Create edges
  for (const edge of dsl.edges) {
    const fromBoxId = nodeIdMap[edge.from]
    const toBoxId = nodeIdMap[edge.to]
    const fromNode = dsl.nodes.find(n => n.id === edge.from)
    const toNode = dsl.nodes.find(n => n.id === edge.to)
    if (!fromBoxId || !toBoxId || !fromNode || !toNode) continue
    elements.push(...makeArrow(edge, fromBoxId, toBoxId, fromNode, toNode))
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
    { "id": "a", "label": "User", "x": 50, "y": 200, "color": "#364fc7", "shape": "rectangle" },
    { "id": "b", "label": "API Gateway", "x": 300, "y": 200, "color": "#2b8a3e", "shape": "rectangle" }
  ],
  "edges": [
    { "from": "a", "to": "b", "label": "request" }
  ]
}

RULES:
- Use descriptive short labels (2-4 words max)
- Space nodes 250px apart horizontally, 120px apart vertically
- Start layout at x:50, y:50
- For left-to-right flows, increase x. For top-to-bottom, increase y.
- Arrange logically: inputs on left, processing in middle, outputs on right
- Use these colors for categories:
  - "#364fc7" (blue) — services, APIs, endpoints
  - "#2b8a3e" (green) — databases, storage, caches
  - "#e8590c" (orange) — users, clients, external
  - "#9c36b5" (purple) — queues, events, messaging
  - "#c92a2a" (red) — auth, security, monitoring
  - "#1098ad" (teal) — CDN, load balancers, infrastructure
- Shapes: "rectangle" (default), "ellipse" (start/end/actors), "diamond" (decisions)
- Keep diagrams focused: 4-12 nodes is ideal
- Edges flow from source to destination
- Edge labels are optional — use them for actions/protocols (e.g., "HTTP", "gRPC", "publishes")
- For architecture diagrams, show key services and data flow
- For flowcharts, show steps with decision diamonds
- For process flows, show sequential steps with optional branches`

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
