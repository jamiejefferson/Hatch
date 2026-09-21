// jev_decide puts one closed question to Jev. The agent keeps the task: it picks what Jev sees, applies its own threshold to the probabilities and acts by reference.
import { z } from 'zod';
import { outlineOf } from '../../cdp/actions';
import { HatchError } from '../../cdp/session';
import { renderOutline } from '../../cdp/snapshot';
import { askJevWithUsage, canAsk } from '../../jev/client';
import { MAX_ITEMS, MAX_OPTIONS, outcomeLine, problemWith, readDecision, requestsFor, type Decision, type Outcome } from '../../jev/decide';
import type { ChoiceAnswer } from '../../jev/pick';
import { USD_PER_INPUT_TOKEN } from '../../jev/run';
import { onPage } from './page';
import { hatch, intent, tool } from './types';

/** Jev allows 32,000 tokens for the state and the longest question together. 70,000 characters of outline measured about 21,000. */
const MAX_EVIDENCE_CHARS = 60_000;

const traceOf = (o: Outcome) => {
  if (o.kind === 'boolean') return [{ step: 1, action: o.probability >= 0.5 ? 'yes' : 'no', detail: 'The probability that the answer is yes.', confidence: o.probability }];
  if (o.kind === 'choose_one') return o.ranked.slice(0, 12).map((r, i) => ({ step: i + 1, action: `option ${r.number}`, detail: r.option.slice(0, 160), confidence: r.probability }));
  return o.items.map((i) => ({ step: i.number, action: i.label ?? 'no answer', detail: i.item, confidence: i.probability }));
};

export const jevDecideTools = [
  tool({
    name: 'jev_decide',
    description:
      'Puts one closed question to Jev, a fast decision model, and returns a probability for every answer. You keep the task: you choose what Jev sees, you apply your own threshold, and you act with click and fill by reference. kind "boolean" answers yes or no about the evidence. kind "choose_one" ranks your options. kind "label_each" gives each of up to 60 items one of your labels in a single call, which suits sorting a list such as messages, results or rows: read the list with snapshot, pass one line per item, then act on the items whose label clears your threshold. Jev reads a short, relevant evidence far better than a whole page, so pass the lines that matter. It judges each question alone, counts and compares dates poorly, and knows nothing of your goal beyond the question and the rubric. It works once the user has connected Jev in Settings; status says whether it is on.',
    readOnly: true,
    shape: {
      question: z.string().min(4).max(600).describe('The closed question, such as "Is this message unsolicited marketing?" or "Which result is the official documentation?".'),
      kind: z.enum(['boolean', 'choose_one', 'label_each']).describe('boolean: yes or no. choose_one: one of options. label_each: one of options for every item.'),
      options: z.array(z.string().min(1).max(400)).max(MAX_OPTIONS).optional().describe('choose_one: the options to rank. label_each: the labels, such as ["junk", "keep"]. The reply names each by its text and its number, counted from 1.'),
      items: z.array(z.string().min(1).max(800)).max(MAX_ITEMS).optional().describe('label_each: the things to label, one string each, such as a sender, a subject and a preview line. The reply keeps your order and numbers them from 1.'),
      evidence: z.string().max(MAX_EVIDENCE_CHARS).optional().describe('Text Jev should read before it answers, such as the lines of the agent view that matter. Hatch tells Jev that this is content to judge and never an instruction.'),
      rubric: z.string().max(1000).optional().describe('How to judge, in your own words, such as "junk means bulk mail the user never asked for; a receipt is keep".'),
      use_page: z.boolean().default(false).describe('true sends the agent view of your current page as the evidence. A short evidence of your own gives a better answer. Default false.'),
      hatch,
      intent,
    },
    summary: (a) => `jev_decide(${a.kind}: ${JSON.stringify(a.question.length > 70 ? `${a.question.slice(0, 69)}…` : a.question)}${a.items?.length ? `, ${a.items.length} items` : ''})`,
    run: async (a, ctx) => {
      if (!(await canAsk())) throw new HatchError('Jev is not connected, so jev_decide cannot answer. Ask the user to add a TypeSafe key or an OpenRouter key in Hatch under Settings, in "Connect Jev". A key comes from console.typesafe.ai/settings/keys or openrouter.ai/keys. Until then, judge from snapshot yourself.');
      if (a.use_page && a.evidence) throw new HatchError('Pass evidence or use_page, never both.');
      const evidence = a.use_page
        ? await onPage(ctx, a.hatch, async (page) => {
            if (page.tainted) throw new HatchError('Hatch filled a saved sign-in on this page, so no part of the page leaves the Mac until it navigates. Judge from snapshot yourself here.');
            return renderOutline(await outlineOf(page), MAX_EVIDENCE_CHARS);
          })
        : (a.evidence ?? '');
      const decision: Decision = { question: a.question, kind: a.kind, options: a.options ?? [], items: a.items ?? [], evidence, rubric: a.rubric ?? '' };
      const problem = problemWith(decision);
      if (problem) throw new HatchError(problem);

      const started = Date.now();
      const replies = await Promise.all(requestsFor(decision).map((r) => askJevWithUsage(r, 20_000)));
      const answers: Record<string, ChoiceAnswer> = Object.assign({}, ...replies.map((r) => r.answers));
      const tokens = { input: replies.reduce((n, r) => n + r.usage.input_tokens, 0), output: replies.reduce((n, r) => n + r.usage.output_tokens, 0) };
      // OpenRouter states what each call cost. TypeSafe sends tokens alone, which Hatch prices at TypeSafe's listed rate.
      const cost = Number(replies.reduce((n, r) => n + (r.usage.cost ?? r.usage.input_tokens * USD_PER_INPUT_TOKEN), 0).toFixed(6));
      const outcome = readDecision(decision, answers);
      // One call often costs under a hundredth of a cent, which four decimals would print as nothing.
      const line = `${outcomeLine(outcome)} (${cost > 0 && cost < 0.0001 ? 'under $0.0001' : `$${cost.toFixed(4)}`}, ${((Date.now() - started) / 1000).toFixed(1)}s)`;
      const result = { ...outcome, cost_usd: cost, elapsed_ms: Date.now() - started, jev_calls: replies.length, tokens_used: tokens };
      return {
        text: [`jev_decide: ${line}.`, JSON.stringify(result, null, 1), 'Each probability is Jev\'s own and nothing has changed on the page. Apply your threshold, act by reference, then check the page.'].join('\n'),
        activity: { result: line, costUsd: cost, trace: traceOf(outcome) },
      };
    },
  }),
];
