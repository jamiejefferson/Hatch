import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * One JSON file with atomic writes. Writes run one after another, so a slow write never lands on top of a newer one.
 * A file Hatch fails to parse is moved aside and never overwritten.
 */
export class JsonStore<T> {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly where: string | (() => string),
    private readonly repair: (raw: unknown) => T,
  ) {}

  /** The file may move while Hatch runs, when the user chooses another folder for it. */
  private get path(): string {
    return typeof this.where === 'function' ? this.where() : this.where;
  }

  async read(): Promise<T> {
    let text: string;
    try {
      text = await readFile(this.path, 'utf8');
    } catch {
      return this.repair(undefined);
    }
    try {
      return this.repair(JSON.parse(text));
    } catch {
      await rename(this.path, `${this.path}.unreadable-${Date.now()}`).catch(() => {});
      return this.repair(undefined);
    }
  }

  write(value: T): Promise<void> {
    const run = async (): Promise<void> => {
      await mkdir(dirname(this.path), { recursive: true });
      const temp = `${this.path}.${process.pid}.tmp`;
      await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
      await rename(temp, this.path);
    };
    this.queue = this.queue.then(run, run);
    return this.queue;
  }

  async update(change: (current: T) => T): Promise<T> {
    const next = change(await this.read());
    await this.write(next);
    return next;
  }

  /** Resolves when every queued write has landed. */
  settled(): Promise<void> {
    return this.queue.catch(() => {});
  }
}
