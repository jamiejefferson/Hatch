import { useEffect, useRef, useState } from 'react';
import type { ProjectState } from '@shared/types';
import { BackIcon, BinIcon, OpenIcon, PlayIcon, PlusIcon, ReloadIcon, StopIcon } from '../icons';
import { actions, useStore } from '../state/store';

const home = (path: string): string => path.replace(/^\/Users\/[^/]+/, '~');

const STATUS: Record<ProjectState['status'], string> = { running: 'Running', starting: 'Starting', stopped: 'Stopped', failed: 'Failed to start' };

export function ProjectsPanel() {
  const { projects, found } = useStore((s) => s.projects);
  const openName = useStore((s) => s.openProject);
  const [error, setError] = useState<string | null>(null);
  const open = projects.find((p) => p.name === openName);

  if (open) return <ProjectDetail key={open.name} project={open} />;

  const running = projects.filter((p) => p.status === 'running' || p.status === 'starting');
  const stopped = projects.filter((p) => p.status === 'stopped' || p.status === 'failed');
  const run = (work: Promise<string | null>): void => void work.then(setError);

  const row = (p: ProjectState) => {
    const live = p.status === 'running';
    const action = p.kind !== 'server' || live ? 'Open' : p.status === 'starting' ? 'Open' : 'Start';
    return (
      <li key={p.name}>
        <button className="project-main" onClick={() => actions.showProject(p.name)} title={`Show ${p.name}'s settings`}>
          <span className={`dot${live || p.status === 'starting' ? ' on' : ''}`} />
          <span className="project-text">
            <span className="name">{p.name}</span>
            <span className="mono url">
              hatch:{p.name} · {p.status === 'starting' ? 'starting' : p.status === 'failed' ? 'failed to start' : p.framework}
            </span>
          </span>
        </button>
        <button className="round small" aria-label={action} title={action === 'Start' ? `Start ${p.name} and open it in a Hatch` : `Open ${p.name} in a Hatch`} onClick={() => run(actions.openProjectInHatch(p.name))}>
          {action === 'Start' ? <PlayIcon size={14} /> : <OpenIcon size={14} />}
        </button>
      </li>
    );
  };

  return (
    <>
      <header className="panel-head">
        <h1 className="panel-title">Projects</h1>
        <button className="round primary" aria-label="Add a project" title="Add a project folder" onClick={() => run(actions.addProject())} data-testid="add-project">
          <PlusIcon />
        </button>
      </header>
      {projects.length === 0 && found.length === 0 && <p className="hint">Add a project folder and Hatch gives it a stable address, starts its dev server and keeps it on one port. A folder of plain HTML works too.</p>}
      {running.length > 0 && (
        <section>
          <h2>Running</h2>
          <ul className="project-list">{running.map(row)}</ul>
        </section>
      )}
      {stopped.length > 0 && (
        <section>
          <h2>Stopped</h2>
          <ul className="project-list">{stopped.map(row)}</ul>
        </section>
      )}
      {found.length > 0 && (
        <section>
          <h2>Found on this machine</h2>
          <ul className="project-list found">
            {found.map((f) => (
              <li key={f.folder}>
                <span className="project-main">
                  <span className="dot grey" />
                  <span className="project-text">
                    <span className="name">{home(f.folder)}</span>
                    <span className="mono url">localhost:{f.port} · unnamed</span>
                  </span>
                </span>
                <button
                  className="round small"
                  aria-label="Add"
                  title="Add this folder as a project"
                  onClick={() =>
                    void window.hatch.addProject(f.folder).then((r) => {
                      if (r.ok) actions.showProject(r.value.name);
                      else setError(r.error);
                    })
                  }
                >
                  <PlusIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function ProjectDetail({ project }: { project: ProjectState }) {
  const log = useStore((s) => s.projectLogs[project.name]) ?? [];
  const [error, setError] = useState<string | null>(null);
  const logBox = useRef<HTMLPreElement>(null);
  const server = project.kind === 'server';

  useEffect(() => {
    if (logBox.current) logBox.current.scrollTop = logBox.current.scrollHeight;
  }, [log.length]);

  const report = (r: { ok: boolean; error?: string }): void => setError(r.ok ? null : (r.error ?? null));
  const save = (change: Parameters<typeof window.hatch.updateProject>[1]): void =>
    void window.hatch.updateProject(project.name, change).then((r) => {
      report(r);
      if (r.ok && r.value.name !== project.name) actions.showProject(r.value.name);
    });

  return (
    <>
      <div className="project-head">
        <button className="round small quiet" aria-label="All projects" title="All projects" onClick={() => actions.showProject(null)}>
          <BackIcon size={14} />
        </button>
        <h1>{project.name}</h1>
        <span className="badge">{server ? STATUS[project.status] : project.kind === 'file' ? 'One file' : 'Static folder'}</span>
      </div>

      <Field label={project.kind === 'file' ? 'File' : 'Folder'} value={home(project.folder)} readOnly />
      {project.kind !== 'file' && <Field label={server ? 'Dev command' : 'Dev command · none found, so Hatch serves the files'} value={project.command} onCommit={(command) => save({ command })} testid="project-command" />}
      <div className="size-row">
        <Field label="Name in Hatch" value={`hatch:${project.name}`} onCommit={(name) => save({ name: name.replace(/^hatch:/, '') })} testid="project-name" />
        {server && <Field label="Stable port" value={String(project.port)} narrow onCommit={(port) => save({ port: Number(port) })} />}
      </div>
      {server && (
        <label className="check-row">
          <input type="checkbox" checked={project.direct} onChange={(e) => save({ direct: e.target.checked })} />
          <span>Open directly on the port. Use this for sign-in redirects tied to one address.</span>
        </label>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {server && (
        <section className="log-section">
          <h2>Server log</h2>
          <pre ref={logBox} className="mono server-log" tabIndex={0} aria-label="Server log" data-testid="server-log">
            {log.length ? log.join('\n') : project.startedByHatch || project.status !== 'running' ? 'The log starts when Hatch starts the server.' : 'Someone else started this server, so its log lives where it was started.'}
          </pre>
        </section>
      )}

      <div className="project-actions">
        {server &&
          (project.status === 'running' || project.status === 'starting' ? (
            project.startedByHatch && (
              <>
                <button className="round" aria-label="Stop" title="Stop the dev server" onClick={() => void window.hatch.stopProject(project.name).then(report)}>
                  <StopIcon />
                </button>
                <button
                  className="round"
                  aria-label="Restart"
                  title="Restart the dev server"
                  onClick={() =>
                    void window.hatch
                      .stopProject(project.name)
                      .then((r) => (r.ok ? window.hatch.startProject(project.name) : r))
                      .then(report)
                  }
                >
                  <ReloadIcon />
                </button>
              </>
            )
          ) : (
            <button className="round" aria-label="Start" title="Start the dev server" onClick={() => void window.hatch.startProject(project.name).then(report)} data-testid="project-start">
              <PlayIcon />
            </button>
          ))}
        <button className="round primary" aria-label="Open" title="Open in a new Hatch" onClick={() => void actions.openProjectInHatch(project.name).then(setError)}>
          <OpenIcon />
        </button>
        <span className="header-space" />
        <button
          className="round"
          aria-label="Remove"
          title="Remove this project from Hatch. Its files stay."
          onClick={() =>
            void window.hatch.removeProject(project.name).then((r) => {
              report(r);
              if (r.ok) actions.showProject(null);
            })
          }
        >
          <BinIcon />
        </button>
      </div>
    </>
  );
}

function Field({ label, value, onCommit, readOnly, narrow, testid }: { label: string; value: string; onCommit?(value: string): void; readOnly?: boolean; narrow?: boolean; testid?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className={`labelled${narrow ? ' narrow' : ''}`}>
      <span>{label}</span>
      <span className="field">
        <input
          className="mono"
          value={text}
          readOnly={readOnly}
          title={readOnly ? value : undefined}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text !== value && onCommit?.(text)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setText(value);
              e.stopPropagation();
            }
          }}
          data-testid={testid}
        />
      </span>
    </label>
  );
}
