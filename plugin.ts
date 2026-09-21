import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { type Plugin, tool } from "@opencode-ai/plugin"

const execFileAsync = promisify(execFile)

const TraceabilityPlugin: Plugin = async ({ $, client }) => {
  const syncEnabled = process.env.TRACEABILITY_AUTO_SYNC === "true"
  const cli = process.env.TRACEABILITY_CLI || "devlogbook"
  let running = false
  let lastSyncAt = 0

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
  }
}

export default TraceabilityPlugin
