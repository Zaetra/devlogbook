# OpenCode Traceability

Portable npm package that lets each developer investigate **their own** Engram memories and current repository with CodeGraph, then generate a local Obsidian-compatible knowledge graph.

The package contains no project memories, no vault notes, no SQLite database, and no credentials.

## Install

From npm:

```powershell
npm install --global opencode-traceability
```

For a local package build:

```powershell
npm install --global .\traceability-kit
```

Requirements:

- Node.js >= 18; npm installs `obsidian-intelligence` automatically.
- Engram CLI available as `engram` or through `ENGRAM_BIN`.
- CodeGraph initialized in the selected repository.
- OpenCode is optional for CLI-only use and required for the plugin.

## Create a project graph

The user chooses the project and vault. Nothing is imported until `sync` is executed.

```powershell
traceability init `
  --vault "C:\workspace\traceability-vault" `
  --project "ta_schedule_backend"

traceability sync `
  --vault "C:\workspace\traceability-vault" `
  --project "ta_schedule_backend" `
  --repo "C:\workspace\ta_schedule_backend"
```

`sync` performs:

1. `engram obsidian-export` for the selected Engram project.
2. CodeGraph caller enrichment for notes containing `codegraph_symbols`.
3. Obsidian Intelligence reindexing using the bundled npm dependency, or `OBSIDIAN_INTELLIGENCE_CLI` when overridden.

The generated graph belongs to the selected user/workspace. A different developer can select a different project and vault.

## Available commands

```text
traceability init   --vault <path> [--project <name>]
traceability sync   --vault <path> --project <name> --repo <path> [--since <date>] [--force]
traceability watch  --vault <path> --project <name> --repo <path> [--interval <minutes>]
traceability status --vault <path>
traceability graph  --vault <path> [--limit <n>]
traceability context --query <text> [--symbol <name>] [--project <name>] [--repo <path>] [--vault <path>]
traceability opencode-install --repo <path>
```

Example investigation:

```powershell
traceability context `
  --query "qué archivos usan el resolver de batches GTFS y qué cambios tuvo" `
  --symbol "GtfsBatchResolver" `
  --project "ta_schedule_backend" `
  --repo "C:\workspace\ta_schedule_backend" `
  --vault "C:\workspace\traceability-vault"
```

## Continuous mode

```powershell
traceability watch `
  --vault "C:\workspace\traceability-vault" `
  --project "ta_schedule_backend" `
  --repo "C:\workspace\ta_schedule_backend" `
  --interval 10
```

The watcher exports, enriches, and reindexes periodically. Stop with `Ctrl+C`.

## OpenCode integration

Install the npm plugin in the project's OpenCode configuration:

```powershell
traceability opencode-install --repo "C:\workspace\ta_schedule_backend"
```

Restart OpenCode. The plugin provides `traceability_context` and triggers a bounded sync after an idle session or when the agent completes a work-unit `git commit`, whichever methodology the project uses (SDD, ODD, or plain ad-hoc work).

```powershell
$env:TRACEABILITY_AUTO_SYNC = "true"
```

The plugin uses these environment variables:

```powershell
$env:TRACEABILITY_VAULT = "C:\workspace\traceability-vault"
$env:TRACEABILITY_PROJECT = "ta_schedule_backend"
$env:TRACEABILITY_REPO_ROOT = "C:\workspace\ta_schedule_backend"
$env:OBSIDIAN_INTELLIGENCE_CLI = "C:\workspace\node_modules\opencode-traceability\node_modules\obsidian-intelligence\vault-intelligence.js"
```

## Team-sharing policy

Share the npm package or publish it to the team's private registry. Do not package or publish:

- Markdown notes from another developer's project;
- `.vault-intelligence.db` or other SQLite files;
- `.codegraph` indexes;
- `node_modules`;
- `.env`, tokens, credentials, or absolute machine paths.

The package is code only. Each developer creates or selects their own vault and Engram project at runtime.

## Source layout

```text
bin/traceability.js       # npm CLI
plugin.ts                 # OpenCode plugin entrypoint
scripts/                  # sync, validation, and CodeGraph enrichment
config/                   # portable configuration examples
```

## Safety

- The CLI never deletes notes or application code.
- Queries are bounded to eight results by default.
- The package treats Engram as operational memory and Markdown as the generated projection.
- Ambiguous project names must be resolved explicitly with `--project`.
