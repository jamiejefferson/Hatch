import { useEffect, useState } from 'react';
import { useStore } from '../state/store';

/**
 * The agent view of one Hatch. It draws over the page, which stays live underneath,
 * and it shows the exact string an agent's snapshot returns.
 */
export function AgentView({ hatchId }: { hatchId: string }) {
  const version = useStore((s) => s.pageVersion[hatchId] ?? 0);
  const dialogOpen = useStore((s) => hatchId in s.dialogs);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void window.hatch.readAgentView(hatchId).then((outline) => current && setText(outline));
    return () => {
      current = false;
    };
  }, [hatchId, version, dialogOpen]);

  return (
    <div className="agent-view" data-testid={`agent-view-${hatchId}`}>
      <p className="agent-view-banner">
        <strong>Agent view</strong>
        <span>This outline is exactly what the agent receives. The page stays live underneath.</span>
      </p>
      <pre className="mono" tabIndex={0} aria-label="Agent view outline">
        {text ?? 'Reading the page…'}
      </pre>
    </div>
  );
}
