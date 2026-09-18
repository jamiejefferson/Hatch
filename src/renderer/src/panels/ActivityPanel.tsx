import { useEffect, useRef } from 'react';
import { activeTab, useStore } from '../state/store';

const clock = (t: number): string => new Date(t).toTimeString().slice(0, 5);

export function ActivityPanel() {
  const entries = useStore((s) => s.activity);
  const working = useStore((s) => s.work.tabs[activeTab(s).id]);
  const port = useStore((s) => s.mcpPort);
  const waiting = useStore((s) => activeTab(s).hatches.map((h) => s.consents[h.id]).find(Boolean));
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // scrollIntoView would also scroll every ancestor, so the panel scrolls its own container.
    const body = end.current?.closest('.sidebar-body');
    if (body) body.scrollTop = body.scrollHeight;
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <section>
        <h1 className="panel-title">Activity</h1>
        <h2>No agent has connected yet</h2>
        <p className="hint">Add Hatch to an agent as an MCP server at this address. Each agent action then lists here with its stated intent.</p>
        {port && (
          <p className="mono address" data-testid="mcp-address">
            http://127.0.0.1:{port}/mcp?agent=your-agent-name
          </p>
        )}
      </section>
    );
  }

  return (
    <>
      <header className="panel-head">
        <h1 className="panel-title">Activity</h1>
      </header>
      {waiting && (
        <div className="working-now" role="status" data-testid="waiting-for-you">
          <h2>Waiting for you</h2>
          <p>
            The agent asked to sign in to {waiting.site}. It waits until you answer on the page.
          </p>
        </div>
      )}
      {working && !waiting && (
        <div className="working-now" role="status">
          <h2>Working now</h2>
          <p>{working.intent || `The agent “${working.agent}” is working in this tab.`}</p>
        </div>
      )}
      <section>
        <h2>This session</h2>
        <ol className="activity">
          {entries.map((e) => (
            <li key={e.id} className={e.status} data-testid="activity-entry">
              <time className="mono">{clock(e.time)}</time>
              <div>
                <p className="mono call">
                  {e.summary}
                  {e.status === 'running' && <span className="state"> · running</span>}
                  {e.status === 'failed' && <span className="state"> · failed</span>}
                </p>
                {e.intent && <p className="intent">{e.intent}</p>}
                {e.error && <p className="error">{e.error}</p>}
              </div>
            </li>
          ))}
        </ol>
        <div ref={end} />
      </section>
      <section className="panel-end">
        <button className="text-button left underline" onClick={() => void window.hatch.openLog()}>
          Show the session log file
        </button>
      </section>
    </>
  );
}
