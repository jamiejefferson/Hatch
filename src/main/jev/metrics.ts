// A local record of every jev_run, so the user can see which sites and goals suit Jev. It stays on this Mac.
import { dataFile } from '../paths';
import { JsonStore } from '../store/json-store';
import type { Status } from './run';

export interface RunMetric {
  time: string;
  host: string;
  /** The goal's length in characters. The goal's words stay out of the file. */
  goal_chars: number;
  status: Status;
  steps: number;
  jev_calls: number;
  input_tokens: number;
  cost_usd: number;
  elapsed_ms: number;
  /** Jev's confidence in each action it proposed. */
  confidences: number[];
}

const KEEP = 1000;
const store = new JsonStore<{ runs: RunMetric[] }>(dataFile('jev_metrics.json'), (raw) => (raw && typeof raw === 'object' && Array.isArray((raw as { runs?: unknown }).runs) ? { runs: (raw as { runs: RunMetric[] }).runs } : { runs: [] }));

export async function record(metric: RunMetric): Promise<void> {
  const { runs } = await store.read();
  await store.write({ runs: [...runs, metric].slice(-KEEP) }).catch(() => {});
}
