import type { CanvasData, DiagramNode, DiagramEdge } from '../types'

const NODE_TYPES = [
  'process',
  'datastore',
  'humanActor',
  'systemActor',
  'trustZone',
  'systemScope',
] as const

const EDGE_TYPES = ['dataFlow', 'trustBoundary'] as const

export interface CanvasValidationResult {
  ok: boolean
  canvas: CanvasData | null
  errors: string[]
  warnings: string[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parse and structurally validate an AI-generated canvas_data JSON document.
 *
 * canvas_data has no backend JSON Schema, so this is the only gate before the
 * diagram is loaded into the editor. Returns a flat list of human-readable
 * errors (block import) and warnings (allow, but inform the user). Unknown/extra
 * keys are intentionally allowed: the export denylist preserves non-stripped
 * keys, so exported files must re-import without warnings.
 */
export function parseAndValidateCanvas(text: string): CanvasValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, canvas: null, errors: ['File is not valid JSON.'], warnings }
  }

  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      canvas: null,
      errors: ['Top level must be a JSON object with "nodes" and "edges".'],
      warnings,
    }
  }

  const rawNodes = parsed.nodes
  const rawEdges = parsed.edges
  if (!Array.isArray(rawNodes)) errors.push('"nodes" must be an array.')
  if (!Array.isArray(rawEdges)) errors.push('"edges" must be an array.')
  if (errors.length) return { ok: false, canvas: null, errors, warnings }

  const nodeIds = new Set<string>()
  ;(rawNodes as unknown[]).forEach((n, i) => {
    if (!isPlainObject(n)) {
      errors.push(`Node ${i}: must be an object.`)
      return
    }
    const id = n.id
    if (typeof id !== 'string' || id.length === 0) {
      errors.push(`Node ${i}: missing string "id".`)
    } else if (nodeIds.has(id)) {
      errors.push(`Node "${id}": duplicate id.`)
    } else {
      nodeIds.add(id)
    }
    if (typeof n.type !== 'string' || !(NODE_TYPES as readonly string[]).includes(n.type)) {
      errors.push(`Node "${String(id)}": type must be one of ${NODE_TYPES.join(', ')}.`)
    }
    const pos = n.position
    if (
      !isPlainObject(pos) ||
      typeof pos.x !== 'number' ||
      !Number.isFinite(pos.x) ||
      typeof pos.y !== 'number' ||
      !Number.isFinite(pos.y)
    ) {
      errors.push(`Node "${String(id)}": position must be { x: number, y: number }.`)
    }
    const data = n.data
    if (!isPlainObject(data) || typeof data.label !== 'string' || data.label.length === 0) {
      errors.push(`Node "${String(id)}": data.label (non-empty string) is required.`)
    }
  })

  // Second pass: parentId references (all ids are known now). precogly uses
  // position-based containment and does not set React Flow's `extent` on
  // contained nodes, so we only check that parentId resolves to a real node.
  ;(rawNodes as unknown[]).forEach((n) => {
    if (!isPlainObject(n)) return
    if ('parentId' in n && n.parentId != null) {
      if (typeof n.parentId !== 'string' || !nodeIds.has(n.parentId)) {
        errors.push(
          `Node "${String(n.id)}": parentId "${String(n.parentId)}" does not match any node id.`
        )
      }
    }
  })

  const edgeIds = new Set<string>()
  ;(rawEdges as unknown[]).forEach((e, i) => {
    if (!isPlainObject(e)) {
      errors.push(`Edge ${i}: must be an object.`)
      return
    }
    const id = e.id
    if (typeof id !== 'string' || id.length === 0) {
      errors.push(`Edge ${i}: missing string "id".`)
    } else if (edgeIds.has(id)) {
      errors.push(`Edge "${id}": duplicate id.`)
    } else {
      edgeIds.add(id)
    }
    if (typeof e.type !== 'string' || !(EDGE_TYPES as readonly string[]).includes(e.type)) {
      errors.push(`Edge "${String(id)}": type must be one of ${EDGE_TYPES.join(', ')}.`)
    }
    if (typeof e.source !== 'string' || !nodeIds.has(e.source)) {
      errors.push(`Edge "${String(id)}": source "${String(e.source)}" does not match any node id.`)
    }
    if (typeof e.target !== 'string' || !nodeIds.has(e.target)) {
      errors.push(`Edge "${String(id)}": target "${String(e.target)}" does not match any node id.`)
    }
  })

  if (errors.length) return { ok: false, canvas: null, errors, warnings }

  return {
    ok: true,
    canvas: { nodes: rawNodes as DiagramNode[], edges: rawEdges as DiagramEdge[] },
    errors,
    warnings,
  }
}
