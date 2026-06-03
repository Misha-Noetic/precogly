# AI DFD JSON Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Import" button to precogly's DFD editor toolbar that loads an AI-generated `canvas_data` JSON into the open diagram; after the user reviews and Saves, precogly's existing primary-DFD sync materializes components/flows and auto-generates threats.

**Architecture:** Frontend-only, no backend changes. A pure validator (`parseAndValidateCanvas`) checks the JSON; the toolbar reads the file and validates; the editor replaces its React Flow state (`setNodes`/`setEdges`) behind a replace-confirmation, then the existing `Save` (`PATCH /api/diagrams/{id}/`) triggers the backend sync that already runs for primary DFDs.

**Tech Stack:** React 19 + TypeScript, `@xyflow/react` (React Flow v12), `sonner` (toasts), shadcn `alert-dialog` (Radix), `lucide-react` (icons), Vite. **No new dependencies.**

**Verification model (read this):** precogly's frontend has **no test runner**, and `CONTRIBUTING.md` requires UI changes to be proven with **manual testing + screenshots** (CI runs backend `pytest` only). Per that convention (and the spec decision), this plan verifies via **`tsc` typecheck + `npm run lint` + manual app testing + screenshots** — not automated frontend tests. `parseAndValidateCanvas` is written as a pure function so tests can be added later if precogly adopts a runner.

**Spec:** `docs/superpowers/specs/2026-06-03-ai-dfd-import-design.md`

---

## Prerequisites

- [ ] **P1: Install frontend deps**

Run (from repo root):
```bash
cd frontend && npm install
```
Expected: completes without errors; `node_modules/` present.

- [ ] **P2: Confirm a clean baseline typecheck + lint**

Run (from `frontend/`):
```bash
npx tsc -b
npm run lint
```
Expected: both complete with no errors. (If the baseline already has lint errors unrelated to this work, note them so we don't attribute them to our changes.)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/features/dfd-editor/lib/importCanvas.ts` | Create | Pure `parseAndValidateCanvas(text)` → `{ ok, canvas, errors, warnings }`. The only validator (no backend schema for `canvas_data`). |
| `docs/superpowers/specs/sample-dfd-canvas.json` | Create | A valid sample `canvas_data` for manual import testing and as a worked example for the authoring guide. |
| `frontend/src/features/dfd-editor/components/DiagramToolbar.tsx` | Modify | Add the "Import" button + hidden file input; read file, validate, call `onImportDiagram`. |
| `frontend/src/features/dfd-editor/DFDEditor.tsx` | Modify | `handleImportDiagram` (replace canvas, `fitView`, toasts, non-primary warning) + replace-confirmation `AlertDialog`; pass `onImportDiagram` to the toolbar. |
| `docs/ai-dfd-authoring-guide.md` | Create | Prompt + contract that tells Claude how to read a repo and emit valid `canvas_data`. |

---

## Task 1: Canvas import validator + sample fixture

**Files:**
- Create: `frontend/src/features/dfd-editor/lib/importCanvas.ts`
- Create: `docs/superpowers/specs/sample-dfd-canvas.json`

- [ ] **Step 1: Create the validator**

Create `frontend/src/features/dfd-editor/lib/importCanvas.ts`:

```ts
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
 * errors (block import) and warnings (allow, but inform the user).
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

  // Second pass: parentId references (all ids are known now).
  ;(rawNodes as unknown[]).forEach((n) => {
    if (!isPlainObject(n)) return
    if ('parentId' in n && n.parentId != null) {
      if (typeof n.parentId !== 'string' || !nodeIds.has(n.parentId)) {
        errors.push(
          `Node "${String(n.id)}": parentId "${String(n.parentId)}" does not match any node id.`
        )
      } else if (!('extent' in n)) {
        warnings.push(
          `Node "${String(n.id)}": has parentId but no extent:"parent"; containment may not render.`
        )
      }
    }
  })

  ;(rawEdges as unknown[]).forEach((e, i) => {
    if (!isPlainObject(e)) {
      errors.push(`Edge ${i}: must be an object.`)
      return
    }
    const id = e.id
    if (typeof id !== 'string' || id.length === 0) errors.push(`Edge ${i}: missing string "id".`)
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
```

- [ ] **Step 2: Create the sample fixture**

Create `docs/superpowers/specs/sample-dfd-canvas.json`:

```json
{
  "nodes": [
    { "id": "tz-internet", "type": "trustZone", "position": { "x": 0, "y": 0 },
      "style": { "width": 300, "height": 400 },
      "data": { "label": "Internet", "trustLevel": 0, "zoneColor": "#ef4444" } },
    { "id": "tz-vpc", "type": "trustZone", "position": { "x": 400, "y": 0 },
      "style": { "width": 360, "height": 400 },
      "data": { "label": "AWS VPC", "trustLevel": 80, "zoneColor": "#22c55e" } },
    { "id": "user", "type": "humanActor", "position": { "x": 40, "y": 90 },
      "parentId": "tz-internet", "extent": "parent",
      "data": { "label": "End User", "actorType": "user" } },
    { "id": "api", "type": "process", "position": { "x": 40, "y": 80 },
      "parentId": "tz-vpc", "extent": "parent",
      "data": { "label": "API Server", "technology": "Django" } },
    { "id": "db", "type": "datastore", "position": { "x": 40, "y": 240 },
      "parentId": "tz-vpc", "extent": "parent",
      "data": { "label": "User DB", "dataStoreType": "PostgreSQL" } }
  ],
  "edges": [
    { "id": "e-login", "type": "dataFlow", "source": "user", "target": "api",
      "data": { "label": "HTTPS login", "protocol": "https", "encrypted": true,
                "authenticated": true, "hasSensitiveData": true } },
    { "id": "e-query", "type": "dataFlow", "source": "api", "target": "db",
      "data": { "label": "read/write user records", "protocol": "tcp", "hasSensitiveData": true } },
    { "id": "tb-internet-vpc", "type": "trustBoundary", "source": "tz-internet", "target": "tz-vpc",
      "data": { "label": "Internet ↔ VPC", "authenticationMethods": ["token"] } }
  ]
}
```

- [ ] **Step 3: Typecheck**

Run (from `frontend/`):
```bash
npx tsc -b
```
Expected: no errors.

- [ ] **Step 4: Lint**

Run (from `frontend/`):
```bash
npm run lint
```
Expected: no errors for `importCanvas.ts`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/dfd-editor/lib/importCanvas.ts docs/superpowers/specs/sample-dfd-canvas.json
git commit -m "feat: add canvas_data import validator and sample fixture"
```

---

## Task 2: Import button + editor wiring + replace confirmation

**Files:**
- Modify: `frontend/src/features/dfd-editor/components/DiagramToolbar.tsx`
- Modify: `frontend/src/features/dfd-editor/DFDEditor.tsx`

> These two files are coupled by the new `onImportDiagram` prop, so they are built and committed together to keep the typecheck green.

- [ ] **Step 1: Toolbar — update imports and props**

In `DiagramToolbar.tsx`:

Change line 1 from `import { memo } from 'react'` to:
```ts
import { memo, useRef } from 'react'
```

Add `Upload` to the `lucide-react` import (line 3):
```ts
import { User, Server, Cog, Database, Shield, Box, ArrowRight, LayoutTemplate, ShieldAlert, ShieldCheck, Upload } from 'lucide-react'
```

Add these imports near the other imports:
```ts
import { toast } from 'sonner'
import { parseAndValidateCanvas } from '../lib/importCanvas'
```

Change the types import (line 13) to also bring in `CanvasData`:
```ts
import type { DiagramNodeType, CanvasData } from '../types'
```

Add to `DiagramToolbarProps` (after `onOpenThreatAnalysis`):
```ts
  onImportDiagram: (canvas: CanvasData) => void
```

Add `onImportDiagram` to the destructured props in the component signature.

- [ ] **Step 2: Toolbar — add file ref and handler**

Inside `DiagramToolbar`, right after `const { addNodes, getNodes } = useReactFlow()`:

```ts
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = '' // allow re-importing the same file name
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = parseAndValidateCanvas(String(reader.result ?? ''))
      if (!result.ok) {
        toast.error('Import failed', { description: result.errors.slice(0, 5).join('\n') })
        return
      }
      if (result.warnings.length > 0) {
        toast.warning('Imported with warnings', { description: result.warnings.slice(0, 5).join('\n') })
      }
      if (result.canvas) onImportDiagram(result.canvas)
    }
    reader.onerror = () => toast.error('Could not read file')
    reader.readAsText(file)
  }
```

- [ ] **Step 3: Toolbar — add the Import button + hidden input**

In the JSX, immediately after the **Templates** `</Tooltip>` (ends at line 223) and before the `<Separator orientation="vertical" className="h-8 mx-2" />` at line 225, insert:

```tsx
        {/* Import DFD from JSON */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Import</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[220px]">
            <p className="font-medium">Import DFD (JSON)</p>
            <p className="text-xs text-muted-foreground">
              Load a canvas_data JSON (e.g. AI-generated) into this diagram. Replaces the
              current canvas; review and Save to generate threats.
            </p>
          </TooltipContent>
        </Tooltip>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleImportFile}
        />
```

- [ ] **Step 4: Editor — imports, `fitView`, confirm state**

In `DFDEditor.tsx`:

Add `CanvasData` to the types import (line 38):
```ts
import type { DiagramNode, DiagramEdge, DataFlowEdge, TrustBoundaryEdge, CanvasData } from './types'
```

Add these imports:
```ts
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
```

Add `fitView` to the `useReactFlow()` destructure (line 52):
```ts
  const { screenToFlowPosition, getEdges, fitView } = useReactFlow()
```

Add confirm state near the other `useState` calls (after line 49, `showDeleteDialog`):
```ts
  const [importConfirm, setImportConfirm] = useState<CanvasData | null>(null)
```

- [ ] **Step 5: Editor — apply + import handlers**

Add after `handleInsertTemplate` (after line 253):

```ts
  // Replace the canvas with an imported one, frame it, and inform the user.
  const applyImportedCanvas = useCallback(
    (canvas: CanvasData) => {
      setNodes(canvas.nodes)
      setEdges(canvas.edges)
      setSelectedNode(null)
      setSelectedEdge(null)
      // Frame the imported diagram after React Flow has the new nodes.
      setTimeout(() => fitView({ padding: 0.2 }), 0)
      toast.success(
        `Imported ${canvas.nodes.length} nodes and ${canvas.edges.length} connections — review and Save to generate threats.`
      )
      if (diagram && diagram.isPrimary === false) {
        toast.warning(
          'This is a Reference DFD; threats are generated only from the primary DFD.'
        )
      }
    },
    [setNodes, setEdges, fitView, diagram]
  )

  // Confirm before replacing a non-empty canvas; otherwise apply directly.
  const handleImportDiagram = useCallback(
    (canvas: CanvasData) => {
      if (nodes.length > 0) {
        setImportConfirm(canvas)
      } else {
        applyImportedCanvas(canvas)
      }
    },
    [nodes.length, applyImportedCanvas]
  )
```

- [ ] **Step 6: Editor — pass prop + add confirm dialog**

Pass the handler to the toolbar — add this prop to `<DiagramToolbar ... />` (the block at lines 447-459):
```tsx
        onImportDiagram={handleImportDiagram}
```

Add the confirmation dialog after the `<DeleteDFDDialog ... />` block (after line 546):
```tsx
      {/* Import replace confirmation */}
      <AlertDialog
        open={importConfirm !== null}
        onOpenChange={(open) => { if (!open) setImportConfirm(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace current diagram?</AlertDialogTitle>
            <AlertDialogDescription>
              Importing replaces this diagram&rsquo;s {nodes.length} node
              {nodes.length === 1 ? '' : 's'} and {edges.length} connection
              {edges.length === 1 ? '' : 's'} with the imported canvas. You can undo with
              Ctrl/Cmd+Z, and nothing is persisted until you Save.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (importConfirm) applyImportedCanvas(importConfirm)
                setImportConfirm(null)
              }}
            >
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
```

- [ ] **Step 7: Typecheck + lint**

Run (from `frontend/`):
```bash
npx tsc -b
npm run lint
```
Expected: no errors. (If `tsc` complains that `DiagramToolbar` is missing `onImportDiagram` anywhere it is used, confirm Step 6 added the prop.)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/dfd-editor/components/DiagramToolbar.tsx frontend/src/features/dfd-editor/DFDEditor.tsx
git commit -m "feat: import AI-generated DFD canvas from JSON in the editor toolbar"
```

---

## Task 3: End-to-end manual verification + screenshots

**Files:** none (verification only). This is precogly's required "proof" for UI changes.

- [ ] **Step 1: Start the stack**

From repo root, start per the dev docs (linked from `CONTRIBUTING.md`):
```bash
docker compose up
```
Open the app (default Vite dev URL `http://localhost:5173`, or the URL the compose output shows), log in, and open (or create) a threat model with a DFD. For the threats path, use the threat model's **primary** DFD.

- [ ] **Step 2: Happy path — import the sample**

1. Open the primary DFD in the editor.
2. Click **Import** in the toolbar, choose `docs/superpowers/specs/sample-dfd-canvas.json`.
3. If the canvas was non-empty, confirm **Replace** in the dialog.

Expected: the two trust zones render with the user/API/DB nodes inside, three connections appear, the view fits to the diagram, and a success toast shows "Imported 5 nodes and 3 connections…". The save status flips to "Unsaved changes".

- [ ] **Step 3: Save → threats generate**

Click **Save** (or wait for autosave). Then open **Analyze Threats** (or the threat model workspace).

Expected: components (API Server, User DB, End User) and data flows exist, and threats have been auto-generated. Capture a screenshot of the analysis.

- [ ] **Step 4: camelCase round-trip check (spec risk #1)**

Reload the editor page (re-fetch `GET /api/diagrams/{id}/`).

Expected: nodes/edges persist exactly — containment (`parentId`/`extent`) holds, edges keep their `source`/`target`, and trust-boundary/data-flow data survives. If any camelCase key was mangled by the API layer, you'll see it here; if so, record the exact key and stop (it would mean the `canvas_data` round-trip needs handling beyond this plan).

- [ ] **Step 5: Edge cases**

1. **Invalid JSON:** import a `.txt` or a truncated file → expect a red "Import failed: File is not valid JSON." toast; canvas unchanged.
2. **Schema violation:** import a JSON whose edge `source` references a missing node id → expect "Import failed" listing that error; canvas unchanged.
3. **Non-primary DFD:** open a non-primary ("Reference") DFD and import the sample → expect the success toast **plus** the "Reference DFD; threats are generated only from the primary DFD" warning.
4. **Re-import same file:** import the same file twice in a row → expect it works both times (the input value resets).

- [ ] **Step 6: Capture screenshots for the PR**

Save screenshots of: the toolbar with the Import button, the imported diagram, the replace-confirmation dialog, the generated threats, and an "Import failed" toast. These go in the PR description (required by `CONTRIBUTING.md`).

---

## Task 4: Claude authoring guide (companion deliverable)

**Files:**
- Create: `docs/ai-dfd-authoring-guide.md`

- [ ] **Step 1: Write the guide**

Create `docs/ai-dfd-authoring-guide.md`:

````markdown
# Authoring a precogly DFD with Claude (canvas_data)

Use this to have Claude analyze a code repository and emit a `canvas_data` JSON you can
load via the DFD editor's **Import** button.

## Output contract

Emit **only** a JSON object: `{ "nodes": [...], "edges": [...] }` (camelCase keys).

**Node:** `id` (unique string), `type` ∈ `process | datastore | humanActor | systemActor
| trustZone | systemScope`, `position` `{ x, y }`, `data` `{ "label": string, ... }`.
For a node inside a zone/scope set `parentId` to the container's id and `extent: "parent"`
(its `position` is then relative to the parent). Zones/scopes may set `style`
`{ "width", "height" }`.

**Edge:** `id`, `type` ∈ `dataFlow | trustBoundary`, `source`, `target` (node ids).
- `dataFlow.data`: `label`, `protocol`, `encrypted`, `authenticated`, `hasSensitiveData`,
  `dataClassification: string[]`.
- `trustBoundary` connects two `trustZone` nodes; `data`: `label`,
  `authenticationMethods: string[]`, `accessControlMethods: string[]`.

## Layout rules (the model must place nodes)

- Lay out on a tidy grid: one column per trust zone, rows by tier (actors → edge →
  services → data stores). Keep zones ~320–400 wide; place child nodes at relative
  offsets inside them so they don't overlap.
- Give every node a distinct `position`. Do not omit positions.

## Prompt template

> Analyze the repository at <path/URL>. Produce a precogly DFD as a single `canvas_data`
> JSON object (`{nodes, edges}`) following the contract in this guide. Identify processes
> (services/APIs), data stores, external human and system actors, the trust zones they sit
> in, and the data flows between them (with protocol/encryption where inferable). Lay nodes
> out on a readable grid. Output only the JSON.

## Worked example

See `docs/superpowers/specs/sample-dfd-canvas.json` for a complete, valid example.
````

- [ ] **Step 2: Commit**

```bash
git add docs/ai-dfd-authoring-guide.md
git commit -m "docs: add Claude authoring guide for DFD canvas_data import"
```

---

## Task 5: Open the pull request

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/ai-dfd-json-import
```

- [ ] **Step 2: Open the PR** (you write the title/body — per CONTRIBUTING, the human owns GitHub ops)

- Title (conventional commits): `feat: import AI-generated DFD canvas from JSON`
- Body must include: a summary, the **screenshots** from Task 3, the manual test notes (happy path + edge cases), and a note that you'll accept the CLA prompt.
- Remove the spec/plan/sample from the PR if maintainers prefer the PR to carry only shippable code — confirm with them; otherwise keep the authoring guide + sample (they're useful docs).

---

## Self-Review

**1. Spec coverage**
- Toolbar Import control → Task 2 Step 3. ✅
- `validateCanvasData` util → Task 1. ✅
- Editor `handleImportDiagram` (replace, fitView, toasts) → Task 2 Steps 5–6. ✅
- Data flow (load → Save → sync) → Task 2 + Task 3 Steps 2–3. ✅
- canvas_data contract → Task 4 guide + Task 1 sample. ✅
- Validation rules (errors/warnings) → Task 1 (matches spec §7: structure, ids, types, positions, labels, dangling edges, parentId). ✅
- Error handling/UX (toasts, replace-confirm, non-primary warning) → Task 2 Steps 2/5/6. ✅
- Risk #1 camelCase round-trip → Task 3 Step 4 (explicit check). ✅
- Risk #2 non-primary → handled (warning). ✅
- Out-of-scope (auto-layout, backend, set-primary, Export) → not introduced. ✅
- Verification = manual + screenshots (spec/user decision) → Task 3. ✅

**2. Placeholder scan:** No TBD/TODO; all code blocks are complete; commands have expected output. ✅

**3. Type consistency:** `CanvasData`, `DiagramNode`, `DiagramEdge` imported from `../types` / `./types` (the dfd-editor barrel that re-exports `diagram.ts`). `parseAndValidateCanvas` signature and `onImportDiagram: (canvas: CanvasData) => void` are consistent across toolbar and editor. `AlertDialog*` names match the confirmed exports. `applyImportedCanvas`/`handleImportDiagram` names consistent. ✅
