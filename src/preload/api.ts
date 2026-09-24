import type { Anchor, CommentStatus, PageComments } from '@shared/comments';
import type { BrowserProfile, ImportOutcome } from '@shared/cookie-import';
import type { FeedbackDetails, FeedbackInput } from '@shared/feedback';
import type { ConsentAnswer, ConsentRequest, SignIn } from '@shared/signins';
import type { ActivityEntry, AgentAct, AgentWorkState, DialogState, Project, ProjectsState, ProjectState, SavedCanvas, SavedLink, Settings, Workspace } from '@shared/types';

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

export type MenuCommand =
  | 'new-hatch' | 'new-tab' | 'close-hatch' | 'close-tab' | 'reload-hatch' | 'back' | 'forward'
  | 'zoom-in' | 'zoom-out' | 'zoom-actual' | 'toggle-sidebar' | 'inspect-hatch' | 'deselect' | 'toggle-view' | 'show-guide' | 'send-feedback';

/** Messages the main process pushes to the interface. */
export interface Pushes {
  command: MenuCommand;
  'activity:event': ActivityEntry;
  'agents:work': AgentWorkState;
  /** An agent clicked, filled or hovered over an element, and the Hatch marks it for a moment. */
  'agent:act': AgentAct;
  /** The id of a Hatch whose page navigated, loaded or changed. */
  'page:changed': string;
  /** The id of a Hatch whose page received the Esc key. */
  'page:escape': string;
  /** A page on the canvas tried to open a pop-up, which Hatch opens in Fit to view alone. */
  'popup:blocked': { hatchId: string; url: string };
  'dialog:state': { hatchId: string; dialog: DialogState | null };
  'projects:state': ProjectsState;
  'projects:log': { name: string; lines: string[] };
  'links:state': SavedLink[];
  /** The path of a comment file that changed, through Hatch or under it. */
  'comments:changed': string;
  'signins:state': SignIn[];
  'connection:state': ConnectionInfo;
  'consent:state': { hatchId: string; request: ConsentRequest | null };
  /** One line for the foot of the window, such as a download that has landed. */
  toast: string;
}

export interface ConnectionInfo {
  url: string | null;
  command: string;
  examples: string;
  busyPort: number | null;
  error: string | null;
  version: string;
}

export interface ActivityBoot {
  entries: ActivityEntry[];
  work: AgentWorkState;
  logPath: string;
  port: number | null;
}

export interface HatchApi {
  loadWorkspace(): Promise<Workspace>;
  saveWorkspace(workspace: Workspace): Promise<void>;
  listLinks(): Promise<SavedLink[]>;
  addLink(link: { name: string; url: string; folder?: string }): Promise<SavedLink[]>;
  removeLink(id: string): Promise<SavedLink[]>;
  /** Files a link under a folder. An empty folder name takes it back to the top of the list. */
  moveLink(id: string, folder: string): Promise<SavedLink[]>;
  renameLinkFolder(from: string, to: string): Promise<SavedLink[]>;
  savedCanvases(): Promise<SavedCanvas[]>;
  /** Saves a canvas. One with the same name is replaced. */
  saveCanvas(saved: SavedCanvas): Promise<SavedCanvas[]>;
  removeSavedCanvas(id: string): Promise<SavedCanvas[]>;
  getSettings(): Promise<Settings>;
  setSettings(settings: Partial<Settings>): Promise<Settings>;
  /** Whether Hatch holds a Jev key. The key itself never comes back to the interface. */
  hasJevKey(): Promise<boolean>;
  /** Saves the key, or removes it when the text is empty. */
  setJevKey(key: string): Promise<{ ok: true; value: boolean } | { ok: false; error: string }>;
  /** The last four characters of the saved key. The rest of the key never comes back to the interface. */
  jevKeyHint(): Promise<string>;
  /** Which service the saved key belongs to. Empty when Hatch holds no key. */
  jevProvider(): Promise<'typesafe' | 'openrouter' | ''>;
  /** Asks Jev one small question with the saved key. */
  testJev(): Promise<{ ok: true; value: true } | { ok: false; error: string }>;
  copyText(text: string): Promise<void>;
  /** Puts an element's markup on the clipboard in the form Paper pastes as editable layers. Resolves to the payload's length. */
  copyForPaper(html: string): Promise<number>;
  /** Tells the main process which guest belongs to which Hatch. */
  bindHatch(hatchId: string, webContentsId: number): void;
  /** Opens the macOS folder chooser. Resolves null when the user cancels. */
  pickFolder(title: string): Promise<string | null>;
  /** Tells the main process which Hatches sit in Fit to view, where pop-ups open. */
  setFitHatches(ids: string[]): void;
  projects(): Promise<ProjectsState>;
  /** Opens the macOS picker and returns the chosen folder or HTML file. */
  pickProject(): Promise<string | null>;
  addProject(folder: string): Promise<Outcome<ProjectState>>;
  updateProject(name: string, change: Partial<Pick<Project, 'name' | 'command' | 'port' | 'direct'>>): Promise<Outcome<ProjectState>>;
  removeProject(name: string): Promise<Outcome<void>>;
  startProject(name: string): Promise<Outcome<ProjectState>>;
  stopProject(name: string): Promise<Outcome<void>>;
  projectLog(name: string): Promise<string[]>;
  refreshProjects(): Promise<void>;
  comments(url: string): Promise<Outcome<PageComments>>;
  addComment(url: string, input: { anchor: Anchor; label: string; text: string }): Promise<Outcome<PageComments>>;
  replyComment(url: string, id: string, text: string): Promise<Outcome<PageComments>>;
  setCommentStatus(url: string, id: string, status: CommentStatus): Promise<Outcome<PageComments>>;
  markCommentSeen(url: string, id: string): Promise<Outcome<PageComments>>;
  editComment(url: string, id: string, index: number, text: string): Promise<Outcome<PageComments>>;
  removeComment(url: string, id: string): Promise<Outcome<PageComments>>;
  signIns(): Promise<SignIn[]>;
  addSignIn(input: { site: string; username: string; password: string }): Promise<Outcome<SignIn[]>>;
  removeSignIn(id: string): Promise<Outcome<SignIn[]>>;
  setSignInAllow(id: string, allow: SignIn['allow']): Promise<Outcome<SignIn[]>>;
  /** The browser profiles on this Mac whose cookies Hatch can read. */
  browserProfiles(): Promise<BrowserProfile[]>;
  /** Copies the cookies for the page's site from that profile into Hatch's session. macOS asks the user for the browser's Keychain key first. */
  importSignIn(pageUrl: string, profileId: string): Promise<Outcome<ImportOutcome>>;
  answerConsent(hatchId: string, answer: ConsentAnswer): Promise<void>;
  connection(): Promise<ConnectionInfo>;
  openSetupExamples(): Promise<string>;
  openDataFolder(): Promise<string>;
  /** Whether Hatch is the Mac's default browser. 'unavailable' in a checkout, where macOS knows no Hatch app. */
  defaultBrowser(): Promise<'default' | 'other' | 'unavailable'>;
  /** Asks macOS to make Hatch the default browser. macOS confirms with the user, so the state may change a moment later. */
  makeDefaultBrowser(): Promise<'default' | 'other' | 'unavailable'>;
  feedbackDetails(): Promise<FeedbackDetails>;
  /** Captures Hatch's window for the feedback form and resolves to a data URL for the preview. Null when the capture fails. */
  captureForFeedback(): Promise<string | null>;
  /** Resolves 'saved' when the service is out of reach. Hatch keeps the feedback and sends it the next time it opens. */
  sendFeedback(input: FeedbackInput): Promise<Outcome<'sent' | 'saved'>>;
  activity(): Promise<ActivityBoot>;
  openLog(): Promise<void>;
  /** The agent view of a Hatch: the exact string an agent's snapshot returns. */
  readAgentView(hatchId: string): Promise<string>;
  answerDialog(hatchId: string, accept: boolean, text?: string): Promise<void>;
  on<K extends keyof Pushes>(channel: K, listener: (payload: Pushes[K]) => void): () => void;
  /** Answers the main process when it asks the interface to change the workspace for an agent. */
  serve(handler: (method: string, params: unknown) => unknown): void;
  /** False when the tests run Hatch with a hidden window, so they skip the start-up sequence. HATCH_INTRO=1 brings it back. */
  intro: boolean;
  /** False when HATCH_GUIDE=0, which the tests set so the guide never covers the interface they drive. */
  guide: boolean;
}
