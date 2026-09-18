// Live webview elements by Hatch id, for the commands that act on a page.
const elements = new Map<string, WebviewElement>();
const ready = new Set<string>();

export const registerWebview = (hatchId: string, element: WebviewElement | null): void => {
  if (element) elements.set(hatchId, element);
  else {
    elements.delete(hatchId);
    ready.delete(hatchId);
  }
};
export const markReady = (hatchId: string): void => void ready.add(hatchId);

/** Webview methods throw until the guest attaches, so every command waits for dom-ready. */
function withPage(hatchId: string, run: (page: WebviewElement) => void): void {
  const page = elements.get(hatchId);
  if (page && ready.has(hatchId)) run(page);
}

/** The live element, once its page accepts messages. */
export const readyPage = (hatchId: string): WebviewElement | null => (ready.has(hatchId) ? (elements.get(hatchId) ?? null) : null);
export const pageElement = (hatchId: string): WebviewElement | null => elements.get(hatchId) ?? null;

export const pages = {
  navigate: (hatchId: string, url: string): void => {
    const page = elements.get(hatchId);
    if (!page) return;
    if (ready.has(hatchId)) void page.loadURL(url).catch(() => {});
    else page.src = url;
  },
  // The webview's own reload is webContents.reload(). Hatch never sends CDP Page.reload, which reloads this window.
  reload: (hatchId: string): void => withPage(hatchId, (p) => p.reload()),
  stop: (hatchId: string): void => withPage(hatchId, (p) => p.stop()),
  back: (hatchId: string): void => withPage(hatchId, (p) => p.canGoBack() && p.goBack()),
  forward: (hatchId: string): void => withPage(hatchId, (p) => p.canGoForward() && p.goForward()),
  inspect: (hatchId: string): void => withPage(hatchId, (p) => p.openDevTools()),
};
