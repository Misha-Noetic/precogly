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
  services → data stores). Keep zones ~320-400 wide; place child nodes at relative
  offsets inside them so they don't overlap.
- Give every node a distinct `position`. Do not omit positions.

## Prompt template

> Analyze the repository at <path/URL>. Produce a precogly DFD as a single `canvas_data`
> JSON object (`{nodes, edges}`) following the contract in this guide. Identify processes
> (services/APIs), data stores, external human and system actors, the trust zones they sit
> in, and the data flows between them (with protocol/encryption where inferable). Lay nodes
> out on a readable grid. Output only the JSON.

## Worked example

See [`superpowers/specs/sample-dfd-canvas.json`](superpowers/specs/sample-dfd-canvas.json)
for a complete, valid example. You can also generate a real one from any diagram: open it in
the DFD editor and click **Export** — the downloaded JSON is clean and re-importable, and makes
an ideal few-shot example to hand to the model.

## How import works

1. Open the threat model's **primary** DFD in the editor (threats are generated only from
   the primary DFD).
2. Click **Import** in the toolbar and choose the JSON file.
3. Review the diagram, then click **Save**. Saving runs precogly's sync, which creates the
   components, data flows, and auto-generated threats from the diagram.

Invalid files are rejected before anything loads, with a message describing the problem.
