# Feature: Group vault nodes by project functionality (devlogbook)

## Objective
The exported vault must reflect the plugin's objective: nodes grouped by
PROJECT FUNCTIONALITY (import tickets, GTFS import, driver manifest, fares
payroll...), derived from Engram metadata, with a MOC hub per feature.

## Problem
Engram obsidian-export v2.0.0 organizes notes by memory TYPE
(architecture/, bug/, bugfix/...). That narration channel does not match how
developers think (per functionality) and produces an uninformative Obsidian
graph. The plugin's goal is a logbook of project functionality.

## Approach (agreed)
Deterministic keyword classification (option "curated keywords"):
- Mapping file `features.json` (vault-level overrides kit default; kit ships
  `config/features.example.json`).
- Sync phase `regroupByFeature` after pruneExportNoise: classify each
  exported note (title/topic_key/frontmatter tokens) and MOVE it from
  `engram/<project>/<type>/` to `engram/<project>/<feature>/`; no match ->
  `misc/`.
- Generate/update `MOC - <feature>.md` per feature folder with note list.
- Root MOC links feature MOCs. Wikilinks are filename-based, so moving notes
  does not break links.

## Tasks
- [x] T1. Reading/decide design: keywords file + regroup phase (this doc)
- [x] T2. Implement regroupByFeature + loadFeatureMap + feature MOCs in bin/devlogbook.js
- [x] T3. Ship config/features.example.json; document in README + SKILL.md
- [x] T4. Prepare project-level features.json for ta_schedule_backend vault (user-curated initial keywords)
- [x] T5. Run sync on real vault, verify graph (MOC-per-feature hubs, 0 broken) -> 9 features; 1195 notes; links 1267, 0 broken; distribution: import-tickets 750, fares-payroll 101, misc 80, tools-engram 63, driver-manifest 59, infra 47, gtfs-import 27, employees 23, daily-schedule 18
- [x] T6. Work-unit commits + engram progress notes -> commits 5d2d828 (prune/neutralize), 8f01750 (feature grouping); engram #1787

## Verification
- Run sync twice consecutively (idempotency: regroup must not duplicate or drop notes).
- Future: publish 1.1.0 with this feature.

## Constraints
- Deterministic, local, no LLM, no network. Notes are regenerable from Engram;
  `misc` is explicit, never a silent loss.
- Keep writeIfMissing semantics: never delete user content; regroup moves
  exporter-owned projections only (files under engram/).

## Verification
- `devlogbook sync --force` on real vault; disabled broken-link count == 0;
  feature folders + MOCs exist; notes count invariant (no lost notes).

## Status
In progress. Commit log recorded here after each task.
