const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const cli = path.resolve(__dirname, "..", "bin", "devlogbook.js")

test("sync reports engram export failure, runs downstream phases, exits 1", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dlb-sync-"))
  const vault = path.join(tmp, "vault")
  const repo = path.join(tmp, "repo")
  fs.mkdirSync(vault, { recursive: true })
  fs.mkdirSync(repo, { recursive: true })
  fs.writeFileSync(path.join(vault, "Inicio.md"), "# test vault\n")

  // Stub Engram CLI that simulates a partial export failure (the observed
  // engram 3.0.0 session-hub filename bug exits 1 after creating notes).
  const stubExt = process.platform === "win32" ? ".cmd" : ".sh"
  const stub = path.join(tmp, `engram-stub${stubExt}`)
  if (process.platform === "win32") {
    fs.writeFileSync(stub, "@echo off\r\necho stub: export failed\r\nexit /b 1\r\n")
  } else {
    fs.writeFileSync(stub, "#!/bin/sh\necho 'stub: export failed'\nexit 1\n")
    fs.chmodSync(stub, 0o755)
  }

  const env = { ...process.env, ENGRAM_BIN: stub }
  // Both tests run with OBSIDIAN_INTELLIGENCE_CLI removed so downstream
  // reindex resolution is exercised through resolveObsidianCli().
  delete env.OBSIDIAN_INTELLIGENCE_CLI

  const result = spawnSync(
    process.execPath,
    [cli, "sync", "--vault", vault, "--project", "test-project", "--repo", repo],
    { encoding: "utf8", env, timeout: 180000 },
  )

  const output = `${result.stdout}\n${result.stderr}`
  assert.match(
    output,
    /engram export failed/i,
    `expected export failure report\noutput: ${output}`,
  )
  // Downstream phases must still run: reindex prints the OI status block.
  assert.match(
    output,
    /Obsidian-Intelligence Status/,
    `expected reindex to run after export failure\noutput: ${output}`,
  )
  assert.equal(
    result.status,
    1,
    `expected exit 1 to signal partial sync, got ${result.status}`,
  )
})
