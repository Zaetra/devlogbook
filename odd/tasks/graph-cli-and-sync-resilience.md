# Feature: graph CLI resolution + sync resilience (devlogbook)

## Objective

`devlogbook graph` must work without `OBSIDIAN_INTELLIGENCE_CLI` set, using
the same CLI resolution as `status`/`context`. `devlogbook sync` must report a
failed Engram export but still run prune → regroup → enrich → reindex, so a
partial export (e.g. one bad session hub filename on Windows) does not abort
the whole pipeline.

## Problem (evidence from package test, 2026-10-15)

1. `bin/devlogbook.js` → `graph()` reads `process.env.OBSIDIAN_INTELLIGENCE_CLI`
   directly and throws "Obsidian Intelligence is not installed" when it is
   unset, even though `obsidian-intelligence` resolves from the package's own
   `node_modules` (verified: with the env var set, `graph` returns hubs fine;
   also triggers DEP0187 because `fs.existsSync(undefined)`).
   `resolveObsidianCli()` already exists and is used by `reindex()`/`context()`.
2. `sync()` calls `exportMemories()` which uses `run()`; any non-zero exit
   throws and aborts before prune/regroup/enrich/reindex. Observed with
   engram 3.0.0: export creates 1571 notes then fails on one session hub
   named `...:resume:....md` ("path escapes from parent", invalid on
   Windows), exit 1 → whole sync fails. With a wrapper forcing exit 0, every
   downstream phase succeeded (prune → 0 `_sessions`/`_topics`, regroup → 13
   feature MOCs, enrich OK, reindex → 1538 notes, 0 broken links).

## Approach (agreed with user: "fix both")

- `graph()`: use `resolveObsidianCli()` + guard (`!cli || !fs.existsSync(cli)`).
- `sync()`: wrap `exportMemories()` in try/catch → print
  `[devlogbook] engram export failed: ...` and continue the pipeline; track the
  export failure and set `process.exitCode = 1` AFTER all phases complete, so
  scripts see partiality without losing the work. `watch` resets
  `process.exitCode = 0` at the start of each cycle so a later healthy cycle
  clears a stale code.
- Test-first with Node's built-in test runner (`node --test`), no new deps:
  - RED/GREEN for `graph` in a clean env (no `OBSIDIAN_INTELLIGENCE_CLI`).
  - RED/GREEN for `sync` resilience with a stub `ENGRAM_BIN` exiting 1,
    asserting downstream phases ran and the final exit code is 1.

## Tasks

- [x] T1. Design decisions + evidence (this doc) + ODD tracking (todo list)
- [x] T2. RED: CLI test for `graph` without env var (observed: exit 1 "not installed")
- [x] T3. GREEN: `graph()` uses `resolveObsidianCli()`; test passes
- [x] T4. RED: CLI test for `sync` with failing ENGRAM_BIN stub (observed:
      abort at export, no reindex)
- [x] T5. GREEN: `sync()` catches export failure, continues phases, exit 1;
      `watch` resets `process.exitCode` per cycle
- [x] T6. Full regression: status/context/graph/sync on copied vault, npm test
      2/2; lint blockers fixed (JSON.parse guard in `installOpenCode`,
      template literal, unused `os` import); README documents partial sync;
      commits below + Engram mirror updated

## Verification

- `npm test` (node --test) green.
- `devlogbook graph --vault <empty>` works with env var unset.
- `devlogbook sync` on a copied vault with stub ENGRAM_BIN: prints export
  failure, still reindexes, exit code 1.
- Real `devlogbook sync` on copied vault: completes (exit 1 while engram's
  session-hub bug persists; the engram bug itself is upstream, out of scope).

## Constraints

- No new dependencies. Windows-first behavior preserved (shell handling).
- Export failures are reported, never silent; prune/regroup only touch
  exporter-owned projections (`engram/`), so continuing after a partial export
  cannot destroy user content.

## Status

Complete. Commit log on branch `fix/graph-sync-resilience`:

- `4af4cec` fix: resolve obsidian-intelligence CLI in graph command (T2+T3,
  test/graph.test.js, npm test script)
- `b7d460f` fix: continue sync pipeline after engram export failure (T4+T5,
  test/sync.test.js, README partial-sync docs)
- `42c89a2` fix: guard opencode.json parsing and drop unused import
  (pipeline lint blockers)
- this record: docs commit
