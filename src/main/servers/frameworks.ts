// Reads a project folder and works out what it is, how to start it and how to tell it which port to use.
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

export interface Detected {
  kind: 'server' | 'folder' | 'file';
  framework: string;
  /** The dev command, empty for a static folder or file. */
  command: string;
}

interface Framework { label: string; dep: string; portArgs(port: number): string }

// Order matters: a Next.js or Astro project also depends on vite or react.
const FRAMEWORKS: Framework[] = [
  { label: 'Next.js', dep: 'next', portArgs: (p) => `--port ${p}` },
  { label: 'Astro', dep: 'astro', portArgs: (p) => `--port ${p}` },
  { label: 'Nuxt', dep: 'nuxt', portArgs: (p) => `--port ${p}` },
  { label: 'SvelteKit', dep: '@sveltejs/kit', portArgs: (p) => `--port ${p} --strictPort` },
  { label: 'Remix', dep: '@remix-run/dev', portArgs: (p) => `--port ${p}` },
  { label: 'Gatsby', dep: 'gatsby', portArgs: (p) => `--port ${p}` },
  { label: 'Eleventy', dep: '@11ty/eleventy', portArgs: (p) => `--port=${p}` },
  { label: 'Vite', dep: 'vite', portArgs: (p) => `--port ${p} --strictPort` },
  // Create React App and most plain Node servers read PORT from the environment, which Hatch always sets.
  { label: 'Create React App', dep: 'react-scripts', portArgs: () => '' },
];

const exists = (path: string): Promise<boolean> => stat(path).then(() => true, () => false);

export async function packageManager(folder: string): Promise<'pnpm' | 'yarn' | 'bun' | 'npm'> {
  if (await exists(join(folder, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await exists(join(folder, 'yarn.lock'))) return 'yarn';
  if ((await exists(join(folder, 'bun.lockb'))) || (await exists(join(folder, 'bun.lock')))) return 'bun';
  return 'npm';
}

export async function detect(path: string): Promise<Detected> {
  const info = await stat(path);
  if (info.isFile()) return { kind: 'file', framework: 'file', command: '' };
  const raw = await readFile(join(path, 'package.json'), 'utf8').catch(() => null);
  if (raw) {
    try {
      const pkg = JSON.parse(raw) as { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const script = pkg.scripts?.dev ? 'dev' : pkg.scripts?.start ? 'start' : null;
      if (script) {
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        const framework = FRAMEWORKS.find((f) => f.dep in deps)?.label ?? 'Node';
        const pm = await packageManager(path);
        return { kind: 'server', framework, command: pm === 'npm' ? `npm run ${script}` : `${pm} ${script}` };
      }
    } catch {
      // A package.json Hatch cannot read leaves the folder as a static one.
    }
  }
  return { kind: 'folder', framework: 'folder', command: '' };
}

/** The command Hatch runs: the project's dev command plus the framework's port flag. npm needs `--` before script arguments. */
export function commandWithPort(command: string, framework: string, port: number): string {
  const args = FRAMEWORKS.find((f) => f.label === framework)?.portArgs(port) ?? '';
  if (!args || /--port|\s-p\s/.test(command)) return command;
  return /^npm (run )?\S+$/.test(command.trim()) ? `${command} -- ${args}` : `${command} ${args}`;
}
