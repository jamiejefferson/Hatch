// The two ways an agent connects, as the first-run screen and Settings show them.
import { join } from 'node:path';
import { app } from 'electron';
import { DEFAULT_PORT, mcpError, mcpPort } from './mcp/http';

export interface ConnectionInfo {
  /** For agents that connect by address. Null when Hatch could not open any port. */
  url: string | null;
  /** For agents that start a command. */
  command: string;
  /** The setup examples file. */
  examples: string;
  /** The port Hatch wanted, when another program held it. */
  busyPort: number | null;
  error: string | null;
  version: string;
}

export function connectionInfo(): ConnectionInfo {
  const port = mcpPort();
  const root = app.isPackaged ? process.resourcesPath : app.getAppPath();
  return {
    url: port ? `http://127.0.0.1:${port}/mcp?agent=your-agent-name` : null,
    // The packaged app carries a launcher script. A checkout runs the built shim with Node.
    command: app.isPackaged ? join(root, 'hatch-mcp') : `node ${join(root, 'out', 'main', 'hatch-mcp.js')}`,
    examples: join(root, 'connect', 'README.md'),
    busyPort: port && port !== DEFAULT_PORT && process.env.HATCH_MCP_PORT === undefined ? DEFAULT_PORT : null,
    error: mcpError(),
    version: app.getVersion(),
  };
}
