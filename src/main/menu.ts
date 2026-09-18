import { app, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import type { MenuCommand } from '../preload/api';

/**
 * Hatch replaces Electron's default menu. The default Reload item reloads the host window,
 * which would destroy every live page, so Cmd+R reloads the selected Hatch instead.
 */
export function buildMenu(getWindow: () => BrowserWindow | null): void {
  const send = (command: MenuCommand) => (): void => getWindow()?.webContents.send('command', command);
  const item = (label: string, accelerator: string, command: MenuCommand): MenuItemConstructorOptions => ({ label, accelerator, click: send(command) });

  const template: MenuItemConstructorOptions[] = [
    { label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    {
      label: 'File',
      submenu: [
        item('New Hatch', 'CmdOrCtrl+N', 'new-hatch'),
        item('New Tab', 'CmdOrCtrl+T', 'new-tab'),
        { type: 'separator' },
        item('Close Hatch', 'CmdOrCtrl+W', 'close-hatch'),
        item('Close Tab', 'CmdOrCtrl+Shift+W', 'close-tab'),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        item('Reload Hatch', 'CmdOrCtrl+R', 'reload-hatch'),
        item('Back', 'CmdOrCtrl+[', 'back'),
        item('Forward', 'CmdOrCtrl+]', 'forward'),
        { type: 'separator' },
        item('Zoom Canvas In', 'CmdOrCtrl+=', 'zoom-in'),
        item('Zoom Canvas Out', 'CmdOrCtrl+-', 'zoom-out'),
        item('Canvas at 100%', 'CmdOrCtrl+0', 'zoom-actual'),
        { type: 'separator' },
        item('Switch Between Page and Agent View', 'CmdOrCtrl+Shift+A', 'toggle-view'),
        item('Show or Hide Sidebar', 'CmdOrCtrl+\\', 'toggle-sidebar'),
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
