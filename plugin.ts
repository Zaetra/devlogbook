import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { type Plugin, tool } from "@opencode-ai/plugin"

const execFileAsync = promisify(execFile)

const TraceabilityPlugin: Plugin = async ({ $, client }) => {
  const syncEnabled = process.env.TRACEABILITY_AUTO_SYNC === "true"
  const gateEnabled = process.env.TRACEABILITY_REQUIRE_CONTEXT === "true" && process.env.TRACEABILITY_SKIP_GATE !== "true"
  const cli = process.env.TRACEABILITY_CLI || "devlogbook"
  let running = false
  let lastSyncAt = 0
  let contextConsulted = false

  const sync = async () => {
    if (!syncEnabled || running) return
    if (Date.now() - lastSyncAt < 60_000) return
    running = true
    try {
      await $`${cli} sync`
      lastSyncAt = Date.now()
      await client.app.log({ body: { service: "traceability", level: "info", message: "Traceability sync completed" } })
    } catch (error) {
      await client.app.log({ body: { service: "traceability", level: "warn", message: `Traceability sync failed: ${String(error)}` } })
    } finally {
      running = false
    }
  }

  return {
    tool: {
      traceability_context: tool({
        description: "Investigate bounded project context across Engram, Obsidian, and CodeGraph.",
        args: {
          query: tool.schema.string().min(1).max(200),
          symbol: tool.schema.string().max(160).optional(),
          limit: tool.schema.number().int().min(1).max(8).optional(),
        },
        async execute(args) {
          contextConsulted = true
          await client.app.log({ body: { service: "traceability", level: "info", message: `traceability_context consulted: ${args.query.slice(0, 120)}` } })
          const command = ["context", "--query", args.query]
          if (args.symbol) command.push("--symbol", args.symbol)
          if (args.limit) command.push("--limit", String(args.limit))
          const result = await execFileAsync(cli, command, {
            env: process.env,
            shell: process.platform === "win32",
            maxBuffer: 256 * 1024,
          })
          return result.stdout || result.stderr
        },
      }),
    },
    event: async ({ event }) => {
      if (event.type === "session.idle") await sync()
    },
    "tool.execute.after": async (input: { tool?: string; args?: string; call?: { args?: string }; result?: string }) => {
      const command = `${input.args || ""}${input.call?.args || ""}`.toLowerCase()
      const isGitCommit = input.tool?.match(/^(bash|shell|terminal)$/i) && /git(\s+\S+)*\s+commit\b/.test(command)
      if (isGitCommit) await sync()
    },
    "tool.execute.before": async (input: { tool?: string }) => {
      // Hard gate: deny code edits until the agent consulted traceability
      // context at least once this session (opt-in via TRACEABILITY_REQUIRE_CONTEXT).
      if (!gateEnabled) return
      if (!input.tool || !/^(edit|write|multiedit|patch)$/i.test(input.tool)) return
      if (contextConsulted) return
      throw new Error(
        "TRACEABILITY gate: no traceability_context call in this session yet. " +
        "Investigate the target functionality first with the traceability_context tool " +
        "(it returns the feature hub, Engram history, and CodeGraph consumers), then retry the edit. " +
        "Set TRACEABILITY_SKIP_GATE=true to bypass."
      )
    },
  }
}

export default TraceabilityPlugin
