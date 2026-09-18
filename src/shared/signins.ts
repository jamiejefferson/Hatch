// A saved sign-in belongs to a site: a host such as staging.acme.example, or a local project such as hatch:portfolio.
import { parseAddress } from './address';
import { projectOf } from './project-address';
import type { ProjectState } from './types';

/** What the interface and agents see. The password never leaves the main process. */
export interface SignIn {
  id: string;
  site: string;
  username: string;
  /** 'always' lets an agent fill this sign-in with no question. 'ask' makes Hatch ask the user each time. */
  allow: 'ask' | 'always';
}

export interface ConsentRequest {
  hatchId: string;
  site: string;
  username: string;
  agent: string;
}
export type ConsentAnswer = 'once' | 'always' | 'refuse';

type Addressed = Pick<ProjectState, 'name' | 'port' | 'direct' | 'kind'>;

/** The site a page belongs to. */
export function siteOf(url: string, projects: Addressed[], proxyPort: number | null): string | null {
  if (!URL.canParse(url) || !/^https?:$/.test(new URL(url).protocol)) return null;
  const project = projectOf(url, projects, proxyPort);
  return project ? `hatch:${project.name}` : new URL(url).host.toLowerCase();
}

/** Reads what a person typed in the Site field: a domain, a full link or a hatch: name. */
export function siteFromInput(input: string, projects: Addressed[], proxyPort: number | null): { site: string } | { error: string } {
  const parsed = parseAddress(input.trim());
  if (!parsed.ok) return { error: 'Type the site as a domain, such as staging.acme.example, or as a project, such as hatch:portfolio.' };
  if (parsed.kind === 'project') return projects.some((p) => p.name === parsed.project) ? { site: `hatch:${parsed.project}` } : { error: `No project is named ${parsed.project}.` };
  const site = siteOf(parsed.url, projects, proxyPort);
  return site ? { site } : { error: 'A sign-in belongs to a website. This link points at a file.' };
}
