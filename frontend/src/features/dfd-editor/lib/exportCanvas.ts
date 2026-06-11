import type { CanvasData, DiagramNode, DiagramEdge } from '../types'

// React Flow runtime / transient keys that must not appear in an exported canvas.
const NODE_TOP_LEVEL_OMIT = ['selected', 'dragging', 'measured', 'positionAbsolute', 'zIndex']
const NODE_DATA_OMIT = [
  'isNewlyInserted',
  'lockAnimationKey',
  'receiveChildAnimationKey',
  'componentId',
  'trustZoneId',
  'orgsystemId',
  'parentComponentId',
  'component_id',
  'component_library_id',
  'component_ref',
]
const EDGE_TOP_LEVEL_OMIT = ['selected']
const EDGE_DATA_OMIT = [
  'isNewlyInserted',
  'dataflowId',
  'trustBoundaryId',
  'crossesZoneId',
  'crossesZoneLabel',
  'crossesZoneTrustLevel',
  'crossesZoneColor',
  'crossesZoneIds',
]

// Keys that must never be copied via assignment: writing `out["__proto__"] = v`
// invokes the prototype setter and reparents the target object. Always dropped.
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype']

function omitKeys(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (DANGEROUS_KEYS.includes(k) || keys.includes(k)) continue
    out[k] = v
  }
  return out
}

/**
 * Produce a clean, import-compatible canvas_data from the live editor state.
 * Strips React Flow runtime state and this-instance backend IDs (denylist),
 * preserving all other structural and semantic fields.
 */
export function toExportableCanvas(nodes: DiagramNode[], edges: DiagramEdge[]): CanvasData {
  const cleanNodes = nodes.map((node) => {
    const top = omitKeys(node as unknown as Record<string, unknown>, NODE_TOP_LEVEL_OMIT)
    if (node.data) top.data = omitKeys(node.data as Record<string, unknown>, NODE_DATA_OMIT)
    return top as unknown as DiagramNode
  })

  const cleanEdges = edges.map((edge) => {
    const top = omitKeys(edge as unknown as Record<string, unknown>, EDGE_TOP_LEVEL_OMIT)
    if (edge.data) top.data = omitKeys(edge.data as Record<string, unknown>, EDGE_DATA_OMIT)
    return top as unknown as DiagramEdge
  })

  return { nodes: cleanNodes, edges: cleanEdges }
}

/** Slugify a diagram name into a safe download filename. */
export function canvasFilename(diagramName?: string): string {
  const slug = (diagramName ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'diagram'}-dfd.json`
}

/** Trigger a browser download of `text` as `filename`. */
export function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
