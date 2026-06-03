# DFD Canvas Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Export" button to the DFD editor toolbar that downloads the current diagram's `canvas_data` as a clean, import-compatible JSON file.

**Architecture:** Frontend-only mirror of the import feature. A pure `toExportableCanvas` cleans the live editor state (denylist strips React Flow runtime state + this-instance backend IDs); the toolbar exposes an Export button; the editor serializes and triggers a browser download. No backend changes, no new dependencies.

**Tech Stack:** React 19 + TypeScript, `@xyflow/react`, `sonner` (toasts), `lucide-react` (icons), Vite.

**Verification model:** Same as import — precogly has no frontend test runner and `CONTRIBUTING.md` requires manual testing + screenshots. Verify via `tsc -b` + `npm run lint` + in-app **export → re-import round-trip** + screenshots. `toExportableCanvas`/`canvasFilename` are pure (testable later).

**Spec:** `docs/superpowers/specs/2026-06-03-dfd-export-design.md`
**Branch:** `feat/ai-dfd-json-import` (ships with import).

---

## Prerequisites

- [ ] **P1: On the branch with deps installed**

```bash
cd frontend && npm install   # if not already
```
Confirm a clean baseline: `npx tsc -b` and `npm run lint` pass.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/features/dfd-editor/lib/exportCanvas.ts` | Create | Pure `toExportableCanvas(nodes, edges)` cleaning + `canvasFilename(name)` + `downloadTextFile(filename, text)` DOM helper. |
| `frontend/src/features/dfd-editor/components/DiagramToolbar.tsx` | Modify | Add the "Export" button calling a new `onExportDiagram` prop. |
| `frontend/src/features/dfd-editor/DFDEditor.tsx` | Modify | `handleExportDiagram` (clean → serialize → download + toast); pass `onExportDiagram` to the toolbar. |
| `docs/ai-dfd-authoring-guide.md` | Modify | Note that Export produces real, clean examples to feed Claude. |

---

## Task 1: Export util

**Files:**
- Create: `frontend/src/features/dfd-editor/lib/exportCanvas.ts`

- [ ] **Step 1: Create the util**

Create `frontend/src/features/dfd-editor/lib/exportCanvas.ts`:

```ts
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

function omitKeys(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (!keys.includes(k)) out[k] = v
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
```

- [ ] **Step 2: Typecheck + lint**

Run (from `frontend/`):
```bash
npx tsc -b
npm run lint
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/dfd-editor/lib/exportCanvas.ts
git commit -m "feat: add canvas_data export cleaning util"
```

---

## Task 2: Export button + editor handler

**Files:**
- Modify: `frontend/src/features/dfd-editor/components/DiagramToolbar.tsx`
- Modify: `frontend/src/features/dfd-editor/DFDEditor.tsx`

> Coupled by the new `onExportDiagram` prop — build and commit together.

- [ ] **Step 1: Toolbar — add `Download` icon + prop**

In `DiagramToolbar.tsx`, add `Download` to the `lucide-react` import (it currently ends with `…, ShieldCheck, Upload`):
```ts
import { User, Server, Cog, Database, Shield, Box, ArrowRight, LayoutTemplate, ShieldAlert, ShieldCheck, Upload, Download } from 'lucide-react'
```

Add to `DiagramToolbarProps` (after `onImportDiagram`):
```ts
  onExportDiagram: () => void
```

Add `onExportDiagram` to the destructured props (after `onImportDiagram,`).

- [ ] **Step 2: Toolbar — add the Export button**

In the JSX, immediately after the Import hidden `<input … onChange={handleImportFile} />` block and before the `<Separator orientation="vertical" className="h-8 mx-2" />` that precedes `{/* Threat Analysis button */}`, insert:

```tsx
        {/* Export DFD to JSON */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={onExportDiagram}
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[220px]">
            <p className="font-medium">Export DFD (JSON)</p>
            <p className="text-xs text-muted-foreground">
              Download this diagram as a clean canvas_data JSON — re-importable and a ready
              example to feed an AI.
            </p>
          </TooltipContent>
        </Tooltip>
```

- [ ] **Step 3: Editor — import the export util**

In `DFDEditor.tsx`, after `import { useBoundaryMode } from './hooks/useBoundaryMode'`, add:
```ts
import { toExportableCanvas, canvasFilename, downloadTextFile } from './lib/exportCanvas'
```

- [ ] **Step 4: Editor — add `handleExportDiagram`**

Insert immediately after the `handleImportDiagram` `useCallback` block (which ends with `[nodes.length, applyImportedCanvas]\n  )`):

```ts
  // Serialize the current canvas to a clean JSON file and download it.
  const handleExportDiagram = useCallback(() => {
    const clean = toExportableCanvas(nodes, edges)
    if (nodes.length === 0) toast.info('Diagram is empty')
    downloadTextFile(canvasFilename(diagram?.name), JSON.stringify(clean, null, 2))
    toast.success(`Exported ${nodes.length} nodes and ${edges.length} connections.`)
  }, [nodes, edges, diagram])
```

- [ ] **Step 5: Editor — pass the prop to the toolbar**

In the `<DiagramToolbar … />` element, add immediately after the `onImportDiagram={handleImportDiagram}` line:
```tsx
        onExportDiagram={handleExportDiagram}
```

- [ ] **Step 6: Typecheck + lint**

Run (from `frontend/`):
```bash
npx tsc -b
npm run lint
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/dfd-editor/components/DiagramToolbar.tsx frontend/src/features/dfd-editor/DFDEditor.tsx
git commit -m "feat: export DFD canvas to clean JSON from the editor toolbar"
```

---

## Task 3: Mention Export in the authoring guide

**Files:**
- Modify: `docs/ai-dfd-authoring-guide.md`

- [ ] **Step 1: Update the "Worked example" section**

Replace the "Worked example" section body with:
```markdown
## Worked example

See [`superpowers/specs/sample-dfd-canvas.json`](superpowers/specs/sample-dfd-canvas.json)
for a complete, valid example. You can also generate a real one from any diagram: open it in
the DFD editor and click **Export** — the downloaded JSON is clean and re-importable, and makes
an ideal few-shot example to hand to the model.
```

- [ ] **Step 2: Commit**

```bash
git add docs/ai-dfd-authoring-guide.md
git commit -m "docs: note Export as a source of canvas_data examples"
```

---

## Task 4: Manual verification + screenshots (on the Linux VM)

**Files:** none.

- [ ] **Step 1: Build + run**

```bash
docker compose up --build
docker compose exec frontend npx tsc -b
docker compose exec frontend npm run lint
```
Open http://localhost:5173, log in (`admin@precogly.dev` / `admin123`), open a DFD.

- [ ] **Step 2: Round-trip (the key test)**

1. Open a populated DFD, click **Export** → a `<name>-dfd.json` downloads; a success toast shows the counts.
2. Open the file: confirm it is clean — no `selected`/`dragging`/`measured` on nodes, no `componentId`/`trustZoneId`/`dataflowId` in `data`, no `crossesZone*`.
3. Open another (or new) DFD, **Import** that file → it should load with **no warnings** and look the same. Save → threats generate as expected.
4. Check a diagram with a **resized trust zone**: after export → re-import, confirm the zone size looks right (spec risk #10). If size is lost, note it.

- [ ] **Step 3: Empty + edge cases**

- Export an empty DFD → expect the "Diagram is empty" info toast and a file containing `{"nodes":[],"edges":[]}`.
- Confirm the filename matches the (slugified) diagram title.

- [ ] **Step 4: Screenshots** of the toolbar (Import + Export), an exported JSON file, and a successful round-trip, for the PR.

---

## Task 5: Push + PR (human-owned, per CONTRIBUTING)

- [ ] **Step 1: Push**
```bash
git push origin feat/ai-dfd-json-import
```

- [ ] **Step 2: Open the PR** covering **both** import and export.
- Title: `feat: import and export DFD canvas as JSON`
- Body: summary, screenshots (import + export + round-trip), manual test notes, CLA acceptance.

---

## Self-Review

**1. Spec coverage:**
- Toolbar Export button → Task 2 Steps 1-2, 5. ✅
- `toExportableCanvas` (pure, denylist) → Task 1. ✅
- Cleaning rule (node/edge top-level + data deny lists per spec §5) → Task 1 constants. ✅
- Output: pretty JSON, slug filename, empty handling → Task 1 (`canvasFilename`, `JSON.stringify(…, 2)`) + Task 2 Step 4 (empty toast). ✅
- Live-state export → Task 2 Step 4 uses `nodes`/`edges` from `useDiagramState`. ✅
- Verification = manual + round-trip → Task 4. ✅
- Non-goals (no backend, no TM-Library/image export) → not introduced. ✅
- Risk (resized container size) → Task 4 Step 2.4 explicit check. ✅

**2. Placeholder scan:** No TBD/TODO; all code complete; commands have expected output. ✅

**3. Type consistency:** `toExportableCanvas(nodes, edges)`, `canvasFilename(name)`, `downloadTextFile(filename, text)` used identically in Task 2 as defined in Task 1. Imports from `../types` (util) and `./lib/exportCanvas` (editor) resolve. `onExportDiagram: () => void` matches the editor's `handleExportDiagram` (no args). ✅
