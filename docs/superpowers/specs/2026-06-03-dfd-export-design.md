# Design: Export DFD to JSON (precogly DFD editor)

- **Date:** 2026-06-03
- **Status:** Approved — pending spec review
- **Author:** Misha Musheev (misha.musheev@noetic.net), with Claude Code
- **Target:** `precogly/precogly` (fork `Misha-Noetic/precogly`), branch `feat/ai-dfd-json-import` (ships with the import feature)

## 1. Context & motivation

The DFD editor now has a JSON **Import** button (`importCanvas.ts` + toolbar + editor). Export
is the mirror: download the current diagram's `canvas_data` as a clean JSON file. This enables
round-tripping (export → edit/version → re-import) and produces real, clean examples to feed an
AI when authoring diagrams (the companion to `docs/ai-dfd-authoring-guide.md`).

Diagrams are React Flow graphs stored as `canvas_data` (`{ nodes, edges }`), defined in
`frontend/src/features/dfd-editor/types/diagram.ts`. The editor holds the live graph in
`useDiagramState` (`nodes`, `edges`).

## 2. Goal & non-goals

**Goal.** An **Export** button in the DFD editor toolbar that serializes the current editor
state into a clean, import-compatible `canvas_data` JSON and downloads it. Client-side only.

**Non-goals (YAGNI).**
- No backend changes.
- Not the whole-threat-model TM-Library export (already exists on the threat-model detail page).
- No image (PNG/SVG) export.
- No server-side storage of exports.

## 3. Approach (approved)

Mirror the import feature. Add an **Export** button beside **Import** in the toolbar. On click,
the editor builds a cleaned `{ nodes, edges }` from its current `nodes`/`edges`, serializes it as
pretty-printed JSON, and triggers a browser download named from the diagram title. Cleaning uses
a **denylist** (strip known transient/instance keys, preserve everything else) so the output is
clean but faithful and unknown fields are never silently dropped.

## 4. Architecture (mirrors import's three pieces)

### 4.1 `frontend/src/features/dfd-editor/lib/exportCanvas.ts` (new)
- `toExportableCanvas(nodes: DiagramNode[], edges: DiagramEdge[]): CanvasData` — **pure**.
  Returns a deep-cleaned `{ nodes, edges }` per the rules in §5.
- `downloadTextFile(filename: string, text: string): void` — small DOM helper: create a
  `Blob`, object URL, a temporary `<a download>`, click, then revoke the URL.
- `canvasFilename(diagramName?: string): string` — slugify the name → `"<slug>-dfd.json"`,
  fallback `"diagram-dfd.json"`.

### 4.2 Toolbar — `components/DiagramToolbar.tsx`
- Add an **Export** `Button`+`Tooltip` (lucide `Download` icon) immediately after the Import
  button, calling a new prop `onExportDiagram: () => void`.

### 4.3 Editor — `DFDEditor.tsx`
- `handleExportDiagram = useCallback(() => { ... }, [nodes, edges, diagram])`:
  - If `nodes.length === 0`, `toast.info('Diagram is empty')` and still export `{nodes:[],edges:[]}`.
  - `const clean = toExportableCanvas(nodes, edges)`
  - `downloadTextFile(canvasFilename(diagram?.name), JSON.stringify(clean, null, 2))`
  - `toast.success('Exported <n> nodes and <m> connections.')`
- Pass `onExportDiagram={handleExportDiagram}` to `<DiagramToolbar />`.

## 5. Cleaning rule (denylist — strip known noise, preserve the rest)

**Node** — drop top-level React Flow runtime keys: `selected`, `dragging`, `measured`,
`positionAbsolute`, `zIndex`. In `data`, drop: `isNewlyInserted`, `lockAnimationKey`,
`receiveChildAnimationKey`, `componentId`, `trustZoneId`, `orgsystemId`, `parentComponentId`,
`component_id`, `component_library_id`, `component_ref`. Keep `id`, `type`, `position`, `data`
(cleaned), and `parentId`/`extent`/`style` when present.

**Edge** — drop top-level `selected`. In `data`, drop: `isNewlyInserted`, `dataflowId`,
`trustBoundaryId`, `crossesZoneId`, `crossesZoneLabel`, `crossesZoneTrustLevel`,
`crossesZoneColor`, `crossesZoneIds`. Keep `id`, `type`, `source`, `target`, `sourceHandle`/
`targetHandle` when present, `data` (cleaned), and any remaining visual props (`animated`, etc.).

The deny lists are defined as constants in `exportCanvas.ts`. Cleaning copies each object,
deletes denied keys, and recurses one level into `data`. Output validates against the import
contract (so an exported file re-imports without warnings).

## 6. Output

- Pretty-printed JSON, 2-space indent: `{ "nodes": [...], "edges": [...] }`.
- Filename `"<slug>-dfd.json"` from the diagram name (lowercase, non-alphanumeric → `-`,
  collapse repeats, trim); fallback `"diagram-dfd.json"`.
- Empty canvas: export proceeds with empty arrays + an info toast.

## 7. Error handling / UX

- Export reads in-memory state and writes a Blob — no network, minimal failure surface.
- Success toast with node/connection counts; info toast when the diagram is empty.
- Exports the **live** editor state (includes unsaved edits) — "what you see is what you export".

## 8. Testing / verification

Manual (per `CONTRIBUTING.md`): `tsc -b` + `npm run lint`, then in-app **export → re-import →
confirm round-trip** (the strongest check; exercises both features and the cleaning rule), plus
verify the exported file is clean (no `selected`/`measured`/backend IDs) and re-imports with no
warnings. Screenshots for the PR. No automated frontend tests (no runner in the repo).

## 9. Out of scope

Backend changes; TM-Library/whole-model export; image export; export history/storage.

## 10. Risks

- **Resized container sizes:** zone/scope sizes set via `style` are preserved (kept). If a
  resize is stored only in top-level `width`/`height` (React Flow runtime), it is treated as
  runtime and not exported — acceptable, since layout is re-fit on import. Confirm during the
  round-trip test that zones look right after re-import.
