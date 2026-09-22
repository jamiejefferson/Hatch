import { z } from 'zod';
import { hatchFor } from '../../agents/agents';
import { addressOf, arrival, ensureNoDialog, waitFor, waitForLoad } from '../../cdp/actions';
import { HatchError, type PageSession } from '../../cdp/session';
import { callInterface } from '../../renderer-rpc';
import { settingsStore } from '../../store/stores';
import { openHatch } from './hatches';
import { onPage } from './page';
import { waitUntil } from './target';
import { resolveTarget } from './resolve';
import { canvas, hatch, intent, shortAddress, timeoutS, tool } from './types';

/** A loaded page arrives with the top of its outline, so the agent acts on it with no snapshot in between. */
const describePage = async (page: PageSession, loaded: boolean, seconds: number): Promise<string> =>
  `${loaded ? 'Loaded' : `Still loading after ${seconds} seconds:`} ${await addressOf(page)} (${JSON.stringify(page.guest.getTitle())}). ${loaded ? await arrival(page) : 'Hatch keeps loading it. Call wait_for to pick it up.'}`;

export const navigateTools = [
  tool({
    name: 'navigate',
    description: 'Sends your current Hatch to an address. With no Hatch in your canvas yet, it opens one. Pass canvas to work in a canvas other than the one you hold.',
    shape: { to: z.string().describe('A hatch: project address such as hatch:acme/pricing, a full link, a domain, an absolute file or folder path, or the title of a saved link.'), timeout_s: timeoutS(30), hatch, canvas, intent },
    summary: (a) => `navigate ${shortAddress(a.to)}`,
    async run(a, ctx) {
      const { hatchId } = await hatchFor(ctx.agent, a.hatch, a.canvas);
      if (!hatchId) return openHatch(ctx, a.to, {}, a.timeout_s, a.canvas);
      const url = await resolveTarget(a.to);
      return onPage(ctx, a.hatch, async (page) => {
        ensureNoDialog(page);
        page.loading = true;
        page.guest.loadURL(url).catch(() => {});
        const timer = setInterval(() => ctx.progress('The page is loading.'), 5000);
        const loaded = await waitForLoad(page, a.timeout_s * 1000).finally(() => clearInterval(timer));
        return describePage(page, loaded, a.timeout_s);
      });
    },
  }),
  tool({
    name: 'reload',
    description: 'Reloads the page in a Hatch.',
    shape: { timeout_s: timeoutS(30), hatch, intent },
    async run(a, ctx) {
      return onPage(ctx, a.hatch, async (page) => {
        ensureNoDialog(page);
        page.loading = true;
        // Never CDP Page.reload: sent to a guest, it reloads Hatch's own window.
        page.guest.reload();
        const loaded = await waitForLoad(page, a.timeout_s * 1000);
        return describePage(page, loaded, a.timeout_s);
      });
    },
  }),
  tool({
    name: 'go_back',
    description: 'Goes back one page in a Hatch\'s history.',
    shape: { timeout_s: timeoutS(30), hatch, intent },
    async run(a, ctx) {
      return onPage(ctx, a.hatch, async (page) => {
        ensureNoDialog(page);
        if (!page.guest.navigationHistory.canGoBack()) throw new HatchError('This Hatch has no earlier page.');
        page.loading = true;
        page.guest.navigationHistory.goBack();
        const loaded = await waitForLoad(page, a.timeout_s * 1000);
        return describePage(page, loaded, a.timeout_s);
      });
    },
  }),
  tool({
    name: 'wait_for',
    description: 'Waits until text appears, text goes away, or the address contains a string. With no condition it waits for the page to finish loading. Every condition passed must hold.',
    shape: {
      text: z.string().optional().describe('Wait until the page shows this text.'),
      text_gone: z.string().optional().describe('Wait until the page no longer shows this text.'),
      url_contains: z.string().optional().describe('Wait until the address contains this string.'),
      until: z.string().min(2).max(300).optional().describe('Wait until a statement about the page holds, in plain words, such as "the search results are showing". It works once the user has connected Jev in Settings. Pass it alone.'),
      timeout_s: timeoutS(30),
      hatch,
      intent,
    },
    readOnly: true,
    summary: (a) => `wait_for ${a.text ? JSON.stringify(a.text) : a.text_gone ? `gone ${JSON.stringify(a.text_gone)}` : (a.url_contains ?? 'load')}`,
    async run(a, ctx) {
      return onPage(ctx, a.hatch, async (page) => {
        if (a.until) {
          if (a.text || a.text_gone || a.url_contains) throw new HatchError('Pass until alone, or pass text, text_gone and url_contains.');
          const described = await waitUntil(page, a.until, a.timeout_s * 1000);
          return `${described.detail} The page is ${await addressOf(page)}.`;
        }
        let lastTick = 0;
        const result = await waitFor(page, { text: a.text, text_gone: a.text_gone, url_contains: a.url_contains }, a.timeout_s * 1000, (elapsed) => {
          if (elapsed - lastTick < 5000) return;
          lastTick = elapsed;
          ctx.progress(`Waiting, ${Math.round(elapsed / 1000)} seconds so far.`);
        });
        return `${result.detail} The page is ${await addressOf(page)}.`;
      });
    },
  }),
  tool({
    name: 'set_view',
    description: 'Asks Hatch to switch what the user sees in a Hatch: "page" for the rendered page, "agent" for the outline you read. Your own reads never depend on it. Hatch shows your reason to the user, who may accept or stay put. The call returns at once.',
    shape: {
      view: z.enum(['page', 'agent']).describe('"page" or "agent".'),
      reason: z.string().min(1, 'State a reason. Hatch shows it to the user before the display changes.').max(300).describe('Why the user should see this view. Required.'),
      hatch,
      intent,
    },
    summary: (a) => `set_view ${a.view}`,
    async run(a, ctx) {
      if (!a.reason.trim()) throw new HatchError('State a reason. Hatch shows it to the user before the display changes.');
      const { tabId, hatchId } = await hatchFor(ctx.agent, a.hatch);
      ctx.at(tabId, hatchId);
      if (!hatchId) throw new HatchError('Your tab has no Hatch yet.');
      const ask = (await settingsStore.read()).askBeforeViewSwitch;
      const outcome = await callInterface<'same' | 'asked' | 'switched'>('requestView', { hatchId, view: a.view, reason: a.reason.trim(), agent: ctx.agent.id, ask });
      if (outcome === 'same') return `That Hatch already shows the ${a.view === 'agent' ? 'agent view' : 'page'}.`;
      return outcome === 'switched' ? 'Hatch showed your reason and switched the view.' : 'Requested. Hatch is showing your reason to the user, who decides. Carry on with your work.';
    },
  }),
];
