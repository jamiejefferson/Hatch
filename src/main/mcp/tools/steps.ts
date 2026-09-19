// run_steps carries out a short list of actions in one call, so an agent that can see the next few moves spends one turn on them.
import { z } from 'zod';
import { click, fill, hover, outlineOf, pressKey, selectOption, sinceThen, waitFor } from '../../cdp/actions';
import { HatchError, type PageSession } from '../../cdp/session';
import { onPage } from './page';
import { elementFor, waitUntil, withPick } from './target';
import { hatch, intent, tool } from './types';

const step = z
  .object({
    do: z.enum(['click', 'fill', 'select_option', 'hover', 'press_key', 'wait']).describe('The action.'),
    ref: z.string().optional().describe('Element reference, for click, fill, select_option and hover. Pass ref or target.'),
    target: z.string().min(2).max(300).optional().describe('The element in plain words, which works once the user has connected Jev in Settings.'),
    text: z.string().optional().describe('fill: the text the field should hold. wait: text the page must show.'),
    option: z.string().optional().describe('select_option: the option\'s label or value.'),
    key: z.string().optional().describe('press_key: the key or chord, such as Enter.'),
    until: z.string().min(2).max(300).optional().describe('wait: a statement about the page in plain words, such as "the search results are showing". It needs Jev connected, as target does.'),
    url_contains: z.string().optional().describe('wait: a string the address must contain.'),
    timeout_s: z.number().min(1).max(60).optional().describe('wait: seconds to wait. Default 15.'),
  })
  .strict();
type Step = z.infer<typeof step>;

const need = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) throw new HatchError(message);
  return value;
};

async function runStep(page: PageSession, s: Step): Promise<string> {
  switch (s.do) {
    case 'click': {
      const found = await elementFor(page, s, 'any', 'click');
      return withPick(found, await click(page, found.ref, { brief: true }));
    }
    case 'fill': {
      const text = need(s.text, 'A fill step needs text.');
      const found = await elementFor(page, s, 'field', 'type into');
      return withPick(found, await fill(page, found.ref, text));
    }
    case 'select_option': {
      const option = need(s.option, 'A select_option step needs option.');
      const found = await elementFor(page, s, 'dropdown', 'choose an option in');
      return withPick(found, await selectOption(page, found.ref, option));
    }
    case 'hover': {
      const found = await elementFor(page, s, 'any', 'hover over');
      return withPick(found, await hover(page, found.ref));
    }
    case 'press_key':
      return pressKey(page, need(s.key, 'A press_key step needs key.'), s.ref, undefined, true);
    case 'wait': {
      const timeoutMs = (s.timeout_s ?? 15) * 1000;
      const result = s.until ? await waitUntil(page, s.until, timeoutMs) : await waitFor(page, { text: s.text, url_contains: s.url_contains }, timeoutMs);
      if (!result.met) throw new HatchError(result.detail);
      return result.detail;
    }
  }
}

export const stepTools = [
  tool({
    name: 'run_steps',
    description: 'Carries out up to 12 actions in one call: click, fill, select_option, hover, press_key and wait. Use it when you can see the next few moves, such as filling a form and sending it. Hatch stops at the first step that fails or that it is unsure of, says which steps ran, and ends with what changed on the page. A step names its element by ref, or by target in plain words when status says that is on.',
    shape: { steps: z.array(step).min(1).max(12).describe('The actions, in order.'), hatch, intent },
    summary: (a) => `run_steps ${a.steps.map((s) => s.do).join(', ')}`,
    run: (a, ctx) =>
      onPage(ctx, a.hatch, async (page) => {
        const startUrl = page.guest.getURL();
        const seen = await outlineOf(page).catch(() => null);
        const said: string[] = [];
        let stopped = '';
        for (const [i, s] of a.steps.entries()) {
          ctx.progress(`Step ${i + 1} of ${a.steps.length}: ${s.do}.`);
          try {
            said.push(`${i + 1}. ${await runStep(page, s)}`);
          } catch (error) {
            if (!(error instanceof HatchError)) throw error;
            stopped = `Hatch stopped at step ${i + 1} of ${a.steps.length} (${s.do}), and the steps after it did not run. ${error.message}`;
            break;
          }
        }
        const head = stopped ? `Ran ${said.length} of ${a.steps.length} steps.` : `Ran all ${a.steps.length} steps.`;
        return [head, ...said, stopped, await sinceThen(page, startUrl, seen)].filter(Boolean).join('\n');
      }),
  }),
];
