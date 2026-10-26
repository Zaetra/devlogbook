const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const cli = path.resolve(__dirname, "..", "bin", "devlogbook.js")

test("graph resolves obsidian-intelligence without OBSIDIAN_INTELLIGENCE_CLI", () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "dlb-graph-"))
  // CLI resolution must come from the package's own node_modules via
  // resolveObsidianCli(), the same way status() and context() resolve it.
  const env = { ...process.env }
  delete env.OBSIDIAN_INTELLIGENCE_CLI

  const result = spawnSync(process.execPath, [cli, "graph", "--vault", vault, "--limit", "5"], {
    encoding: "utf8",
    env,
    timeout: 120000,
  })

  assert.equal(
    result.status,
    0,
    `expected exit 0, got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  )
  assert.doesNotMatch(result.stderr, /not installed/i)
  assert.match(result.stdout, /Top 5 hub notes/)
})
