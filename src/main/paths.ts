import { homedir } from 'node:os';
import { join } from 'node:path';

/** Hatch keeps its data in ~/.hatch. HATCH_HOME moves it, which the tests use. */
export const hatchHome = (): string => process.env.HATCH_HOME || join(homedir(), '.hatch');

export const dataFile = (name: string): string => join(hatchHome(), name);

export const PAGES_PARTITION = 'persist:hatch-pages';
