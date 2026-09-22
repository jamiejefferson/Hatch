import { useState } from 'react';
import { CheckIcon, CloseIcon, CopyIcon } from '../icons';
import { actions, useStore } from '../state/store';
import type { ConnectionInfo } from '../../../preload/api';

/** One connection line with a copy icon. */
export function CopyLine({ label, value, testid }: { label: string; value: string; testid?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-line">
      <span className="mono" title={value} data-testid={testid}>
        {value}
      </span>
      <button
        className="field-action"
        aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
        title={copied ? 'Copied' : 'Copy'}
        onClick={() => {
          void window.hatch.copyText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </div>
  );
}

/** The ready-made line for Claude Code: the command, at user scope, so every project and every later session has Hatch, and a session that starts while Hatch is closed keeps its tools. */
const claudeCodeLine = (command: string): string => `claude mcp add -s user hatch --env HATCH_AGENT=claude-code -- ${command}`;

/** What the user pastes to an agent. The agent sets itself up from it, which is faster than the user editing a config file. */
const agentNote = (connection: ConnectionInfo): string =>
  [
    'Connect to Hatch, the browser running on this Mac, as an MCP server named "hatch".',
    connection.url ? `Address (HTTP): ${connection.url} — put your own short name in place of your-agent-name.` : '',
    `Command (stdio), for apps that start one: ${connection.command}`,
    'Hatch writes its live address to ~/.hatch/server.json, so read that file if the port has changed.',
    'Register it once at user scope, so every project and every later session has it. In Claude Code that is: claude mcp add -s user hatch --env HATCH_AGENT=<your-name> -- <the command>. Once connected, call navigate with an address; Hatch briefs you in the reply.',
  ]
    .filter(Boolean)
    .join('\n');

/** One button covers most agents: it copies a note the agent acts on. The single lines sit behind a disclosure. */
export function ConnectSteps({ connection }: { connection: ConnectionInfo }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="connect-steps">
      <button
        className="button primary left"
        onClick={() => {
          void window.hatch.copyText(agentNote(connection));
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }}
        data-testid="connect-copy"
      >
        {copied ? <CheckIcon /> : <CopyIcon />} {copied ? 'Copied. Paste them to your agent.' : 'Copy the details for your agent'}
      </button>
      <p className="hint">Hatch needs no setup. Paste these details to your agent when you want it to use Hatch.</p>
      {connection.error && <p className="field-error">{connection.error}</p>}
      <details className="connect-manual">
        <summary>Set it up by hand</summary>
        <div className="connect-step">
          <h3>Claude Code, once for every project</h3>
          <CopyLine label="the Claude Code line" value={claudeCodeLine(connection.command)} testid="connect-claude" />
        </div>
        <div className="connect-step">
          <h3>Apps that start a command</h3>
          <CopyLine label="the command" value={connection.command} testid="connect-command" />
        </div>
        {connection.url && (
          <div className="connect-step">
            <h3>Apps that take an address</h3>
            <CopyLine label="the address" value={connection.url} testid="connect-url" />
          </div>
        )}
        <button className="text-button underline left" onClick={() => void window.hatch.openSetupExamples()}>
          Open the setup file for each app
        </button>
      </details>
    </div>
  );
}

/** A port problem in plain words, above the canvas. */
export function ConnectionBanner() {
  const connection = useStore((s) => s.connection);
  const closed = useStore((s) => s.bannerClosed);
  if (!connection || closed || (!connection.busyPort && !connection.error)) return null;
  const port = connection.url ? new URL(connection.url).port : '';
  return (
    <div className="banner" role="status" data-testid="connection-banner">
      <span>{connection.error ?? `Port ${connection.busyPort} was busy, so Hatch is listening on ${port}. Agents that start the command pick this up on their own.`}</span>
      {connection.url && (
        <button className="text-button underline" onClick={() => void window.hatch.copyText(connection.url!)}>
          Copy the new address
        </button>
      )}
      <button className="round small quiet" aria-label="Close this notice" title="Close" onClick={actions.closeBanner}>
        <CloseIcon size={12} />
      </button>
    </div>
  );
}
