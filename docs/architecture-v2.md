# devlogbook v2 — Architecture design

Status: **Draft for review** · Date: 2026-10-22
Scope: redesign of the package core. No code yet — this document is the contract.

---

## 1. Vision

`devlogbook` turns a project's operational memory into a **documented source of truth** about the
project's real functionality, projected into Obsidian, and served to code agents as **bounded,
deterministic context**.

Two audiences, one evidence base:

- **Code agents** get context that answers *what is this, why does it exist, who consumes it, and
  does it exist on the branch I have open*.
- **Users of the project** get documentation generated from the same evidence, restricted to
  claims a human has signed off.

## 2. Design principles

1. **Functionality is the center.** The vault is organized by functionality, never by branch.
2. **Truth is a verified claim, not a note.** A note becomes truth only after machine checks and a
   human signature.
3. **Provenance is mandatory.** Every claim carries project, branch, commit and source.
4. **Deterministic when possible, degradable always.** Nothing depends on a tool that may be absent;
   absence lowers resolution, never breaks the pipeline.
5. **Who drafts does not sign.** An agent may propose a claim; only a human signs it.

### Axis roles

| Axis | Role | Question | Form |
|---|---|---|---|
| project | container | *whose is this?* | folder |
| **functionality** | **organization** | *what does the system do?* | **folder + MOC + entity** |
| branch | truth qualifier | *where does this exist?* | **tag + annotation** |

> Organize by functionality. Verify by branch. Navigate by project.

## 3. Roles

### 3.1 The package

Owns the pipeline and the truth model: export, prune, regroup, verify, sign, project.
It never invents facts; it moves, validates and projects evidence.

### 3.2 CodeGraph — deterministic anchor for structure

CodeGraph knows **structure**, not **intent**. It can never say *why* a module exists; that is the
memory and curation layer. Its four roles:

| Role | Resolves | Enables |
|---|---|---|
| Feature footprint | which paths/symbols compose a functionality | features anchored in code, not keywords |
| Classification by intersection | `claim.files ∩ feature.footprint` | replaces the heuristic keyword classifier |
| Verification | `symbol-exists`, footprint drift on a branch | the machine half of the truth model |
| Blast radius | what else is affected by a change | the most valuable deterministic datum before an edit |

Degradation contract (testable):

| Capability | Without CodeGraph | With CodeGraph |
|---|---|---|
| export / prune / regroup | unchanged | unchanged |
| classification | keyword fallback | intersection — deterministic |
| verify `file-exists` | filesystem only | filesystem only |
| verify `symbol-exists` | `unverifiable` (reported, never faked) | verified |
| context callers | omitted with notice | verified |
| docs projection | unchanged | unchanged |

`file-exists` does **not** require CodeGraph: the minimal anchor (real paths) always works.
CodeGraph raises resolution; it does not enable it.

### 3.3 The code agent — reader with lenses, author without signature

The agent never reads the raw vault. It consumes lenses:

| Lens | Answers | Surface |
|---|---|---|
| Function | *what is this and why?* | `traceability_context` (functionality hub first) |
| Impact | *if I change this, what else moves?* | `traceability_impact` (CodeGraph, degradable) |
| Validity | *does this exist on my open branch?* | resolved inside `context` |

Session lifecycle:

```
1. BEFORE TOUCHING  → context (functionality first, current branch)
2. EDIT GATE        → did you consult the functionality you are about to change?
3. DURING           → impact per symbol/file being edited
4. ON CLOSE         → capture with sealed provenance (branch/commit)
                      + proposed curated claim → SIGNATURE QUEUE
```

The gate evolves from *"did you consult context once"* to *"did you consult the functionality you
are editing, on this branch, and see whether its claim is valid here"*. The most expensive agent
failure is not editing without context — it is editing while assuming behaviour that only exists on
another branch.

### 3.4 The human

Signs the documentation surface, not the whole vault. Signing binds content hash + branch + the
current machine verdict; any of the three changing invalidates the signature automatically.

## 4. Information architecture

```
<vault>/
  projects/
    <project>/
      registry.json              # identity: name, repo root, remote URL
      features/
        import-tickets.yaml      # curated entity (definition, footprint, relations)
      curated/                   # human-authored claims — sync NEVER touches this
      engram/                    # generated projection — regenerated freely
        <feature>/
          MOC - <feature>.md
          <note>.md
      docs/                      # user-facing projection, signed claims only
```

Hard rule: **a stable dimension is a folder; a volatile dimension is a tag.**
Project and functionality are stable → folders. Branch is volatile → frontmatter tag plus
annotation. Duplicating the vault per branch or per worktree guarantees drift and
self-contradicting documentation, so it is explicitly forbidden.

Functionality types are separated so the center is not polluted:

- `feature` — a capability of the product (own MOC, own registry entry)
- `convention` / `infra` — cross-cutting; **linked from** features, never competing with them
- `tooling` — internal tooling notes, excluded from the user-facing projection

## 5. Data model

### 5.1 Claim (note frontmatter)

```yaml
---
id: 1217
project: ta_schedule_backend
branch: dev                 # branch at capture time; `unknown` for legacy notes
commit: 4af4cec             # head at capture time
source: engram|codegraph|human|ci
status: proposed            # proposed → machine-verified → human-approved
captured_at: "2026-08-12T16:25:27Z"
feature: import-tickets
scope: branch-bound         # branch-bound | branch-invariant
claims:
  - kind: code-structure
    checks: [file-exists, symbol-exists]
    files: [app/Services/ImportTicketService.php]
  - kind: behavior
    checks: [test-passes]
    test: ImportTicketServiceTest
  - kind: decision
    checks: []              # architecture: human-verifiable only, by design
---
```

`files` is structured data. The free-text `Where:` field of v1 cannot be validated and is the
opposite of deterministic.

### 5.2 Feature registry

```yaml
feature: import-tickets
type: feature
definition: "Imports tickets from TOPS and materializes them into the daily schedule"
footprint:
  paths: [app/Services/ImportTicket*, app/Http/Controllers/ImportTicket*]
  symbols: [ImportTicketService]
relations: [daily-schedule, employees]
releases:
  master: released (v1.1.0)
  dev: in progress
```

### 5.3 Signature ledger

Signatures live in the curated layer (or a sidecar ledger) — never in generated notes, because
`sync` regenerates those and would destroy them.

```
signature = hash(claim content) + branch + machine verdict revision
```

### 5.4 Truth state machine

```
proposed ──verify──▶ machine-verified ──sign──▶ human-approved
    ▲                       │                        │
    └────── edit ───────────┴─── stale (code changed) ─┘
```

Declared checks per claim:

| Check | Source | Deterministic |
|---|---|---|
| `file-exists` | filesystem of the checkout | yes |
| `symbol-exists` | CodeGraph (degrades to `unverifiable`) | yes |
| `test-passes` | project test runner | yes |
| `merged-into` | git: is the commit/PR on that branch | yes |

## 6. Surfaces

### Agent tools (read + propose)

| Tool | Purpose |
|---|---|
| `traceability_context` | functionality hub, claims, callers — one bounded call |
| `traceability_impact` | blast radius for a symbol or file |

### CLI (humans and CI)

| Command | Purpose |
|---|---|
| `devlogbook sync` | export → prune → regroup → enrich → reindex, with provenance |
| `devlogbook verify [--branch] [--project]` | run declared checks; report `verified / stale / unverifiable` |
| `devlogbook sign <note>` | human signature, binds content + branch + verdict |
| `devlogbook docs [--project]` | user-facing projection from signed claims only |
| `devlogbook status / graph / context` | existing commands, scoped by project and branch |

### Project identity resolution

Ordered, most explicit first — never `basename(cwd)` alone:

```
--project <name>              explicit, wins
.devlogbook.json (repo root)  declared identity
remote URL basename           github.com/Owner/repo → repo
basename(cwd)                 fallback + warning
```

Backwards compatible: existing vaults keep their names; the new resolution maps to them instead of
orphaning them.

## 7. Current-state gaps this design fixes

| Gap | Evidence |
|---|---|
| No branch anywhere | exported frontmatter has no `branch`/`commit` |
| Cross-project leakage | Obsidian search and `graph hubs` are not project-scoped |
| Fragile project identity | `project = path.basename(process.cwd())` |
| Global env defeats multi-repo | pinned `TRACEABILITY_PROJECT` sends every repo to one bucket |
| Global feature map | one `features.json` for every project in the vault |
| Heuristic classification | `haystack.includes(keyword)`, first match wins, silent `misc` |
| Two divergent plugins | `plugin.ts` delegates to the CLI; the installed `.opencode/plugins/traceability.ts` reimplements it without feature awareness |
| Dead config | `config/traceability.example.json` is read by nothing |
| Functionality types mixed | `features.json` mixes product features with `infra`, `backend-conventions`, `tools-engram` |

## 8. Roadmap

| Phase | Deliverable | Acceptance |
|---|---|---|
| **P1 — Identity + provenance** | stable project identity; `branch`/`commit`/`source` sealed at capture; structured `files`/`checks`; feature registry | new notes carry full provenance; legacy notes read `branch: unknown`; nothing existing breaks |
| **P1b — Single engine** | installed plugin becomes a thin adapter over `devlogbook context` | one implementation; divergence removed; release note required |
| **P2 — Verification** | `verify` + signature ledger in the curated layer | `verified / stale / unverifiable` reported honestly; signature invalidates on edit, branch change or stale verdict |
| **P3 — Scope** | project scoping for Obsidian search and `graph`; `--branch` validity lens | no cross-project leakage; `dev`-only claims are visibly marked |
| **P4 — Docs projection** | `docs` from signed claims, per functionality, with availability notes | zero unsigned content reaches user documentation |

Each phase ships alone. Work may stop after any phase without stranding the rest.

## 9. Non-goals

- One vault per branch or per worktree — forbidden by the axis rule.
- The agent signing its own claims — structurally impossible, not merely discouraged.
- Generating user documentation from raw operational memory — the curation gate exists to prevent it.
- Requiring CodeGraph — see the degradation contract.

## 10. Open questions

1. Does `obsidian-intelligence` support sub-folder-scoped search? If not, results are filtered by
   path prefix (`<vault>/engram/<project>/`) — deterministic, but verify before implementing P3.
2. Who maintains the feature registry when a functionality is renamed or split? Automated drift
   detection (footprint no longer resolves) versus human reconciliation.
3. Signature UX for a solo maintainer: batch signing per functionality, or per claim?
