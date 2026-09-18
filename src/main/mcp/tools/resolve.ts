import { stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseAddress } from '@shared/address';
import { HatchError } from '../../cdp/session';
import { projectUrl } from '@shared/project-address';
import { getProxyPort, projectState } from '../../servers/manager';
import { linksStore } from '../../store/stores';

/** Turns what an agent passes to navigate or open_hatch into a link: a URL, a domain, a file or folder path, or a saved link's title. */
export async function resolveTarget(to: string): Promise<string> {
  const text = to.trim();
  const expanded = text.startsWith('~/') ? join(process.env.HOME ?? '', text.slice(2)) : text;
  if (isAbsolute(expanded)) {
    const info = await stat(expanded).catch(() => null);
    if (!info) throw new HatchError(`Nothing exists at ${expanded}.`);
    if (info.isFile()) return pathToFileURL(expanded).href;
    const index = join(expanded, 'index.html');
    if (await stat(index).catch(() => null)) return pathToFileURL(index).href;
    throw new HatchError(`The folder ${expanded} holds no index.html. Pass the path of an HTML file.`);
  }

  const links = await linksStore.read();
  const saved = links.find((l) => l.name.trim().toLowerCase() === text.toLowerCase());
  if (saved) return saved.url;

  const parsed = parseAddress(text);
  if (!parsed.ok) throw new HatchError(`${parsed.error} navigate takes a full link, a domain, a hatch: project address, an absolute file path, or the title of a saved link (see list_links).`);
  if (parsed.kind === 'project') {
    const project = await projectState(parsed.project);
    if (!project) throw new HatchError(`No project is named ${parsed.project}. list_projects shows the registered ones.`);
    return projectUrl(project, getProxyPort(), parsed.path);
  }
  return parsed.url;
}
