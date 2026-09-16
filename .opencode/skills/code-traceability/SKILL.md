---
name: code-traceability
description: Use before changing code or completing an SDD phase to connect current CodeGraph impact, Engram history, and the shared Markdown knowledge graph.
---

# Team Code Traceability

## Before changing code

1. Resolve the repository root and project identity.
2. Search the shared vault with `hybrid_search` or `search_content` for the requested behavior.
3. Search Engram for the project and affected symbol/file.
4. Query CodeGraph for callers, callees, and affected files.
5. Compare historical decisions with the current tree. Report conflicts instead of guessing.

Use bounded context: include the relevant notes and up to the configured caller limit. Do not dump the complete vault into a prompt.

## During SDD

Persist phase artifacts under `sdd/<change>/<phase>` and preserve the user prompt/decision that produced them. Use Engram as operational memory; do not treat generated Markdown as the only source of truth.

## After archive or a significant change

1. Run the portable sync script with `TRACEABILITY_VAULT` and `TRACEABILITY_PROJECT`.
2. Run the CodeGraph enrichment script with `TRACEABILITY_REPO_ROOT`.
3. Update the corresponding Markdown node with:
   - `Archivos que usan esta funcionalidad` from CodeGraph;
   - `Historial de cambios sobre este nodo` from Engram;
   - source IDs, dates, and links to the project MOC.
4. Reindex Obsidian Intelligence and validate broken links.
5. Keep the diff reviewable. Never rewrite unrelated notes.

## Safety

- Never modify application code automatically from this skill.
- Never use absolute paths belonging to another developer.
- Never commit credentials, SQLite databases, or CodeGraph indexes.
- Treat ambiguous or conflicting history as a human decision, not as permission to infer.
- Keep source files and Markdown projections separate and auditable.
