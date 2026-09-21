// Every agent call lands here with its stated intent. The Activity panel shows the list, and a log file keeps it for review later.
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ActivityDetail, ActivityEntry } from '@shared/types';
import { dataFile } from '../paths';
import { push } from '../renderer-rpc';

const KEEP = 300;
const entries: ActivityEntry[] = [];
const started = new Date().toISOString().replace(/[:.]/g, '-');
export const logPath = (): string => join(dataFile('logs'), `${started}.jsonl`);

let writes: Promise<void> = Promise.resolve();
function log(entry: ActivityEntry): void {
  writes = writes
    .then(async () => {
      await mkdir(dataFile('logs'), { recursive: true });
      await appendFile(logPath(), `${JSON.stringify(entry)}\n`);
    })
    .catch(() => {});
}

export const listActivity = (): ActivityEntry[] => entries;

export function begin(entry: Omit<ActivityEntry, 'id' | 'time' | 'status'>): ActivityEntry {
  const full: ActivityEntry = { ...entry, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, time: Date.now(), status: 'running' };
  entries.push(full);
  if (entries.length > KEEP) entries.shift();
  push('activity:event', full);
  return full;
}

export function end(entry: ActivityEntry, outcome: { error?: string; note?: string; detail?: ActivityDetail; tabId?: string | null; hatchId?: string | null }): void {
  entry.status = outcome.error ? 'failed' : 'done';
  entry.ms = Date.now() - entry.time;
  if (outcome.error) entry.error = outcome.error;
  if (outcome.note) entry.note = outcome.note;
  if (outcome.detail) entry.detail = outcome.detail;
  entry.tabId = outcome.tabId ?? entry.tabId;
  entry.hatchId = outcome.hatchId ?? entry.hatchId;
  push('activity:event', entry);
  log(entry);
}
