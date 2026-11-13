// Long results an agent reads from disk in one go, in ~/.hatch/results.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hatchHome } from './paths';

/** Writes the text to a file in ~/.hatch/results and returns its path. `name` keeps one file per subject, such as one per document; otherwise each result gets its own. */
export async function saveResult(text: string, ext: string, prefix = 'evaluate', name?: string): Promise<string> {
  const dir = join(hatchHome(), 'results');
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${prefix}-${name ?? `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${Math.random().toString(36).slice(2, 6)}`}.${ext}`);
  await writeFile(file, text);
  return file;
}
