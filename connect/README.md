# Give an agent Hatch's details

Hatch holds no AI. An agent drives it through MCP, the Model Context Protocol. Hatch listens on this Mac only, so nothing here opens a port to the network.

Hatch needs no setup of its own. In Settings, "Copy the details for your agent" copies a note that an agent can act on by itself, and the user pastes it whenever they want the agent to use Hatch. "Set it up by hand" shows each connection line with a Copy button, and it shows the real port if 42824 was busy. The running Hatch also writes its address to `~/.hatch/server.json`, so an agent reads the real port from that file.

## The two connections

**By address**, for agents that take a URL:

```
http://127.0.0.1:42824/mcp?agent=your-agent-name
```

Replace `your-agent-name` with a short name, such as `claude-code`. Hatch shows the name in its Activity panel. Each name gets its own tab, so two agents never share pages.

**By command**, for agents that start a program and talk to it over stdio:

```
/Applications/Hatch.app/Contents/Resources/hatch-mcp
```

The command finds Hatch's port by itself. It also answers while Hatch is closed, so an agent session that starts first keeps its tools and learns that Hatch needs opening. Set the `HATCH_AGENT` environment variable to name the agent. From a source checkout the command is `node <checkout>/out/main/hatch-mcp.js` after `pnpm build`.

## Claude Code

```
claude mcp add --transport http hatch "http://127.0.0.1:42824/mcp?agent=claude-code"
```

Or with the command:

```
claude mcp add hatch --env HATCH_AGENT=claude-code -- /Applications/Hatch.app/Contents/Resources/hatch-mcp
```

## Claude Desktop

Add this to `~/Library/Application Support/Claude/claude_desktop_config.json`, then restart Claude Desktop:

```json
{
  "mcpServers": {
    "hatch": {
      "command": "/Applications/Hatch.app/Contents/Resources/hatch-mcp",
      "env": { "HATCH_AGENT": "claude-desktop" }
    }
  }
}
```

## Cursor

Add this to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "hatch": { "url": "http://127.0.0.1:42824/mcp?agent=cursor" }
  }
}
```

## VS Code

Add this to `.vscode/mcp.json` in a workspace:

```json
{
  "servers": {
    "hatch": { "type": "http", "url": "http://127.0.0.1:42824/mcp?agent=vscode" }
  }
}
```

## Codex CLI

Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.hatch]
command = "/Applications/Hatch.app/Contents/Resources/hatch-mcp"
env = { HATCH_AGENT = "codex" }
```

## Any other agent

An agent that takes a URL uses the address. An agent that takes a command uses the command. Both reach the same tools.

## Check that it works

Ask the agent to call the `status` tool. Hatch answers with the agent's tab and its pages, and the call shows in the Activity panel. Then ask it to call `get_guide`, which explains every tool in one page.

## When something fails

- **"Hatch is not running."** The command answered because Hatch is closed. Open Hatch and call the tool again. No restart of the agent is needed.
- **The agent cannot reach the address.** Open Hatch's Settings panel and copy the address from there. Hatch moves to the next free port, up to 42834, when another program holds 42824.
- **403 from the address.** Hatch refuses any request that carries an `Origin` header, which is how it keeps web pages from calling it. Connect from the agent app and never from a browser page.
- **A tool waits and then says it is still waiting.** Slow tools return when their `timeout_s` ends and the work carries on. The agent calls again, or calls `wait_for`.
