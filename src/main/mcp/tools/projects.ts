import { z } from 'zod';
import { hatchAddress } from '@shared/project-address';
import { HatchError } from '../../cdp/session';
import { getProxyPort, logOf, projectsState, register, start, stop } from '../../servers/manager';
import { syncWatchers } from '../../servers/watch';
import { linksStore } from '../../store/stores';
import { newId } from '@shared/workspace';
import { parseAddress } from '@shared/address';
import { push } from '../../renderer-rpc';
import { intent, timeoutS, tool } from './types';

const describe = (p: { name: string; framework: string; status: string; livePort: number | null; port: number; folder: string; kind: string; startedByHatch: boolean }): string => {
  const state = p.kind !== 'server' ? 'static, always available' : p.status === 'running' ? `running on port ${p.livePort}${p.startedByHatch ? '' : ', started outside Hatch'}` : p.status;
  return `hatch:${p.name}  ${p.framework}  ${state}  ${p.folder}`;
};

export const projectTools = [
  tool({
    name: 'list_projects',
    description: 'Lists the local projects Hatch knows, each with its hatch: address and whether its dev server runs. Also lists dev servers found running on the machine that belong to no project yet.',
    shape: { intent },
    readOnly: true,
    async run() {
      const state = await projectsState(true);
      const lines = state.projects.map(describe);
      if (state.found.length) lines.push('', 'Found running, not registered:', ...state.found.map((f) => `localhost:${f.port}  ${f.folder}`));
      return lines.length ? lines.join('\n') : 'Hatch knows no projects yet. register_project adds a folder.';
    },
  }),
  tool({
    name: 'register_project',
    description: 'Registers a local folder, or one HTML file, as a project. Hatch reads the dev command from package.json, gives the project a stable port and the address hatch:<name>. A folder with no dev command is served as static files.',
    shape: {
      folder: z.string().describe('Absolute path of the project folder or HTML file.'),
      name: z.string().optional().describe('Name for the hatch: address. Defaults to the folder name.'),
      command: z.string().optional().describe('Dev command, when package.json has none or the wrong one.'),
      intent,
    },
    summary: (a) => `register_project ${a.folder.split('/').pop()}`,
    async run(a) {
      const p = await register({ folder: a.folder, name: a.name, command: a.command });
      await syncWatchers();
      return `Registered ${describe(p)}.${p.kind === 'server' ? ` Call start_server with name "${p.name}", then navigate to hatch:${p.name}.` : ` Navigate to hatch:${p.name}.`}`;
    },
  }),
  tool({
    name: 'start_server',
    description: 'Starts a project\'s dev server on its stable port and waits for it to answer. A server that already runs, whoever started it, counts as started.',
    shape: { name: z.string().describe('Project name from list_projects.'), timeout_s: timeoutS(45), intent },
    summary: (a) => `start_server ${a.name}`,
    async run(a, ctx) {
      let last = 0;
      const { state, ready } = await start(a.name.replace(/^hatch:/, ''), a.timeout_s * 1000, (elapsed) => {
        if (elapsed - last < 5000) return;
        last = elapsed;
        ctx.progress(`The server is starting, ${Math.round(elapsed / 1000)} seconds so far.`);
      });
      if (ready) return `${state.name} is running on port ${state.livePort}. Navigate to hatch:${state.name}.`;
      const tail = logOf(state.name).slice(-8).join('\n');
      if (state.status === 'failed') throw new HatchError(`${state.name} stopped before its port opened. The last lines of its log:\n${tail}`);
      return `${state.name} is still starting after ${a.timeout_s} seconds and its port has not opened yet. Hatch keeps it running. Call start_server again to keep waiting, or get_server_logs to read its output.\n${tail}`;
    },
  }),
  tool({
    name: 'stop_server',
    description: 'Stops a dev server that Hatch started.',
    shape: { name: z.string().describe('Project name from list_projects.'), intent },
    summary: (a) => `stop_server ${a.name}`,
    async run(a) {
      await stop(a.name.replace(/^hatch:/, ''));
      return `${a.name} has stopped.`;
    },
  }),
  tool({
    name: 'get_server_logs',
    description: 'Reads the recent output of a dev server that Hatch started.',
    shape: { name: z.string().describe('Project name from list_projects.'), lines: z.number().int().min(1).max(500).default(60), intent },
    readOnly: true,
    summary: (a) => `get_server_logs ${a.name}`,
    async run(a) {
      const log = logOf(a.name.replace(/^hatch:/, ''));
      return log.length ? log.slice(-a.lines).join('\n') : `Hatch holds no log for ${a.name}. It keeps logs only for servers it started.`;
    },
  }),
];

export const linkTools = [
  tool({
    name: 'list_links',
    description: 'Lists the user\'s saved links. navigate and open_hatch accept a saved link\'s title.',
    shape: { intent },
    readOnly: true,
    async run() {
      const [links, state] = await Promise.all([linksStore.read(), projectsState(false)]);
      if (links.length === 0) return 'The user has saved no links yet.';
      return links.map((l) => `${JSON.stringify(l.name)}  ${hatchAddress(l.url, state.projects, getProxyPort()) ?? l.url}`).join('\n');
    },
  }),
  tool({
    name: 'save_link',
    description: 'Saves a link under a title, so the user and any agent can open it by that title later.',
    shape: { title: z.string().min(1).max(80), url: z.string().describe('A full link or a domain.'), intent },
    summary: (a) => `save_link ${JSON.stringify(a.title)}`,
    async run(a) {
      const parsed = parseAddress(a.url);
      if (!parsed.ok) throw new HatchError(parsed.error);
      if (parsed.kind !== 'url') throw new HatchError('Save the full link. A hatch: address changes when its project is renamed.');
      const links = await linksStore.update((all) => (all.some((l) => l.url === parsed.url) ? all : [...all, { id: newId('link'), name: a.title.trim(), url: parsed.url }]));
      push('links:state', links);
      return `Saved ${JSON.stringify(a.title)}.`;
    },
  }),
];
