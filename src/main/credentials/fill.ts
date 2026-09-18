// Fills a saved sign-in into the page. The agent learns whether the fill worked and nothing else.
import type { ConsentAnswer, ConsentRequest, SignIn } from '@shared/signins';
import { fill } from '../cdp/actions';
import { HatchError, type PageSession } from '../cdp/session';
import { push } from '../renderer-rpc';
import { passwordOf } from './store';

// Marks the username and password fields, so the main process can turn each into a reference and type into it as a person would.
const FIND_FIELDS = `(() => {
  const seen = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.disabled && !el.readOnly; };
  document.querySelectorAll('[data-hatch-fill]').forEach((el) => el.removeAttribute('data-hatch-fill'));
  const pass = [...document.querySelectorAll('input[type=password]')].find(seen) || null;
  const scope = (pass && pass.form) || document;
  const texts = [...scope.querySelectorAll('input')].filter((el) => ['text', 'email', 'tel', ''].includes((el.getAttribute('type') || '').toLowerCase()) && seen(el));
  const named = texts.find((el) => /username|email/.test(el.autocomplete || '')) || texts.find((el) => /user|email|login|account/i.test((el.name || '') + ' ' + (el.id || '')));
  const before = pass ? texts.filter((el) => el.compareDocumentPosition(pass) & Node.DOCUMENT_POSITION_FOLLOWING).pop() : null;
  const user = named || before || (pass ? null : texts[0]) || null;
  if (user) user.setAttribute('data-hatch-fill', 'user');
  if (pass) pass.setAttribute('data-hatch-fill', 'pass');
  return { user: !!user, pass: !!pass };
})()`;

async function refOf(page: PageSession, which: 'user' | 'pass'): Promise<string> {
  const { result } = await page.send<{ result: { objectId?: string } }>('Runtime.evaluate', { expression: `document.querySelector('[data-hatch-fill="${which}"]')` });
  const { node } = await page.send<{ node: { backendNodeId: number } }>('DOM.describeNode', { objectId: result.objectId });
  return page.refs.refFor(node.backendNodeId);
}

export async function fillSignIn(page: PageSession, signIn: SignIn): Promise<string> {
  const found = await page.evaluate<{ user: boolean; pass: boolean }>(FIND_FIELDS);
  try {
    if (!found.user && !found.pass) throw new HatchError('failed: this page shows no sign-in form. Navigate to the sign-in page first.');
    // From here the page may hold a secret, so Hatch blocks the agent's scripts and hides field values until the page navigates.
    page.tainted = true;
    if (found.user) await fill(page, await refOf(page, 'user'), signIn.username);
    if (!found.pass) return `filled: the username only. This page has no password field yet, which is how a two-step sign-in starts. Submit the form, then call fill_credentials again.`;
    await fill(page, await refOf(page, 'pass'), await passwordOf(signIn.id));
    return `filled: ${found.user ? 'the username and the password' : 'the password'} for ${signIn.username}. Hatch left the form unsubmitted, so click its sign-in button. Until the page navigates, Hatch hides field values from you and blocks evaluate.`;
  } finally {
    await page.evaluate(`document.querySelectorAll('[data-hatch-fill]').forEach((el) => el.removeAttribute('data-hatch-fill'))`).catch(() => {});
  }
}

// ---- consent: the user answers in Hatch, over the Hatch that holds the sign-in page.

interface Pending { request: ConsentRequest; signInId: string; answer: Promise<ConsentAnswer>; settle(answer: ConsentAnswer): void }
const pending = new Map<string, Pending>();

/** Asks once per Hatch. A second call for the same sign-in joins the question already on screen. */
export function askConsent(request: ConsentRequest, signInId: string): Promise<ConsentAnswer> {
  const open = pending.get(request.hatchId);
  if (open?.signInId === signInId) return open.answer;
  open?.settle('refuse');
  let settle!: (answer: ConsentAnswer) => void;
  const answer = new Promise<ConsentAnswer>((resolve) => (settle = resolve));
  const entry: Pending = {
    request,
    signInId,
    answer,
    settle: (a) => {
      if (pending.get(request.hatchId) === entry) {
        pending.delete(request.hatchId);
        push('consent:state', { hatchId: request.hatchId, request: null });
      }
      settle(a);
    },
  };
  pending.set(request.hatchId, entry);
  push('consent:state', { hatchId: request.hatchId, request });
  return answer;
}

export const answerConsent = (hatchId: string, answer: ConsentAnswer): void => pending.get(hatchId)?.settle(answer);
