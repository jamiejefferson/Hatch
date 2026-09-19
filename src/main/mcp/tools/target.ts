// An act tool takes a reference, or a description that Hatch turns into one with Jev when the user has switched that on.
import { z } from 'zod';
import { outlineOf } from '../../cdp/actions';
import { HatchError, type PageSession } from '../../cdp/session';
import type { OutlineLine } from '../../cdp/snapshot';
import { askJev } from '../../jev/client';
import { candidatesIn, readAnswers, requestFor, SURE, tooMany, type Want } from '../../jev/pick';
import { settingsStore } from '../../store/stores';

export const optionalRef = z.string().optional().describe('Element reference from the agent view, such as e12. Pass ref or target.');
export const target = z.string().min(2).max(300).optional().describe('The element in plain words, such as "the button that refuses optional cookies". Hatch finds it and acts in one call, which saves a snapshot. It needs the user\'s setting "Let Hatch find elements from a description"; status says whether it is on. Pass ref or target.');

export interface Found { ref: string; /** How Hatch names its pick in the reply, or nothing for a plain reference. */ said: string; seen?: OutlineLine[] }

const percent = (p: number): string => p.toFixed(2);

export async function elementFor(page: PageSession, args: { ref?: string; target?: string }, want: Want, verb: string): Promise<Found> {
  if (args.ref && args.target) throw new HatchError('Pass ref or target, never both.');
  if (args.ref) return { ref: args.ref, said: '' };
  if (!args.target) throw new HatchError('Pass ref, which comes from snapshot, or target, which names the element in plain words.');
  if (!(await settingsStore.read()).describeElements) throw new HatchError('Finding an element from a description is switched off. The user can switch it on in Hatch under Settings. Until then, call snapshot and pass ref.');
  if (page.tainted) throw new HatchError('Hatch filled a saved sign-in on this page, so no part of the page leaves the Mac until it navigates. Call snapshot and pass ref.');

  const lines = await outlineOf(page);
  const candidates = candidatesIn(lines, want);
  if (candidates.length === 0) throw new HatchError(`The agent view holds no element to ${verb}. Call snapshot to read the page.`);
  if (tooMany(candidates)) throw new HatchError(`The page holds ${candidates.length} controls, which is more than Hatch sends for one description. Narrow it with find, then pass ref.`);

  const pick = readAnswers(await askJev(requestFor(lines, candidates, args.target, verb)), candidates);
  const closest = pick.runnersUp.map((r) => `  ${r.text} [${r.ref}]  (${percent(r.confidence)})`).join('\n');
  if (!pick.ref) throw new HatchError(`No element in the agent view matches ${JSON.stringify(args.target)}, so Hatch did nothing.${closest ? ` The closest are:\n${closest}\nPass one as ref, or call snapshot.` : ' Call snapshot to read the page.'}`);
  if (pick.confidence < SURE) throw new HatchError(`Hatch is not sure which element matches ${JSON.stringify(args.target)}, so it did nothing. The closest are:\n${closest}\nPass one as ref, or call snapshot.`);
  return { ref: pick.ref, said: `Hatch chose ${pick.text} [${pick.ref}] for ${JSON.stringify(args.target)} (confidence ${percent(pick.confidence)}).`, seen: lines };
}

/** Puts the pick at the front of the reply, where the Activity panel reads its note. */
export const withPick = (found: Found, reply: string): string => (found.said ? `${found.said} ${reply}` : reply);
