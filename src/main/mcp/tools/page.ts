import { hatchFor, inTabQueue } from '../../agents/agents';
import { HatchError, type PageSession } from '../../cdp/session';
import { waitForPage } from '../../hatches/registry';
import type { ToolContext } from './types';

/** Finds the page a call acts on, then runs the work in that tab's queue. */
export async function onPage<T>(ctx: ToolContext, named: string | undefined, work: (page: PageSession) => Promise<T>): Promise<T> {
  const { tabId, hatchId } = await hatchFor(ctx.agent, named);
  ctx.at(tabId, hatchId);
  if (!hatchId) throw new HatchError('Your tab has no Hatch yet. Call navigate or open_hatch with an address to open a page.');
  return inTabQueue(tabId, async () => {
    const page = await waitForPage(hatchId);
    if (!page) throw new HatchError('That Hatch has not finished opening. Try again in a moment.');
    await page.attach();
    return work(page);
  });
}
