// Turns what a person types into the link field into an address a Hatch can load.

export type ParsedAddress =
  | { ok: true; kind: 'url'; url: string }
  | { ok: true; kind: 'project'; project: string; path: string }
  | { ok: false; error: string };

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|[a-z0-9-]+\.localhost)(:\d+)?(\/|$)/i;
const BARE_DOMAIN = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(:\d+)?(\/.*)?$/i;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/;

export function parseAddress(input: string): ParsedAddress {
  const text = input.trim();
  if (!text) return { ok: false, error: 'Type a link.' };
  // A path pasted from Finder or a terminal opens as a file. Paths may hold spaces.
  if (text.startsWith('/') && !text.startsWith('//')) return { ok: true, kind: 'url', url: `file://${text.split('/').map(encodeURIComponent).join('/')}` };
  if (/\s/.test(text)) return { ok: false, error: 'A link has no spaces.' };

  if (/^hatch:/i.test(text)) {
    const rest = text.slice('hatch:'.length).replace(/^\/+/, '');
    const [project = '', ...segments] = rest.split('/');
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(project)) return { ok: false, error: 'A project address reads hatch:name or hatch:name/page.' };
    return { ok: true, kind: 'project', project: project.toLowerCase(), path: `/${segments.join('/')}` };
  }

  if (/^(https?|file):\/\//i.test(text) || /^about:blank$/i.test(text)) {
    return URL.canParse(text) ? { ok: true, kind: 'url', url: new URL(text).href } : { ok: false, error: 'Hatch cannot read that link.' };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !LOCAL_HOST.test(text)) return { ok: false, error: 'Hatch opens http, https, file and hatch links.' };

  if (LOCAL_HOST.test(text) || IPV4.test(text)) return finish(`http://${text}`);
  if (BARE_DOMAIN.test(text)) return finish(`https://${text}`);
  return { ok: false, error: 'Type a full link, a domain such as example.com, or hatch:project.' };
}

function finish(candidate: string): ParsedAddress {
  return URL.canParse(candidate) ? { ok: true, kind: 'url', url: new URL(candidate).href } : { ok: false, error: 'Hatch cannot read that link.' };
}

/** A short label for a tab or a header when the page has no title yet. */
export function labelForUrl(url: string): string {
  if (!URL.canParse(url)) return url;
  const u = new URL(url);
  if (u.protocol === 'file:') return decodeURIComponent(u.pathname.split('/').pop() || u.pathname);
  return u.host + (u.pathname === '/' ? '' : u.pathname);
}
