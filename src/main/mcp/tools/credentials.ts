import { z } from 'zod';
import { siteOf, type SignIn } from '@shared/signins';
import { askConsent, fillSignIn } from '../../credentials/fill';
import { listSignIns, setAllow } from '../../credentials/store';
import { HatchError } from '../../cdp/session';
import { getProxyPort, projectsState } from '../../servers/manager';
import { onPage } from './page';
import { hatch, intent, timeoutS, tool } from './types';

const siteFor = async (url: string): Promise<string | null> => siteOf(url, (await projectsState(false)).projects, getProxyPort());

export const credentialTools = [
  tool({
    name: 'list_credentials',
    description: 'Lists the sign-ins the user saved in Hatch: site and username only. Hatch never shows a password to an agent.',
    shape: { intent },
    readOnly: true,
    async run() {
      const all = await listSignIns();
      if (all.length === 0) return 'The user has saved no sign-ins. They add one in the Sign-ins panel in Hatch.';
      return all.map((s) => `${s.site}  ${s.username}  ${s.allow === 'always' ? 'fills without asking' : 'Hatch asks the user before each fill'}`).join('\n');
    },
  }),
  tool({
    name: 'fill_credentials',
    description: 'Asks Hatch to fill the sign-in form on your current page from a saved sign-in. Hatch may ask the user first. You receive "filled" or "failed" and never the password. Hatch leaves the form unsubmitted.',
    shape: { username: z.string().optional().describe('Which saved sign-in to use, when the site has more than one.'), timeout_s: timeoutS(50), hatch, intent },
    summary: () => 'fill_credentials',
    async run(a, ctx) {
      const found = await onPage(ctx, a.hatch, async (page) => {
        const site = await siteFor(page.guest.getURL());
        if (!site) throw new HatchError('failed: this Hatch shows no web page.');
        const matches = (await listSignIns()).filter((s) => s.site === site);
        if (matches.length === 0) throw new HatchError(`failed: the user has saved no sign-in for ${site}. Ask them to add one in the Sign-ins panel in Hatch.`);
        const wanted = a.username ? matches.filter((s) => s.username === a.username) : matches;
        if (wanted.length !== 1) throw new HatchError(`failed: ${site} has these saved sign-ins: ${matches.map((s) => s.username).join(', ')}. Pass one as username.`);
        return { signIn: wanted[0] as SignIn, site, hatchId: page.hatchId };
      });

      // The wait for the user runs outside the tab queue, so the agent's other calls stay free.
      if (found.signIn.allow !== 'always') {
        const asked = askConsent({ hatchId: found.hatchId, site: found.site, username: found.signIn.username, agent: ctx.agent.id }, found.signIn.id);
        let ticks = 0;
        const timer = setInterval(() => ctx.progress(`Waiting for the user to answer in Hatch, ${(ticks += 5)} seconds so far.`), 5000);
        const answer = await Promise.race([asked, new Promise<'waiting'>((r) => setTimeout(() => r('waiting'), a.timeout_s * 1000))]).finally(() => clearInterval(timer));
        if (answer === 'waiting') return `Hatch is asking the user whether you may sign in to ${found.site}, and they have not answered yet. Call fill_credentials again to keep waiting.`;
        if (answer === 'refuse') throw new HatchError(`failed: the user refused the sign-in to ${found.site}.`);
        if (answer === 'always') await setAllow(found.signIn.id, 'always');
      }

      return onPage(ctx, found.hatchId, async (page) => {
        if ((await siteFor(page.guest.getURL())) !== found.site) throw new HatchError(`failed: the page left ${found.site} while Hatch waited, so Hatch filled nothing.`);
        return fillSignIn(page, found.signIn);
      });
    },
  }),
];
