// The workspace model shared by the main process and the renderer.

export type TemplateId = 'fit' | 'desktop' | 'laptop' | 'tablet' | 'tablet-landscape' | 'mobile' | 'custom';

export interface Hatch {
  id: string;
  /** The address the Hatch shows now. */
  url: string;
  title: string;
  /** Position on the canvas in canvas pixels. */
  x: number;
  y: number;
  /** Page viewport in CSS pixels. Fit to view keeps these as the size to restore. */
  width: number;
  height: number;
  template: TemplateId;
  /** What the Hatch displays. The agent always reads the agent view, whatever this says. */
  view: HatchView;
}

export type HatchView = 'page' | 'agent';

export interface Tab {
  id: string;
  /** The name the user gave this canvas. Without one, the tab takes its project's name. */
  name?: string;
  hatches: Hatch[];
  selectedHatchId: string | null;
  pan: { x: number; y: number };
  zoom: number;
}

export interface Workspace {
  version: 1;
  tabs: Tab[];
  activeTabId: string;
  sidebarOpen: boolean;
}

export interface SavedLink {
  id: string;
  name: string;
  url: string;
}

export interface Settings {
  /** The page a new Hatch opens. Empty means Hatch asks. */
  newHatchPage: string;
  /** When an agent asks to switch a Hatch's view, Hatch asks the user first. */
  askBeforeViewSwitch: boolean;
  /** Agents may run their own script in pages. */
  allowEvaluate: boolean;
  /** Comment pins show on every Hatch. */
  showComments: boolean;
  /** The user has finished or skipped the guide, so it stays away until Help opens it again. */
  guideSeen: boolean;
  /** The folder that holds links.json. Empty means Hatch's own data folder. */
  linksFolder: string;
  /** The folder that holds one folder of comment files per site. Empty means Hatch's own data folder. Project comments stay inside their project. */
  commentsFolder: string;
}

export const DEFAULT_SETTINGS: Settings = { newHatchPage: '', askBeforeViewSwitch: true, allowEvaluate: false, showComments: true, guideSeen: false, linksFolder: '', commentsFolder: '' };

export interface ActivityEntry {
  id: string;
  time: number;
  agent: string;
  tool: string;
  /** The call in a few words, such as `fill e9`. */
  summary: string;
  intent: string;
  status: 'running' | 'done' | 'failed';
  ms?: number;
  error?: string;
  note?: string;
  tabId?: string | null;
  hatchId?: string | null;
}

/** Which tabs and Hatches an agent is working in right now. */
export interface AgentWorkState {
  tabs: Record<string, { agent: string; intent: string }>;
  hatches: Record<string, true>;
}

/** What the main process reads from the interface before it routes an agent's call. */
export interface InterfaceState {
  activeTabId: string;
  tabs: { id: string; selectedHatchId: string | null; hatches: Pick<Hatch, 'id' | 'url' | 'title' | 'width' | 'height' | 'template' | 'view'>[] }[];
}

export interface ViewRequest {
  hatchId: string;
  view: HatchView;
  reason: string;
  agent: string;
}

export interface DialogState {
  hatchId: string;
  kind: 'alert' | 'confirm' | 'prompt' | 'beforeunload';
  message: string;
  defaultText: string;
}

// ---- local projects ----

export type ProjectKind = 'server' | 'folder' | 'file';
export type ProjectStatus = 'stopped' | 'starting' | 'running' | 'failed';

/** What projects.json stores. */
export interface Project {
  name: string;
  /** The project folder, or the HTML file for a single-file project. */
  folder: string;
  kind: ProjectKind;
  /** The dev command, for a project with a dev server. */
  command: string;
  /** The port Hatch starts this project on, every time. */
  port: number;
  /** Open on the port itself, for sign-in redirects tied to one address. */
  direct: boolean;
  framework: string;
}

export interface ProjectState extends Project {
  status: ProjectStatus;
  /** The port the project answers on now, which differs from `port` when someone else started it. */
  livePort: number | null;
  startedByHatch: boolean;
  /** The link a Hatch loads for this project. */
  url: string;
}

/** A dev server Hatch found running that belongs to no registered project. */
export interface FoundServer {
  folder: string;
  port: number;
  command: string;
}

export interface ProjectsState {
  projects: ProjectState[];
  found: FoundServer[];
  proxyPort: number | null;
}
