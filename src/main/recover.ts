// What Hatch does when a process under its window dies. A window whose renderer has gone shows black and answers nothing,
// and a reload is no way back: in a sandboxed renderer the preload fails to run again, so the interface never boots.
// Hatch opens a new window, which brings the saved workspace back, and writes down what happened for the next feedback.
import { appendFile, mkdir } from 'node:fs/promises';
import { app, type BrowserWindow, webContents } from 'electron';
import { dataFile } from './paths';

export const crashLog = (): string => dataFile('crash.log');

async function note(line: string): Promise<void> {
  try {
    await mkdir(dataFile(''), { recursive: true });
    await appendFile(crashLog(), `${new Date().toISOString()}  Hatch ${app.getVersion()}  ${line}\n`);
  } catch {
    // The note is a courtesy; recovery goes ahead without it.
  }
}

let watchingGpu = false;

/** Replaces the window after its renderer dies, and repaints every page after the GPU process restarts. */
export function watchForCrashes(win: BrowserWindow, replace: () => void): void {
  const host = win.webContents;
  if (!watchingGpu) {
    watchingGpu = true;
    app.on('child-process-gone', (_event, details) => {
      if (details.type !== 'GPU') return;
      void note(`The GPU process went away (${details.reason}, exit code ${details.exitCode}). Hatch asked every page to repaint.`);
      // Chromium starts a new GPU process, but a surface drawn by the old one can stay black until something asks for a repaint.
      for (const contents of webContents.getAllWebContents()) {
        if (!contents.isDestroyed()) contents.invalidate();
      }
    });
  }
  host.on('render-process-gone', (_event, details) => {
    // A renderer that went away on purpose, because the window closed, needs nothing.
    if (details.reason === 'clean-exit') return;
    void note(`The interface's renderer went away (${details.reason}, exit code ${details.exitCode}). Hatch opened a new window in its place.`);
    replace();
  });
  host.on('unresponsive', () => void note('The interface stopped answering.'));
  host.on('responsive', () => void note('The interface answers again.'));
}
