# Hatch plugin

Hatch is a macOS browser that an agent drives. Its live pages sit as frames on a canvas the user watches, so the user sees every page the agent opens and every click it makes.

This plugin registers Hatch's MCP server through the command the Hatch app ships, `/Applications/Hatch.app/Contents/Resources/hatch-mcp`. The command finds the running Hatch's port by itself and answers while Hatch is closed, so a session that starts first keeps its tools and learns that Hatch needs opening.

**Before you install:** get Hatch from https://github.com/jamiejefferson/Hatch/releases and open it once.

## Claude Code

```
claude plugin marketplace add jamiejefferson/Hatch
claude plugin install hatch@hatch
```

Every project and every later session then has Hatch. Say "open the pricing page in Hatch" and the agent does it.

## Codex CLI and Cursor

The plugin carries `mcp.codex.json` and `mcp.cursor.json`, with the same command and the agent name `codex` or `cursor`.

## What the agent gets

Hatch briefs the agent itself: the server's instructions say how to work, and the first reply repeats them for apps that hide instructions from the model. `get_guide` with the topic `tools` lists every tool with its arguments, and https://hatch-guide.vercel.app/agents holds the same on the web.
