const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const cli = path.resolve(__dirname, "..", "bin", "devlogbook.js")

// `context` shells out to `engram search --project demo`, which exits 1 when
// that project is unknown in the host Engram database. Point ENGRAM_BIN at a
// stub so this test asserts only the CLI's own feature-hub output.
function stubEngram(vault) {
  const stub = path.join(vault, "engram-stub.cmd")
  fs.writeFileSync(stub, "@echo off\r\nexit /b 0\r\n", "ascii")
  return `"${stub}"`
}

function createVault(withFeatures) {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "dlb-ctx-"))
  const featureDir = path.join(vault, "engram", "demo", "import-tickets")
  fs.mkdirSync(featureDir, { recursive: true })
  fs.writeFileSync(
    path.join(featureDir, "MOC - import-tickets.md"),
    "---\ntype: moc\ntags: [moc, import-tickets]\n---\n\n# MOC - import-tickets\n\n- [[import-tickets-log]]\n",
    "utf8"
  )
  fs.writeFileSync(
    path.join(featureDir, "import-tickets-log.md"),
    "---\ntype: log\n---\n\n# Import tickets log\n",
    "utf8"
  )
  if (withFeatures) {
    fs.writeFileSync(
      path.join(vault, "features.json"),
      JSON.stringify(
        {
          "import-tickets": ["ticket", "import"],
          relations: { "import-tickets": ["daily-schedule"] },
          exclude: { types: ["session_summary"] },
        },
        null,
        2
      ),
      "utf8"
    )
  }
  return vault
}

function runContext(vault, query) {
  const env = {
    ...process.env,
    TRACEABILITY_VAULT: vault,
    TRACEABILITY_PROJECT: "demo",
    ENGRAM_BIN: stubEngram(vault),
  }
  return spawnSync(process.execPath, [cli, "context", "--query", query], {
    encoding: "utf8",
    env,
    timeout: 120000,
  })
}

test("context prints the feature hub when the query contains a feature keyword", () => {
  const vault = createVault(true)
  const result = runContext(vault, "import tickets")
  assert.equal(result.status, 0, `stdout: ${result.stdout}\nstderr: ${result.stderr}`)
  assert.ok(
    result.stdout.includes("## Feature context (import-tickets)"),
    `expected feature hub header in output:\n${result.stdout}`
  )
  assert.ok(
    result.stdout.includes("Hub: [[MOC - import-tickets]] (1 of 1 notes shown)"),
    `expected hub line in output:\n${result.stdout}`
  )
  assert.ok(
    result.stdout.includes("- [[import-tickets-log]]"),
    `expected note bullet in output:\n${result.stdout}`
  )
})

test("context explains why it falls back when no feature keyword matches", () => {
  // The feature map is configured, but the query matches no keyword.
  const configured = createVault(true)
  const fallback = runContext(configured, "deploy pipeline")
  assert.equal(fallback.status, 0, `stdout: ${fallback.stdout}\nstderr: ${fallback.stderr}`)
  assert.ok(
    fallback.stdout.includes(
      "No feature keyword matched the query; falling back to full-text sources."
    ),
    `expected no-keyword fallback reason in output:\n${fallback.stdout}`
  )

  // No features.json anywhere, so the feature map itself is empty.
  const empty = createVault(false)
  const emptyResult = runContext(empty, "deploy pipeline")
  assert.equal(emptyResult.status, 0, `stdout: ${emptyResult.stdout}\nstderr: ${emptyResult.stderr}`)
  assert.ok(
    emptyResult.stdout.includes("Feature map is empty; falling back to full-text sources."),
    `expected empty-map fallback reason in output:\n${emptyResult.stdout}`
  )
})
