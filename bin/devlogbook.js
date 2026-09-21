#!/usr/bin/env node

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const packageRoot = path.resolve(__dirname, "..")

function parseArgs(argv) {
  const result = { _: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith("--")) {
      result._.push(token)
      continue
    }
    const [key, inlineValue] = token.slice(2).split("=", 2)
    if (inlineValue !== undefined) {
      result[key] = inlineValue
      continue
    }
    const next = argv[index + 1]
    if (!next || next.startsWith("--")) {
      result[key] = true
      continue
    }
    result[key] = next
    index += 1
  }
  return result
}

function usage() {
  console.log(`Usage:
  devlogbook init   --vault <path> [--project <name>]
  devlogbook sync   --vault <path> --project <name> --repo <path> [--since <date>] [--force]
  devlogbook watch  --vault <path> --project <name> --repo <path> [--interval <minutes>]
  devlogbook status --vault <path>
  devlogbook graph  --vault <path> [--limit <n>]
  devlogbook context --query <text> [--symbol <name>] [--project <name>] [--repo <path>] [--vault <path>]
  devlogbook opencode-install --repo <path>

Environment defaults:
  TRACEABILITY_VAULT, TRACEABILITY_PROJECT, TRACEABILITY_REPO_ROOT,
  TRACEABILITY_NODE, ENGRAM_BIN, TRACEABILITY_CODEGRAPH_BIN,
  OBSIDIAN_INTELLIGENCE_CLI, TRACEABILITY_AUTO_SYNC`)
}

function value(args, name, environmentName, required = false) {
  const resolved = args[name] || process.env[environmentName]
  if (required && !resolved) throw new Error(`Missing --${name} or ${environmentName}`)
  return resolved
}

function executable(name, environmentName) {
  return process.env[environmentName] || name
}

function run(command, args, options = {}) {
  // On Windows shell mode joins argv with spaces and loses quoting, which
  // splits multi-word values (e.g. natural language queries). Quote anything
  // containing whitespace or shell metacharacters before the join.
  const shellArgs = process.platform === "win32"
    ? args.map((value) => /[\s"&'<>|]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value)
    : args
  const result = spawnSync(command, shellArgs, {
    cwd: options.cwd,
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    shell: process.platform === "win32",
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status}`)
  }
  return options.capture ? { stdout: result.stdout || "", stderr: result.stderr || "" } : undefined
}

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true })
  return directory
}

function writeIfMissing(file, content) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, content, "utf8")
}

function copyFilesIfMissing(sourceDirectory, destinationDirectory) {
  ensureDirectory(destinationDirectory)
  let copied = false
  for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })) {
    const source = path.join(sourceDirectory, entry.name)
    const destination = path.join(destinationDirectory, entry.name)
    if (entry.isDirectory()) {
      copied = copyFilesIfMissing(source, destination) || copied
    } else if (!fs.existsSync(destination)) {
      fs.copyFileSync(source, destination)
      copied = true
    }
  }
  return copied
}

function init(args) {
  const vault = value(args, "vault", "TRACEABILITY_VAULT", true)
  const project = value(args, "project", "TRACEABILITY_PROJECT") || "knowledge-base"
  ensureDirectory(vault)
  writeIfMissing(path.join(vault, ".gitignore"), ".vault-intelligence.db\n*.db\n")
  writeIfMissing(path.join(vault, "Inicio.md"), `---\ntype: moc\ntags: [inicio, moc]\n---\n\n# Bóveda de conocimiento\n\n- [[MOC - ${project}]]\n`)
  writeIfMissing(path.join(vault, `MOC - ${project}.md`), `---\ntype: moc\ntags: [moc, ${project}]\n---\n\n# MOC — ${project}\n\n- [[Inicio]]\n\n## Cambios de trabajo\n\nLas notas se generan con el comando devlogbook sync.\n`)
  console.log(`Vault initialized: ${vault}`)
}

function exportMemories({ vault, project, since, force, watch = false, interval }) {
  const args = ["obsidian-export", "--vault", vault, "--project", project]
  if (since) args.push("--since", since)
  if (force) args.push("--force")
  if (watch) args.push("--watch", "--interval", `${interval}m`)
  run(executable("engram", "ENGRAM_BIN"), args)
}

function enrich({ vault, repo, maxCallers }) {
  const script = path.join(packageRoot, "scripts", "enrich-codegraph.ps1")
  const environment = {
    TRACEABILITY_VAULT: vault,
    TRACEABILITY_REPO_ROOT: repo,
    TRACEABILITY_CODEGRAPH_BIN: process.env.TRACEABILITY_CODEGRAPH_BIN || "codegraph",
  }
  if (process.platform === "win32") {
    run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-MaxCallers", String(maxCallers || 8)], { env: environment })
  } else {
    console.warn("CodeGraph PowerShell enrichment is not available on POSIX yet; export completed.")
  }
}

function reindex(vault) {
  const cli = process.env.OBSIDIAN_INTELLIGENCE_CLI || path.join(packageRoot, "node_modules", "obsidian-intelligence", "vault-intelligence.js")
  if (!cli) {
    console.warn("Reindex skipped. Set OBSIDIAN_INTELLIGENCE_CLI to vault-intelligence.js.")
    return
  }
  const node = executable("node", "TRACEABILITY_NODE")
  run(node, [cli, "index", "--vault", vault])
  run(node, [cli, "status", "--vault", vault])
}

function pruneExportNoise(vault) {
  // Sessions and topics are operational metadata, not logbook content: they
  // bloat the Obsidian graph. The exporter emits them under <vault>/engram, so
  // prune after every export to keep the vault clean.
  for (const noise of ["_sessions", "_topics"]) {
    fs.rmSync(path.join(vault, "engram", noise), { recursive: true, force: true })
  }
  // Exported observations still reference the pruned notes via [[session-*]]
  // and [[topic-*]] wikilinks. Neutralize those links into plain text so the
  // Obsidian graph doesn't count them as broken edges.
  const projectRoot = path.join(vault, "engram")
  const engramRoot = fs.existsSync(projectRoot) ? projectRoot : vault
  const knownNotes = new Set()
  if (fs.existsSync(engramRoot)) {
    visitTree(engramRoot, (noteFile) => {
      knownNotes.add(path.basename(noteFile, ".md"))
    })
    visitTree(engramRoot, (noteFile) => {
      neutralizeDanglingLinks(noteFile, knownNotes)
    })
  }
}

function visitTree(root, onNote) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const current = path.join(root, entry.name)
    if (entry.isDirectory()) visitTree(current, onNote)
    else if (entry.isFile() && entry.name.endsWith(".md")) onNote(current)
  }
}

function neutralizeDanglingLinks(noteFile, knownNotes) {
  const original = fs.readFileSync(noteFile, "utf8")
  const neutralized = original.replace(/\[\[([^\]]*)\]\]/g, (match, target) => {
    const base = target.split("|")[0].split("#")[0].trim()
    const baseName = base.split("/").pop()
    if (knownNotes && knownNotes.has(baseName)) return match
    return base
  })
  if (neutralized !== original) fs.writeFileSync(noteFile, neutralized, "utf8")
}

function loadFeatureMap(vault) {
  // Vault-level features.json wins over the kit default; both are optional.
  const candidates = [
    path.join(vault, "features.json"),
    path.join(packageRoot, "config", "features.json"),
  ]
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      try {
        return JSON.parse(fs.readFileSync(file, "utf8"))
      } catch (error) {
        console.warn(`Ignoring malformed features file ${file}: ${error.message}`)
      }
    }
  }
  return {}
}

function classifyFeature(noteFile, title, featureMap) {
  const frontmatter = fs.readFileSync(noteFile, "utf8").slice(0, 2048).toLowerCase()
  const haystack = `${title.toLowerCase()}\n${frontmatter}`
  for (const [feature, keywords] of Object.entries(featureMap)) {
    if (!Array.isArray(keywords)) continue
    for (const keyword of keywords) {
      if (haystack.includes(String(keyword).toLowerCase())) return feature
    }
  }
  return "misc"
}

function regroupByFeature(vault, project, featureMap) {
  const projectRoot = path.join(vault, "engram", project)
  if (!fs.existsSync(projectRoot)) return
  const grouped = {}
  for (const typeDir of fs.readdirSync(projectRoot, { withFileTypes: true })) {
    if (!typeDir.isDirectory()) continue
    const typePath = path.join(projectRoot, typeDir.name)
    for (const entry of fs.readdirSync(typePath, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue
      const source = path.join(typePath, entry.name)
      const feature = classifyFeature(source, entry.name.replace(/\.md$/, ""), featureMap)
      const featureDir = ensureDirectory(path.join(projectRoot, feature))
      const destination = path.join(featureDir, entry.name)
      if (destination !== source) fs.renameSync(source, destination)
      grouped[feature] = grouped[feature] || []
      grouped[feature].push(entry.name.replace(/\.md$/, ""))
    }
    // Empty the staging type folder once its notes moved next to their feature.
    if (fs.readdirSync(typePath).length === 0) fs.rmdirSync(typePath)
  }
  for (const [feature, notes] of Object.entries(grouped)) {
    const moc = path.join(projectRoot, feature, `MOC - ${feature}.md`)
    const list = notes.map((n) => `- [[${n}]]`).join("\n")
    fs.writeFileSync(moc, `---\ntype: moc\ntags: [moc, ${feature}]\n---\n\n# MOC — ${feature}\n\nNotas de esta funcionalidad, generadas por \`devlogbook sync\`.\n\n${list}\n`, "utf8")
    grouped[feature] = notes
  }
  return grouped
}

function sync(args) {
  const vault = value(args, "vault", "TRACEABILITY_VAULT", true)
  const project = value(args, "project", "TRACEABILITY_PROJECT", true)
  const repo = value(args, "repo", "TRACEABILITY_REPO_ROOT", true)
  exportMemories({ vault, project, since: args.since, force: Boolean(args.force) })
  pruneExportNoise(vault)
  const grouped = regroupByFeature(vault, project, loadFeatureMap(vault))
  if (grouped) console.log(`Grouped by feature: ${Object.keys(grouped).join(", ")}`)
  enrich({ vault, repo, maxCallers: args.limit || 8 })
  reindex(vault)
}

function watch(args) {
  const interval = Number(args.interval || 10)
  if (!Number.isFinite(interval) || interval < 1) throw new Error("--interval must be at least 1 minute")
  const syncArgs = { ...args }
  delete syncArgs._
  sync(syncArgs)
  console.log(`Watching ${value(args, "project", "TRACEABILITY_PROJECT", true)} every ${interval} minutes. Press Ctrl+C to stop.`)
  setInterval(() => {
    try { sync(syncArgs) } catch (error) { console.error(`[devlogbook] sync failed: ${error.message}`) }
  }, interval * 60 * 1000)
}

function status(args) {
  const vault = value(args, "vault", "TRACEABILITY_VAULT", true)
  reindex(vault)
}

function graph(args) {
  const vault = value(args, "vault", "TRACEABILITY_VAULT", true)
  const cli = process.env.OBSIDIAN_INTELLIGENCE_CLI
  if (!fs.existsSync(cli)) throw new Error("Obsidian Intelligence is not installed. Run npm install -g devlogbook or set OBSIDIAN_INTELLIGENCE_CLI.")
  run(executable("node", "TRACEABILITY_NODE"), [cli, "graph", "hubs", String(args.limit || 10)], { env: { VAULT_PATH: vault } })
}

function context(args) {
  const query = value(args, "query", "TRACEABILITY_QUERY", true)
  const vault = value(args, "vault", "TRACEABILITY_VAULT", true)
  const project = value(args, "project", "TRACEABILITY_PROJECT", true)
  const repo = value(args, "repo", "TRACEABILITY_REPO_ROOT")
  const limit = String(args.limit || 5)
  const cli = process.env.OBSIDIAN_INTELLIGENCE_CLI || path.join(packageRoot, "node_modules", "obsidian-intelligence", "vault-intelligence.js")
  if (fs.existsSync(cli)) {
    console.log("## Obsidian")
    // obsidian-intelligence <= 1.1.0 silently drops unknown CLI flags and lets
    // their values pollute the query (e.g. "--limit 5" appends "5" to the text).
    // Pass only the query until the provider parses these flags.
    const result = run(executable("node", "TRACEABILITY_NODE"), [cli, "search", query], { capture: true, env: { VAULT_PATH: vault } })
    console.log(result.stdout.trim())
  } else console.warn("Obsidian Intelligence unavailable; Engram and CodeGraph results will still be returned.")
  console.log("## Engram")
  const engram = run(executable("engram", "ENGRAM_BIN"), ["search", query, "--project", project, "--limit", limit], { capture: true })
  console.log(engram.stdout.trim())
  if (args.symbol && repo) {
    console.log("## CodeGraph callers")
    const callers = run(executable("codegraph", "TRACEABILITY_CODEGRAPH_BIN"), ["callers", args.symbol, "--path", repo, "--limit", limit, "--json"], { capture: true })
    console.log(callers.stdout.trim())
  }
}

function installOpenCode(args) {
  const repo = value(args, "repo", "TRACEABILITY_REPO_ROOT", true)
  const configPath = path.join(repo, "opencode.json")
  const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : { $schema: "https://opencode.ai/config.json" }
  const plugins = Array.isArray(config.plugin) ? config.plugin : []
  if (!plugins.includes("devlogbook")) plugins.push("devlogbook")
  config.plugin = plugins
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8")
  const opencodeRoot = path.join(repo, ".opencode")
  const skillSource = path.join(packageRoot, ".opencode", "skills")
  const commandSource = path.join(packageRoot, ".opencode", "commands")
  const skillInstalled = copyFilesIfMissing(skillSource, path.join(opencodeRoot, "skills"))
  const commandInstalled = copyFilesIfMissing(commandSource, path.join(opencodeRoot, "commands"))
  console.log(`Added devlogbook to ${configPath}. Skill copied: ${skillInstalled}. Command copied: ${commandInstalled}. Restart OpenCode.`)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const command = args._[0]
  if (!command || command === "help" || command === "--help") return usage()
  if (command === "init") return init(args)
  if (command === "sync") return sync(args)
  if (command === "watch") return watch(args)
  if (command === "status") return status(args)
  if (command === "graph") return graph(args)
  if (command === "context") return context(args)
  if (command === "opencode-install") return installOpenCode(args)
  throw new Error(`Unknown command: ${command}`)
}

try { main() } catch (error) { console.error(`[devlogbook] ${error.message}`); process.exitCode = 1 }
