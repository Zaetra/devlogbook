import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { type Plugin, tool } from "@opencode-ai/plugin"

const execFileAsync = promisify(execFile)
type CommandResult = { stdout: string; stderr: string }

async function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<CommandResult> {
  return execFileAsync(command, args, {
    env: { ...process.env, ...env },
    windowsHide: true,
    maxBuffer: 256 * 1024,
  }) as Promise<CommandResult>
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

async function optional(label: string, action: () => Promise<CommandResult>): Promise<string> {
  try {
    const result = await action()
    return `### ${label}\n${result.stdout.trim() || result.stderr.trim() || "(sin resultados)"}`
  } catch (error) {
    return `### ${label}\nUnavailable: ${String(error)}`
  }
}

const TraceabilityPlugin: Plugin = async ({ $, client }) => {
  const autoSync = process.env.TRACEABILITY_AUTO_SYNC === "true"
  const gateEnabled = process.env.TRACEABILITY_REQUIRE_CONTEXT === "true" && process.env.TRACEABILITY_SKIP_GATE !== "true"
  let contextConsulted = false
  const kitRoot = process.env.TRACEABILITY_KIT_ROOT
  let syncInFlight: Promise<unknown> | undefined
  let lastSyncAt = 0

  const sync = async () => {
    if (!autoSync || !kitRoot || syncInFlight) return
    if (Date.now() - lastSyncAt < 60_000) return
    syncInFlight = (async () => {
      try {
        if (process.platform === "win32") {
          await $`powershell -NoProfile -ExecutionPolicy Bypass -File ${kitRoot}/scripts/traceability-sync.ps1 -Enrich`
        } else {
          await $`${kitRoot}/scripts/traceability-sync.sh`
        }
        lastSyncAt = Date.now()
        await client.app.log({ body: { service: "traceability", level: "info", message: "Automatic traceability sync completed" } })
      } catch (error) {
        await client.app.log({ body: { service: "traceability", level: "warn", message: `Automatic sync failed: ${String(error)}` } })
      } finally {
        syncInFlight = undefined
      }
    })()
    await syncInFlight
  }

  const contextTool = tool({
    description: "PREFERRED first step before investigating or changing any project functionality: returns the feature hub (MOC, recent notes), Engram history, and CodeGraph consumers in one bounded call. Call this INSTEAD of raw Obsidian/Engram searches when a functionality, module, or behavior is involved.",
    args: {
      query: tool.schema.string().min(1).max(200).describe("Natural-language question or behavior to investigate"),
      symbol: tool.schema.string().max(160).optional().describe("Optional exact CodeGraph symbol"),
      limit: tool.schema.number().int().min(1).max(8).optional().describe("Maximum results per source"),
    },
    async execute(args) {
      await client.app.log({ body: { service: "traceability", level: "info", message: `traceability_context consulted: ${args.query.slice(0, 120)}` } })
      // Validate all envs up front with an actionable message, and only unlock
      // the edit gate after a call that actually produced context.
      const missing = ["TRACEABILITY_VAULT", "TRACEABILITY_PROJECT", "TRACEABILITY_REPO_ROOT"].filter((name) => !process.env[name])
      if (missing.length > 0) {
        throw new Error(
          `traceability_context cannot run: missing environment variables ${missing.join(", ")}. ` +
          "Set them (e.g. TRACEABILITY_VAULT=<vault path>, TRACEABILITY_PROJECT=<engram project>, TRACEABILITY_REPO_ROOT=<repo>) " +
          "in the terminal BEFORE launching OpenCode, then restart OpenCode and retry."
        )
      }
      const vault = required("TRACEABILITY_VAULT")
      const project = required("TRACEABILITY_PROJECT")
      const repo = required("TRACEABILITY_REPO_ROOT")
      const node = process.env.TRACEABILITY_NODE || "node"
      const cli = process.env.OBSIDIAN_INTELLIGENCE_CLI || "vault-intelligence.js"
      const engram = process.env.ENGRAM_BIN || "engram"
      const codegraph = process.env.TRACEABILITY_CODEGRAPH_BIN || "codegraph"
      const limit = String(args.limit || 5)

      const parts = await Promise.all([
        optional("Obsidian", () => run(node, [cli, "search", args.query], { VAULT_PATH: vault })),
        optional("Engram", () => run(engram, ["search", args.query, "--project", project, "--limit", limit], {})),
        args.symbol
          ? optional("CodeGraph callers", () => run(codegraph, ["callers", args.symbol!, "--path", repo, "--limit", limit, "--json"], {}))
          : Promise.resolve("### CodeGraph callers\nNo symbol supplied; caller lookup skipped."),
      ])

      const result = [
        "# Traceability context",
        `Query: ${args.query}`,
        args.symbol ? `Symbol: ${args.symbol}` : "",
        ...parts,
        "Use this as evidence. Confirm current source with CodeGraph before editing.",
      ].filter(Boolean).join("\n\n")
      contextConsulted = true
      return result
    },
  })

  return {
    tool: { traceability_context: contextTool },
    event: async ({ event }: { event: { type?: string } }) => {
      if (event.type === "session.idle") await sync()
    },
    "tool.execute.before": async (input: { tool?: string }) => {
      // Hard gate: deny code edits until the agent consulted traceability
      // context at least once this session (opt-in via TRACEABILITY_REQUIRE_CONTEXT).
      if (!gateEnabled) return
      if (!input.tool || !/^(edit|write|multiedit|patch)$/i.test(input.tool)) return
      if (contextConsulted) return
      throw new Error(
        "TRACEABILITY gate: no traceability_context call in this session yet. " +
        "Investigate the target functionality first with the traceability_context tool, then retry the edit. " +
        "Set TRACEABILITY_SKIP_GATE=true to bypass."
      )
    },
    "tool.execute.after": async (input: { tool?: string; args?: string; call?: { args?: string } }) => {
      const command = `${input.args || ""}${input.call?.args || ""}`.toLowerCase()
      const isGitCommit = input.tool?.match(/^(bash|shell|terminal)$/i) && /git(\s+\S+)*\s+commit\b/.test(command)
      if (isGitCommit) await sync()
    },
  }
}

export { TraceabilityPlugin }
export default TraceabilityPlugin
