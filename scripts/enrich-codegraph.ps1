[CmdletBinding()]
param(
  [ValidateRange(1, 100)]
  [int]$MaxCallers = 8,
  [switch]$Strict
)

$ErrorActionPreference = "Stop"

function Require-Environment([string]$Name) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) { throw "Required environment variable is missing: $Name" }
  return $value
}

$vault = Require-Environment "TRACEABILITY_VAULT"
$repo = Require-Environment "TRACEABILITY_REPO_ROOT"
if (-not (Test-Path -LiteralPath $vault -PathType Container)) { throw "Vault does not exist: $vault" }
if (-not (Test-Path -LiteralPath $repo -PathType Container)) { throw "Repository does not exist: $repo" }

$codegraph = $env:TRACEABILITY_CODEGRAPH_BIN
if ([string]::IsNullOrWhiteSpace($codegraph)) {
  $command = Get-Command codegraph -ErrorAction SilentlyContinue
  if ($null -eq $command) { throw "CodeGraph CLI not found. Set TRACEABILITY_CODEGRAPH_BIN or add codegraph to PATH." }
  $codegraph = $command.Source
}

function Get-Symbols([string]$Text) {
  $match = [regex]::Match($Text, '(?m)^codegraph_symbols:\s*\[(.*?)\]\s*$')
  if (-not $match.Success) { return @() }
  return @($match.Groups[1].Value.Split(',') | ForEach-Object { $_.Trim().Trim('"', "'") } | Where-Object { $_ })
}

function Format-Consumers([hashtable]$Consumers, [string[]]$Symbols) {
  $lines = [System.Collections.Generic.List[string]]::new()
  if ($Consumers.Count -eq 0) {
    $lines.Add('- Sin consumidores detectados en CodeGraph para los símbolos declarados.')
    return $lines
  }
  foreach ($path in ($Consumers.Keys | Sort-Object)) {
    $details = @($Consumers[$path] | Sort-Object -Unique) -join ', '
    $lines.Add(('- `{0}` — caller de `{1}`' -f $path, $details))
  }
  return $lines
}

$updated = 0
$failed = 0
foreach ($file in Get-ChildItem -LiteralPath $vault -Filter *.md -File) {
  $text = [System.IO.File]::ReadAllText($file.FullName, [System.Text.UTF8Encoding]::new($false))
  $symbols = @(Get-Symbols $text)
  if ($symbols.Count -eq 0) { continue }

  $consumers = @{}
  foreach ($symbol in $symbols) {
    try {
      $json = (& $codegraph callers $symbol --path $repo --limit $MaxCallers --json | Out-String) | ConvertFrom-Json
      foreach ($caller in @($json.callers)) {
        if (-not $caller.filePath) { continue }
        if (-not $consumers.ContainsKey($caller.filePath)) { $consumers[$caller.filePath] = [System.Collections.Generic.List[string]]::new() }
        $line = if ($caller.startLine) { ":$($caller.startLine)" } else { "" }
        $consumers[$caller.filePath].Add("$symbol$line")
      }
    } catch {
      $failed++
      Write-Warning ("CodeGraph failed for {0} in {1}: {2}" -f $symbol, $file.Name, $_.Exception.Message)
    }
  }

  $section = [System.Collections.Generic.List[string]]::new()
  $section.Add("## Archivos que usan esta funcionalidad")
  $section.Add("")
  foreach ($line in (Format-Consumers $consumers $symbols)) { $section.Add($line) }
  $section.Add("")
  $newSection = $section -join [Environment]::NewLine

  $heading = "## Archivos que usan esta funcionalidad"
  $history = "## Historial de cambios sobre este nodo"
  $sources = "## Fuentes"
  $start = $text.IndexOf($heading, [System.StringComparison]::Ordinal)
  if ($start -ge 0) {
    $end = $text.IndexOf($history, $start, [System.StringComparison]::Ordinal)
    if ($end -lt 0) { $end = $text.IndexOf($sources, $start, [System.StringComparison]::Ordinal) }
    if ($end -lt 0) { $end = $text.Length }
    $text = $text.Substring(0, $start) + $newSection + [Environment]::NewLine + [Environment]::NewLine + $text.Substring($end)
  } else {
    $insertAt = $text.IndexOf($history, [System.StringComparison]::Ordinal)
    if ($insertAt -lt 0) { $insertAt = $text.IndexOf($sources, [System.StringComparison]::Ordinal) }
    if ($insertAt -lt 0) { $insertAt = $text.Length }
    $text = $text.Substring(0, $insertAt) + $newSection + [Environment]::NewLine + [Environment]::NewLine + $text.Substring($insertAt)
  }

  [System.IO.File]::WriteAllText($file.FullName, $text, [System.Text.UTF8Encoding]::new($false))
  $updated++
}

Write-Output "CodeGraph enrichment complete: $updated notes updated, $failed symbol queries failed."
if ($Strict -and $failed -gt 0) { exit 1 }
