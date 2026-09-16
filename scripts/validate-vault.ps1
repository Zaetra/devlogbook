[CmdletBinding()]
param([switch]$Strict)

$ErrorActionPreference = "Stop"
$errors = [System.Collections.Generic.List[string]]::new()

if ([string]::IsNullOrWhiteSpace($env:TRACEABILITY_VAULT)) { $errors.Add("TRACEABILITY_VAULT is missing") }
elseif (-not (Test-Path -LiteralPath $env:TRACEABILITY_VAULT -PathType Container)) { $errors.Add("Vault does not exist: $env:TRACEABILITY_VAULT") }

if ([string]::IsNullOrWhiteSpace($env:TRACEABILITY_PROJECT)) { $errors.Add("TRACEABILITY_PROJECT is missing") }
if ([string]::IsNullOrWhiteSpace($env:TRACEABILITY_REPO_ROOT)) { $errors.Add("TRACEABILITY_REPO_ROOT is missing") }

$engram = if ($env:ENGRAM_BIN) { $env:ENGRAM_BIN } else { (Get-Command engram -ErrorAction SilentlyContinue).Source }
if ([string]::IsNullOrWhiteSpace($engram)) { $errors.Add("Engram CLI not found") }

if ($errors.Count -gt 0) {
  $errors | ForEach-Object { Write-Error $_ }
  if ($Strict) { exit 1 }
}

if ($env:TRACEABILITY_VAULT -and (Test-Path -LiteralPath $env:TRACEABILITY_VAULT)) {
  $notes = @(Get-ChildItem -LiteralPath $env:TRACEABILITY_VAULT -Filter *.md -File)
  Write-Output "Vault: $env:TRACEABILITY_VAULT"
  Write-Output "Markdown notes: $($notes.Count)"
  Write-Output "SQLite indexes are local and must remain ignored by Git."
}

if ($errors.Count -gt 0) { exit 1 }
Write-Output "Traceability configuration is valid."
