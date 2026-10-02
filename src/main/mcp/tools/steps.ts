// run_steps carries out a short list of actions in one call, so an agent that can see the next few moves spends one turn on them.
import { z } from 'zod';
import { addressOf, click, ensureNoDialog, fill, hover, outlineOf, pressKey, scroll, selectOption, sinceThen, snapshot, waitFor, waitForLoad } from '../../cdp/actions';
import { HatchError, type PageSession } from '../../cdp/session';
import { onPage } from './page';
import { resolveTarget } from './resolve';
import { elementFor, waitUntil, withPick } from './target';
import { hatch, intent, tool } from './types';

const step = z
  .object({
    do: z.enum(['navigate', 'click', 'fill', 'select_option', 'hover', 'press_key', 'scroll', 'wait', 'read']).describe('The action.'),
    to: z.string().optional().describe('navigate: the address, in any form navigate takes. scroll: "top" or "bottom".'),
    ref: z.string().optional().describe('Element reference, for click, fill, select_option, hover, scroll and read. Pass ref or target.'),
    target: z.string().min(2).max(300).optional().describe('The element in plain words, which works once the user has connected Jev in Settings.'),
    text: z.string().optional().describe('fill: the text the field should hold. wait: text the page must show.'),
    text_gone: z.string().optional().describe('wait: text the page must no longer show.'),
    dy: z.number().optional().describe('scroll: pixels to scroll down, or up when negative. Default 600.'),
    max_chars: z.number().int().min(200).max(20000).optional().describe('read: where to cut the element\'s outline. Default 4000.'),
    option: z.string().optional().describe('select_option: the option\'s label or value.'),
    key: z.string().optional().describe('press_key: the key or chord, such as Enter.'),
    until: z.string().min(2).max(300).optional().describe('wait: a statement about the page in plain words, such as "the search results are showing". It needs Jev connected, as target does.'),
    url_contains: z.string().optional().describe('wait: a string the address must contain.'),
    timeout_s: z.number().min(1).max(60).optional().describe('wait and navigate: seconds to wait. Default 15 for wait and 30 for navigate.'),
  })
  .strict();
type Step = z.infer<typeof step>;

const need = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) throw new HatchError(message);
  return value;
};

async function runStep(page: PageSession, s: Step): Promise<string> {
  switch (s.do) {
    case 'navigate': {
      ensureNoDialog(page);
      const url = await resolveTarget(need(s.to, 'A navigate step needs to.'));
      page.loading = true;
      page.guest.loadURL(url).catch(() => {});
      if (!(await waitForLoad(page, (s.timeout_s ?? 30) * 1000))) throw new HatchError(`The page ${url} was still loading after ${s.timeout_s ?? 30} seconds.`);
      return `Loaded ${await addressOf(page)} (${JSON.stringify(page.guest.getTitle())}).`;
    }
    case 'scroll': {
      const to = s.to === 'top' || s.to === 'bottom' ? s.to : undefined;
      if (s.to !== undefined && !to) throw new HatchError('A scroll step takes to as "top" or "bottom".');
      const ref = s.ref ?? (s.target ? (await elementFor(page, s, 'any', 'scroll to')).ref : undefined);
      return scroll(page, { ref, to, dy: s.dy });
    }
    case 'read': {
      const found = s.ref || s.target ? await elementFor(page, s, 'any', 'read') : undefined;
      return `${found ? `${found.ref} reads` : 'The page reads'}:\n${(await snapshot(page, found?.ref, s.max_chars ?? 4000)).trimEnd()}`;
    }
    case 'click': {
      const found = await elementFor(page, s, 'any', 'click');
      return withPick(found, await click(page, found.ref, { brief: true }));
    }
    case 'fill': {
      const text = need(s.text, 'A fill step needs text.');
      const found = await elementFor(page, s, 'field', 'type into');
      return withPick(found, await fill(page, found.ref, text, { brief: true }));
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
      const result = s.until ? await waitUntil(page, s.until, timeoutMs) : await waitFor(page, { text: s.text, text_gone: s.text_gone, url_contains: s.url_contains }, timeoutMs);
      if (!result.met) throw new HatchError(result.detail);
      return result.detail;
    }
  }
}

export const stepTools = [
  tool({
    name: 'run_steps',
    description:
      'Carries out up to 25 actions in one call: navigate, click, fill, select_option, hover, press_key, scroll, wait and read. Use it whenever you can see the next few moves, such as opening a page, filling a form, sending it and reading the result, because each call you save saves a turn. Hatch stops at the first step that fails or that it is unsure of, says which steps ran, and ends with what changed on the page. A wait that does not hold stops the run, so a short wait works as a check before a risky step. A read step puts an element\'s outline, or the page\'s, into the reply. A step names its element by ref, or by target in plain words when status says that is on; after a navigate step, name elements by target, because earlier references no longer apply.',
    shape: { steps: z.array(step).min(1).max(25).describe('The actions, in order.'), hatch, intent },
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
