---
description: Export Engram and enrich the shared vault with current CodeGraph callers.
---

Run the team traceability sync for the current workspace.

Requirements:

- `TRACEABILITY_VAULT`
- `TRACEABILITY_PROJECT`
- `TRACEABILITY_REPO_ROOT`
- `ENGRAM_BIN` or `engram` on PATH

Run:

```powershell
traceability sync --vault "$env:TRACEABILITY_VAULT" --project "$env:TRACEABILITY_PROJECT" --repo "$env:TRACEABILITY_REPO_ROOT"
```

Report the export, enrichment, reindex, and validation results. Do not modify application code.
