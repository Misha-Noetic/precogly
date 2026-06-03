# Design: Import DFD from JSON (precogly DFD editor)

- **Date:** 2026-06-03
- **Status:** Approved — pending spec review
- **Author:** Misha Musheev (misha.musheev@noetic.net), with Claude Code
- **Target:** `precogly/precogly` (fork `Misha-Noetic/precogly`), branch `feat/ai-dfd-json-import`

## 1. Context & motivation

We want to use Claude to analyze a code repository, produce a Data Flow Diagram (DFD)
from it, and bring that diagram into an **existing** precogly threat model.

precogly renders DFDs with **React Flow** (`@xyflow/react`). A diagram is stored as
`canvas_data` — a JSON graph `{ nodes, edges }` — on the `DFD` model
(`backend/apps/diagrams/models.py`, JSONField). The node/edge shape is defined in
`frontend/src/features/dfd-editor/types/diagram.ts`.

The existing "Threat Model as Code" feature (OWASP TM-Library JSON import/export,
`backend/apps/threat_models/adapters/tm_library.py`) imports the **semantic** threat
model (components, flows, threats, controls, risks) but does **not** reconstruct the
visual canvas — it ignores the `diagrams[]` block and creates no `canvas_data`. So it
does not serve "see an AI-generated diagram in precogly's editor."

This feature adds a direct **canvas import** so an AI-authored `canvas_data` JSON can be
loaded into the DFD editor and saved like any hand-drawn diagram.

## 2. Goal & non-goals

**Goal.** A frontend "Import" control in the DFD editor that loads a Claude-generated
`canvas_data` JSON into the open diagram (replacing its contents), validated client-side.
After the user reviews and Saves, precogly's existing primary-DFD sync materializes
components / data flows / trust zones and auto-generates threats.

**Non-goals (YAGNI).**
- No backend changes — reuse `PATCH /api/diagrams/{id}/` and its existing sync.
- No LLM call inside precogly — Claude produces the JSON externally (ingest-only).
- No auto-layout — Claude must emit node positions.
- No "set primary" UI, no merge/append, no multi-file import.
- Export (round-trip) button is **deferred** — noted as a possible follow-up.

## 3. Approach (approved)

Add an **Import** button to the DFD editor toolbar. It reads a `.json` file, validates it
client-side, and (after a replace-confirmation when the canvas is non-empty) loads the
nodes/edges into the editor's React Flow state. The user sees the diagram, then clicks the
existing **Save**. Save already issues `PATCH /api/diagrams/{id}/ { canvas_data }`
(`useDiagramState.ts:52`), which triggers `sync_dfd_nodes_to_components`
(`backend/apps/diagrams/views.py:86` → `services.py:176`) on the **primary** DFD —
creating components/flows and generating threats. The save success handler already merges
backend-generated IDs (`componentId`, `trustZoneId`, `dataflowId`, …) back into node/edge
state (`useDiagramState.ts:142-186`), so the imported diagram becomes wired to the synced
records without a reload.

## 4. Architecture (three pieces)

### 4.1 Validation util — `features/dfd-editor/lib/importCanvas.ts` (new)
Pure, dependency-free function plus unit tests:

```ts
type ImportResult =
  | { ok: true; canvas: CanvasData; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] }

function parseAndValidateCanvas(text: string): ImportResult
```

- `JSON.parse` (catch → error "File is not valid JSON").
- Structural validation (see §7). Returns a flat list of human-readable errors/warnings.
- No mutation; positions are taken as-is from the file.

### 4.2 Toolbar control — `features/dfd-editor/components/DiagramToolbar.tsx`
- Add an "Import" `Button` + `Tooltip` next to the existing **Templates** button
  (~line 204), matching the established `Button`/`Tooltip` pattern.
- Owns a hidden `<input type="file" accept="application/json,.json">`; clicking the button
  opens the picker. On change: `FileReader.readAsText` → `parseAndValidateCanvas`.
  Mirrors the file-input pattern in `features/threat-models/pages/ThreatModels.tsx:142`
  and `ReferenceImageUploader.tsx:46`.
- On success → call new prop `onImportDiagram(canvas: CanvasData)`.
- On failure → surface errors (toast + dialog listing issues); do not call `onImportDiagram`.
- Reset the input value after each pick so re-importing the same filename re-fires `change`.

### 4.3 Editor handler — `features/dfd-editor/DFDEditor.tsx`
- New `handleImportDiagram(canvas)` passed to `<DiagramToolbar onImportDiagram=... />`:
  1. If current canvas is non-empty → confirm dialog
     ("Replace current diagram? This removes N nodes and M connections.").
  2. `setNodes(canvas.nodes)` + `setEdges(canvas.edges)` using the wrapped setters from
     `useDiagramState` (they mark `hasUnsavedChanges`). Precedent: bulk `setNodes([...])`
     on paste at `DFDEditor.tsx:248`.
  3. `fitView()` to frame the imported diagram.
  4. Success toast: "Imported N nodes / M connections — review and **Save** to generate threats."
  5. If the open DFD is **not** primary (`diagram.isPrimary === false`), also show a
     non-blocking warning: "This is a Reference DFD; threats are generated only from the
     primary DFD."

## 5. Data flow (sequence)

1. User opens a DFD (ideally the primary) in the editor.
2. Clicks **Import** → picks Claude's `.json`.
3. Client reads + `JSON.parse` + validates.
4. On valid (+ replace confirm) → load into React Flow state, `fitView`, toast.
5. User reviews, clicks **Save** (or 30s autosave) → `PATCH /api/diagrams/{id}/ { canvas_data }`.
6. Backend `perform_update` runs sync on the primary DFD → components/flows/threats created.
7. Response `canvas_data` returns with backend IDs; existing `onSuccess` merges them into state.

## 6. The `canvas_data` contract (what Claude emits)

`{ "nodes": DiagramNode[], "edges": DiagramEdge[] }`, **camelCase** keys exactly per
`diagram.ts` (the same shape the editor holds in memory and `GET /api/diagrams/{id}/`
returns):

- **node:** `id` (unique string), `type` ∈ `process | datastore | humanActor |
  systemActor | trustZone | systemScope`, `position: { x:number, y:number }`,
  `data: { label, ...typeSpecific }`, optional `parentId` + `extent: "parent"` for
  containment, optional `style` (e.g. `{ width, height }` for zones/scopes).
- **edge:** `id`, `type` ∈ `dataFlow | trustBoundary`, `source`, `target`,
  optional `sourceHandle` / `targetHandle`, `data: { ... }`
  (dataFlow: `label, protocol, dataClassification[], encrypted, authenticated,
  hasSensitiveData`; trustBoundary: `accessControlMethods[], authenticationMethods[], …`).

**Deliverable:** a short **Claude authoring guide + prompt** (see §12) so Claude reads a
repo and emits this shape directly — fulfilling the "no translation/conversion" goal.

## 7. Validation rules (client-side — the editor is the only validator)

`canvas_data` has no backend JSON Schema, so the import util is the gatekeeper.

**Errors (block import, list all):**
- Top level is not an object, or `nodes` / `edges` are not arrays.
- A node: missing/duplicate `id`; `type` not in the allowed set; `position.x`/`position.y`
  not finite numbers; missing `data.label`.
- An edge: missing/duplicate `id`; `type` not in the allowed set; `source` or `target`
  not referencing an existing node `id`.
- `parentId` references a node `id` that is not present.

**Warnings (allow, inform):**
- Importing into a non-primary DFD (threats won't be generated).
- Unknown extra keys on nodes/edges (ignored by React Flow / backend).
- `extent: "parent"` present without a valid `parentId` (containment may not render).

## 8. Error handling & UX

- Invalid JSON / validation errors → nothing loads; show the issue list. Claude mistakes
  are caught here with actionable messages.
- Replace-confirmation before overwriting a non-empty canvas.
- After load → `fitView()` + success toast; non-primary warning if applicable.
- Save failures surface via the existing mutation error path.

## 9. Testing

- **Unit (`importCanvas.test.ts`):** one valid fixture passes; one case per failure mode
  (bad JSON, missing id, dup id, bad type, non-numeric position, dangling edge endpoint,
  dangling parentId). Assert error messages.
- **Component (toolbar):** valid file → `onImportDiagram` called with parsed canvas;
  invalid file → errors shown, handler not called; input value resets after pick.
- **Fixture:** a golden sample `canvas_data` derived from an existing DFD template's
  `canvas_data` (pull via `GET /api/dfd-templates/{id}/` or backend seed data).
- **(Optional) e2e:** import fixture → nodes render → Save → assert `PATCH` body
  `canvas_data` equals the imported canvas.

## 10. Risks & open questions

1. **camelCase round-trip of `canvas_data` keys.** precogly's DRF stack uses
   `djangorestframework_camel_case` and underscoreizes incoming keys recursively
   (`config/settings/base.py`, `ignore_keys` only covers auth fields). The editor today
   sends `canvas_data` with camelCase inner keys and reads them back fine, so mirroring the
   editor's in-memory shape is safe in principle. **Verify empirically before relying on
   it:** import a fixture, Save, `GET` the DFD, and diff the round-tripped `canvas_data`
   against the input (watch `sourceHandle`, `parentId`, `crossesZoneIds`, etc.).
2. **Non-primary DFDs** don't sync — surfaced as a warning, not a block (matches the
   existing "Reference" badge concept in `ManageDFDsModal.tsx`).
3. **LLM layout quality.** Claude must emit sensible `position` values. Mitigated by the
   authoring guide (grid convention, containment rules). Auto-layout (dagre/elk) is
   explicitly deferred; no such dependency exists in the frontend today.

## 11. Out of scope

Auto-layout; backend changes; "set primary" UI; merge/append into an existing canvas;
multi-file import; any in-app LLM call. *Possible follow-up:* a matching **Export** button
to round-trip diagrams and seed Claude with real examples.

## 12. Companion deliverable — Claude authoring guide

A short prompt/spec (kept in the repo as a prompt template, e.g. under `docs/`) instructing
Claude to:
- read a target repository and infer the DFD (processes, datastores, external human/system
  actors, trust zones, data flows);
- emit **only** the `canvas_data` JSON in the §6 shape;
- assign `position` on a tidy grid (e.g. columns by trust zone, rows by layer) and use
  `parentId` + `extent:"parent"` for nodes inside zones/scopes;
- choose edge `type` (`dataFlow` vs `trustBoundary`) and populate security metadata
  (protocol, encryption, data classification) where inferable.

This guide is what makes the end-to-end "repo → diagram → precogly" workflow real; the
import button is the ingestion half.
