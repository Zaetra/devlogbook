[CmdletBinding()]
param(
  [string]$Since,
  [switch]$Force,
  [switch]$Enrich,
  [switch]$Watch,
  [ValidateRange(1, 1440)]
  [int]$IntervalMinutes = 10,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Require-Environment([string]$Name) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Required environment variable is missing: $Name"
  }
  return $value
}

$vault = Require-Environment "TRACEABILITY_VAULT"
$project = Require-Environment "TRACEABILITY_PROJECT"
if (-not (Test-Path -LiteralPath $vault -PathType Container)) { throw "Vault does not exist: $vault" }

$engram = $env:ENGRAM_BIN
if ([string]::IsNullOrWhiteSpace($engram)) {
  $command = Get-Command engram -ErrorAction SilentlyContinue
  if ($null -eq $command) { throw "Engram CLI not found. Set ENGRAM_BIN or add engram to PATH." }
  $engram = $command.Source
}

$args = @("obsidian-export", "--vault", $vault, "--project", $project)
if ($Since) { $args += @("--since", $Since) }
if ($Force) { $args += "--force" }
if ($Watch) { $args += @("--watch", "--interval", ("{0}m" -f $IntervalMinutes)) }

if ($DryRun) {
  Write-Output ("DRY RUN: {0} {1}" -f $engram, ($args -join " "))
  exit 0
}

& $engram @args
if ($LASTEXITCODE -ne 0) { throw "Engram export failed with exit code $LASTEXITCODE" }
if ($Watch) { exit 0 }

if ($Enrich) {
  $enricher = Join-Path $PSScriptRoot "enrich-codegraph.ps1"
  & $enricher
  if ($LASTEXITCODE -ne 0) { throw "CodeGraph enrichment failed with exit code $LASTEXITCODE" }
}

$cli = $env:OBSIDIAN_INTELLIGENCE_CLI
if ([string]::IsNullOrWhiteSpace($cli)) {
  $candidate = Join-Path $PSScriptRoot "..\node_modules\obsidian-intelligence\vault-intelligence.js"
  if (Test-Path -LiteralPath $candidate) { $cli = (Resolve-Path -LiteralPath $candidate).Path }
}

if ([string]::IsNullOrWhiteSpace($cli) -or -not (Test-Path -LiteralPath $cli -PathType Leaf)) {
  Write-Warning "Engram export completed; Obsidian reindex skipped. Set OBSIDIAN_INTELLIGENCE_CLI to vault-intelligence.js."
  exit 0
}

$node = $env:TRACEABILITY_NODE
if ([string]::IsNullOrWhiteSpace($node)) {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if ($null -eq $nodeCommand) { throw "Node not found. Set TRACEABILITY_NODE." }
  $node = $nodeCommand.Source
}

& $node $cli index --vault $vault
if ($LASTEXITCODE -ne 0) { throw "Obsidian index failed with exit code $LASTEXITCODE" }
& $node $cli status --vault $vault
if ($LASTEXITCODE -ne 0) { throw "Obsidian status failed with exit code $LASTEXITCODE" }
