// hatch:<name>/<path> is how people and agents write a project's address. A Hatch loads the link behind it.
import type { ProjectState } from './types';

export const PROXY_PORT = 4282;

export const projectHost = (name: string): string => `${name}.localhost`;

export function projectUrl(project: { name: string; port: number; direct: boolean; kind: string }, proxyPort: number, path = '/'): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (project.direct && project.kind === 'server') return `http://localhost:${project.port}${clean}`;
  return `http://${projectHost(project.name)}:${proxyPort}${clean}`;
}

type Addressed = Pick<ProjectState, 'name' | 'port' | 'direct' | 'kind'>;

/** The project a link belongs to: its named address, or its own port when the project opens directly. */
export function projectOf<P extends Addressed>(url: string, projects: P[], proxyPort: number | null): P | null {
  if (!URL.canParse(url)) return null;
  const u = new URL(url);
  if (u.protocol !== 'http:') return null;
  if (u.hostname.endsWith('.localhost') && Number(u.port || 80) === proxyPort) return projects.find((p) => projectHost(p.name) === u.hostname) ?? null;
  if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return projects.find((p) => p.direct && p.kind === 'server' && String(p.port) === u.port) ?? null;
  return null;
}

/** The hatch: form of a link, or null when the link belongs to no project. */
export function hatchAddress(url: string, projects: Addressed[], proxyPort: number | null): string | null {
  const project = projectOf(url, projects, proxyPort);
  if (!project) return null;
  const u = new URL(url);
  return `hatch:${project.name}${u.pathname === '/' ? '' : u.pathname}${u.search}${u.hash}`;
}

export const NAME_RULE = /^[a-z0-9][a-z0-9-]{0,40}$/;

/** A folder name as a project name: lower case, hyphens for everything else. */
export function nameFromFolder(folder: string): string {
  const base = folder.split('/').filter(Boolean).pop() ?? 'project';
  const name = base.replace(/\.html?$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return name || 'project';
}
