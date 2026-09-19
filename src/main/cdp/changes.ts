// Says what an action changed in the agent view, so the agent rarely needs a snapshot to see the result.
// Pure code with no Electron imports.
import type { OutlineLine } from './snapshot';

const MAX_LINES = 30;
const MAX_CHARS = 2500;

export function describeChanges(before: OutlineLine[], after: OutlineLine[]): string {
  const had = new Map<string, number>();
  for (const l of before) had.set(l.text, (had.get(l.text) ?? 0) + 1);
  const fresh: OutlineLine[] = [];
  for (const l of after) {
    const left = had.get(l.text) ?? 0;
    if (left > 0) had.set(l.text, left - 1);
    else fresh.push(l);
  }
  const gone = [...had.values()].reduce((sum, n) => sum + n, 0);
  if (fresh.length === 0 && gone === 0) return 'The agent view shows no change yet.';

  let shown = '';
  let count = 0;
  for (const l of fresh) {
    const next = `${'  '.repeat(Math.min(l.depth, 6))}${l.text}\n`;
    if (count === MAX_LINES || shown.length + next.length > MAX_CHARS) break;
    shown += next;
    count += 1;
  }
  const left = gone === 0 ? '' : `${gone} ${gone === 1 ? 'line' : 'lines'} left the agent view.`;
  if (fresh.length === 0) return left;
  const more = fresh.length > count ? `… ${fresh.length - count} more new lines. Call snapshot to read them all.\n` : '';
  return `${left}${left ? ' ' : ''}New or changed lines:\n${shown}${more}`.trimEnd();
}
