import { z } from 'zod';
import { TEMPLATES } from '@shared/templates';
import { hatchFor, inTabQueue, tabFor } from '../../agents/agents';
import { HatchError } from '../../cdp/session';
import { waitForPage } from '../../hatches/registry';
import { callInterface } from '../../renderer-rpc';
import { resolveTarget } from './resolve';
import { addressOf, waitForLoad } from '../../cdp/actions';
import { canvas, hatch, intent, shortAddress, timeoutS, tool, type ToolContext } from './types';

const PRESETS = TEMPLATES.map((t) => t.id);
const preset = z.enum(PRESETS as [string, ...string[]]).optional().describe(`Device template: ${TEMPLATES.map((t) => (t.size ? `${t.id} (${t.size.width} × ${t.size.height})` : `${t.id} (fills the window)`)).join(', ')}.`);
const width = z.number().int().min(240).max(4000).optional().describe('Viewport width in CSS pixels. Pass it with height for a custom size.');
const height = z.number().int().min(240).max(4000).optional().describe('Viewport height in CSS pixels.');

export async function openHatch(ctx: ToolContext, to: string, size: { preset?: string; width?: number; height?: number }, timeoutSeconds: number, inCanvas?: string): Promise<string> {
  const url = await resolveTarget(to);
  const { tabId } = await tabFor(ctx.agent, inCanvas);
  return inTabQueue(tabId, async () => {
    const hatchId = await callInterface<string>('openHatch', { tabId, url, ...size });
    ctx.agent.hatchId = hatchId;
    ctx.at(tabId, hatchId);
    const page = await waitForPage(hatchId);
    if (!page) throw new HatchError('The new Hatch did not finish opening. Call status to see your Hatches.');
    await page.attach();
    page.loading = page.guest.isLoading();
    const loaded = await waitForLoad(page, timeoutSeconds * 1000);
    return `Opened Hatch ${hatchId} at ${await addressOf(page)} (${JSON.stringify(page.guest.getTitle())}). ${loaded ? 'The page has loaded.' : `The page is still loading after ${timeoutSeconds} seconds. Call wait_for to pick it up.`} It is now your current Hatch. Call snapshot to read it.`;
  });
}

export const hatchTools = [
  tool({
    name: 'list_hatches',
    description: 'Lists the Hatches in a canvas with id, title, address, size and view. A Hatch is one live page in a frame on the canvas. With nothing passed it lists the canvas you hold; pass a canvas id, or a link the user copied (hatch:@ and an id), for another.',
    shape: { canvas, hatch: z.string().optional().describe('A copied hatch:@ link to a Hatch or a canvas. Leave it out to list your own canvas.'), intent },
    readOnly: true,
    async run(args, ctx) {
      const { tabId, hatchId, state } = await hatchFor(ctx.agent, args.hatch, args.canvas);
      if (args.hatch && hatchId) ctx.agent.hatchId = hatchId;
      ctx.at(tabId, hatchId);
      const tab = state.tabs.find((t) => t.id === tabId)!;
      if (tab.hatches.length === 0) return `The canvas ${JSON.stringify(tab.label)} (${tab.id}) has no Hatch yet. Call navigate or open_hatch with an address.`;
      return tab.hatches.map((h) => `${h.id}${h.id === hatchId ? ' (current)' : ''}  ${JSON.stringify(h.title)}  ${h.url}  ${h.width} × ${h.height}  ${h.template}  shows the ${h.view === 'agent' ? 'agent view' : 'page'}`).join('\n');
    },
  }),
  tool({
    name: 'open_hatch',
    description: 'Opens a new Hatch beside the others in a canvas and makes it your current Hatch. Use it to compare two pages or two sizes of one page. To change the page in an existing Hatch, use navigate. Pass canvas to open it in a canvas other than the one you hold.',
    shape: { to: z.string().describe('A hatch: project address, a full link, a domain, an absolute file or folder path, or the title of a saved link.'), preset, width, height, canvas, timeout_s: timeoutS(30), intent },
    summary: (a) => `open_hatch ${shortAddress(a.to)}`,
    run: (a, ctx) => openHatch(ctx, a.to, { preset: a.preset, width: a.width, height: a.height }, a.timeout_s, a.canvas),
  }),
  tool({
    name: 'select_hatch',
    description: 'Chooses which Hatch your later calls act on. It also takes a link the user copied in Hatch (hatch:@ and an id), for one Hatch or for a whole canvas, and moves you to that canvas. The user\'s own selection stays as it is.',
    shape: { hatch: z.string().describe('Hatch id from list_hatches, or a copied hatch:@ link to a Hatch or a canvas.'), intent },
    summary: (a) => `select_hatch ${a.hatch}`,
    async run(a, ctx) {
      const { tabId, hatchId } = await hatchFor(ctx.agent, a.hatch);
      ctx.agent.hatchId = hatchId;
      ctx.at(tabId, hatchId);
      if (!hatchId) return 'You now hold that canvas. It has no Hatch yet, so call navigate or open_hatch.';
      return `Your calls now act on ${hatchId}. Call snapshot to read it, or list_hatches to see the rest of its canvas.`;
    },
  }),
  tool({
    name: 'close_hatch',
    description: 'Closes a Hatch, in your canvas or any other.',
    shape: { hatch: z.string().describe('Hatch id from list_hatches.'), intent },
    summary: (a) => `close_hatch ${a.hatch}`,
    async run(a, ctx) {
      const { tabId, hatchId } = await hatchFor(ctx.agent, a.hatch);
      ctx.at(tabId, hatchId);
      await inTabQueue(tabId, () => callInterface('closeHatch', { hatchId }));
      if (ctx.agent.hatchId === hatchId) ctx.agent.hatchId = null;
      return `Closed ${hatchId}.`;
    },
  }),
  tool({
    name: 'set_viewport',
    description: 'Sizes a Hatch by device template or by width and height. The page reflows with no reload.',
    shape: { preset, width, height, hatch, intent },
    summary: (a) => `set_viewport ${a.preset ?? `${a.width} × ${a.height}`}`,
    async run(a, ctx) {
      if (!a.preset && !(a.width && a.height)) throw new HatchError('Pass a preset, or pass both width and height.');
      const { tabId, hatchId } = await hatchFor(ctx.agent, a.hatch);
      ctx.at(tabId, hatchId);
      if (!hatchId) throw new HatchError('Your tab has no Hatch yet. Call navigate with an address first.');
      return inTabQueue(tabId, async () => {
        const size = await callInterface<{ width: number; height: number }>('sizeHatch', { hatchId, preset: a.preset, width: a.width, height: a.height });
        return `${hatchId} now shows the page at ${size.width} × ${size.height}.`;
      });
    },
  }),
];
