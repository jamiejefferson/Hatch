import { app, Menu, shell, webContents, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import type { MenuCommand } from '../preload/api';

/**
 * Hatch replaces Electron's default menu. The default Reload item reloads the host window,
 * which would destroy every live page, so Cmd+R reloads the selected Hatch instead.
 */
export function buildMenu(getWindow: () => BrowserWindow | null): void {
  const send = (command: MenuCommand) => (): void => getWindow()?.webContents.send('command', command);
  const item = (label: string, accelerator: string, command: MenuCommand): MenuItemConstructorOptions => ({ label, accelerator, click: send(command) });
  /** Sends an edit command to Hatch's interface when it holds the keyboard, and runs it in the page that holds it otherwise. */
  // The interface decides which page holds the keyboard: the page whose webview holds focus there. Electron's own answer can name a
  // page the user has left, or none at all while a page holds the focus.
  const toFocused = async (command: MenuCommand, inPage: (wc: Electron.WebContents) => void): Promise<void> => {
    const host = getWindow()?.webContents;
    const id: number = host ? await host.executeJavaScript(`document.activeElement?.tagName === 'WEBVIEW' ? document.activeElement.getWebContentsId() : 0`).catch(() => 0) : 0;
    const page = id ? webContents.fromId(id) : undefined;
    if (page && !page.isDestroyed()) return inPage(page);
    send(command)();
  };

  const template: MenuItemConstructorOptions[] = [
    { label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    {
      label: 'File',
      submenu: [
        item('New Hatch', 'CmdOrCtrl+N', 'new-hatch'),
        item('New Tab', 'CmdOrCtrl+T', 'new-tab'),
        item('Duplicate Hatch', 'CmdOrCtrl+D', 'duplicate-hatch'),
        { type: 'separator' },
        item('Close Hatch', 'CmdOrCtrl+W', 'close-hatch'),
        item('Close Tab', 'CmdOrCtrl+Shift+W', 'close-tab'),
        item('Reopen Closed Hatch or Canvas', 'CmdOrCtrl+Shift+T', 'reopen-closed'),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        // Undo, Redo and Select All act on the canvas while Hatch's own interface holds the keyboard. The interface hands them on to a
        // text field that holds it. A page that holds the keyboard keeps its own undo and selection.
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => void toFocused('undo', (wc) => wc.undo()) },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', click: () => void toFocused('redo', (wc) => wc.redo()) },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: () => void toFocused('select-all', (wc) => wc.selectAll()) },
        { type: 'separator' },
        item('Group Selection', 'CmdOrCtrl+G', 'group'),
      ],
    },
    {
      label: 'View',
      submenu: [
        item('Reload Hatch', 'CmdOrCtrl+R', 'reload-hatch'),
        item('Back', 'CmdOrCtrl+[', 'back'),
        item('Forward', 'CmdOrCtrl+]', 'forward'),
        item('Previous Hatch', 'Alt+CmdOrCtrl+Left', 'previous-hatch'),
        item('Next Hatch', 'Alt+CmdOrCtrl+Right', 'next-hatch'),
        { type: 'separator' },
        item('Zoom Canvas In', 'CmdOrCtrl+=', 'zoom-in'),
        item('Zoom Canvas Out', 'CmdOrCtrl+-', 'zoom-out'),
        item('Canvas at 100%', 'CmdOrCtrl+0', 'zoom-actual'),
        { type: 'separator' },
        item('Fit Hatch to View', 'CmdOrCtrl+F', 'toggle-fit'),
        item('Switch Between Page and Agent View', 'CmdOrCtrl+Shift+A', 'toggle-view'),
        item('Show or Hide Left Column', 'CmdOrCtrl+\\', 'toggle-left'),
        item('Show or Hide Sidebar', 'Alt+CmdOrCtrl+\\', 'toggle-sidebar'),
        item('Inspect Hatch', 'Alt+CmdOrCtrl+I', 'inspect-hatch'),
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Show the Guide', click: send('show-guide') },
        { label: 'Send Feedback', click: send('send-feedback') },
        { type: 'separator' },
        { label: 'Hatch on GitHub', click: () => void shell.openExternal('https://github.com/jamiejefferson/hatch') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
