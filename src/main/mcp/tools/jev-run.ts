// jev_run hands Jev a goal and lets it take the steps. Jev holds no goal between calls, so Hatch runs the loop:
// each step asks Jev for the next action and for its goal and stuck signals, acts, and records what the page did.
import { z } from 'zod';
import { addressOf, click, fill, outlineOf, pressKey, scroll, selectOption, waitForLoad } from '../../cdp/actions';
import { HatchError, type PageSession } from '../../cdp/session';
import { renderOutline, type OutlineLine } from '../../cdp/snapshot';
import { askJevWithUsage, canAsk } from '../../jev/client';
import { record } from '../../jev/metrics';
import type { ChoiceAnswer } from '../../jev/pick';
import { candidatesFor, changeNote, GATE, nameOf, optionRequest, optionsUnder, readOption, readStep, repeats, resultLine, stepRequest, tooManyFor, USD_PER_INPUT_TOKEN, type JevAction, type Proposal, type Status } from '../../jev/run';
import { onPage } from './page';
import { hatch, intent, tool, type ToolContext } from './types';

const MAX_CONTROLS = 1000;
const FAILS_IN_A_ROW = 3;

const GUIDANCE: Record<Exclude<Status, 'done'>, string> = {
  stuck: 'Read the trace to see where the run stopped. Carry on from final_snapshot with click and fill, or call jev_run again with a plainer goal.',
  max_steps: 'The run used every step without reaching the goal. Split the goal into smaller ones, or carry on from final_snapshot with click and fill.',
  timeout: 'The time ran out. Raise max_seconds or shorten the goal, and call get_console when the page looks broken.',
  error: 'Jev could not be asked. Read error, try once more, then carry on with snapshot, click and fill.',
};

interface Options { goal: string; max_steps: number; max_seconds: number; min_confidence: number; format: 'agent' | 'text' }

async function execute(page: PageSession, p: Proposal, ask: (request: ReturnType<typeof optionRequest>) => Promise<Record<string, ChoiceAnswer>>, goal: string, history: string[], lines: OutlineLine[]): Promise<{ executed: string; said: string }> {
  switch (p.kind) {
    case 'click':
      return { executed: nameOf(p), said: await click(page, p.ref, { brief: true }) };
    case 'type':
      return { executed: nameOf(p), said: `${await fill(page, p.ref, p.text!)} It now holds ${JSON.stringify(p.text)}.` };
    case 'select': {
      const options = optionsUnder(lines, p.ref);
      const picked = readOption(await ask(optionRequest(goal, history, lines, p.line, options)), options);
      if (!picked) throw new HatchError(`Jev found no option in ${p.line} that serves the goal.`);
      return { executed: nameOf(p), said: await selectOption(page, p.ref, picked.option) };
    }
    case 'press_enter':
      return { executed: 'press_enter', said: await pressKey(page, 'Enter', undefined, undefined, true) };
    case 'scroll_down':
    case 'scroll_up':
      return { executed: p.kind, said: await scroll(page, { dy: p.kind === 'scroll_down' ? 700 : -700 }) };
    default:
      throw new HatchError('Jev proposed no action.');
  }
}

async function run(page: PageSession, o: Options, ctx: ToolContext) {
  const started = Date.now();
  const deadline = started + o.max_seconds * 1000;
  const remaining = (): number => deadline - Date.now();
  const actions: JevAction[] = [];
  const history: string[] = [];
  const tokens = { input: 0, output: 0 };
  let calls = 0;
  let status: Status = 'max_steps';
  let error = '';
  let fails = 0;

  const ask = async (request: Parameters<typeof askJevWithUsage>[0]) => {
    const { answers, usage } = await askJevWithUsage(request, Math.max(2000, Math.min(15_000, remaining())));
    calls += 1;
    tokens.input += usage.input_tokens;
    tokens.output += usage.output_tokens;
    return answers;
  };
  const read = async (): Promise<OutlineLine[] | null> => {
    // The outline reads on a page that is still fetching images, so a slow site holds a step for three seconds at most.
    if (page.loading) await waitForLoad(page, Math.max(500, Math.min(3000, remaining())));
    return outlineOf(page).catch(() => null);
  };

  let lines = await read();
  for (let step = 1; step <= o.max_steps; step += 1) {
    if (!lines) {
      status = 'stuck';
      error = page.dialog ? `The page shows a ${page.dialog.kind} dialog: ${JSON.stringify(page.dialog.message)}. Answer it with handle_dialog, then call jev_run again.` : 'The page gave no answer. Call reload, then jev_run again, or call get_console to look for errors.';
      break;
    }
    if (remaining() <= 0) {
      status = 'timeout';
      break;
    }
    if (repeats(actions) || fails >= FAILS_IN_A_ROW) {
      status = 'stuck';
      error = fails >= FAILS_IN_A_ROW ? `${FAILS_IN_A_ROW} actions in a row failed.` : 'The same action ran three times and the page showed no change.';
      break;
    }
    ctx.progress(`Step ${step} of at most ${o.max_steps}.`);
    const candidates = candidatesFor(lines);
    let reading: ReturnType<typeof readStep>;
    try {
      reading = readStep(await ask(stepRequest(o.goal, history, lines, tooManyFor(candidates) ? candidates.slice(0, MAX_CONTROLS) : candidates)), o.goal, lines, candidates);
    } catch (e) {
      if (!(e instanceof HatchError)) throw e;
      status = 'error';
      error = e.message.replace(/ (Until then, call|Call) snapshot and pass ref\.$/, '');
      break;
    }
    if (!reading) {
      status = 'error';
      error = 'Jev sent an answer that does not hold together, such as a goal that is both reached and out of reach. Call jev_run once more, then carry on with snapshot, click and fill.';
      break;
    }
    const p = reading.proposal;
    const action: JevAction = { step, proposed_action: nameOf(p), executed_action: null, detail: '', confidence: round(p.confidence), goal_probability: round(reading.goal), stuck_probability: round(reading.stuck) };
    actions.push(action);

    if (reading.goal > GATE || p.kind === 'done') {
      status = 'done';
      action.detail = reading.goal > GATE ? 'Jev judged the goal reached, so no further action ran.' : 'Jev chose to stop, because it judged the goal reached.';
      break;
    }
    if (reading.stuck > GATE || p.kind === 'none') {
      status = 'stuck';
      action.detail = p.kind === 'none' ? 'Jev found no action on the page that moves toward the goal.' : 'Jev judged the run stuck, so no further action ran.';
      break;
    }
    if (p.confidence < o.min_confidence) {
      status = 'stuck';
      action.detail = `Jev's confidence of ${p.confidence.toFixed(2)} sits under min_confidence ${o.min_confidence}, so Hatch did not act.`;
      break;
    }

    const before = page.guest.getURL();
    const label = 'line' in p ? p.line : action.proposed_action;
    try {
      const done = await execute(page, p, ask, o.goal, history, lines);
      action.executed_action = done.executed;
      const after = await read();
      const moved = page.guest.getURL() !== before;
      const note = moved ? `navigated to ${await addressOf(page)}` : after ? changeNote(lines, after) : 'the page gave no answer';
      action.detail = `${done.said.split(' The page is now ')[0]} The page: ${note}.`;
      const did = p.kind === 'type' ? `typed ${JSON.stringify(p.text)} into ${label}` : p.kind === 'select' ? `chose an option in ${label}` : p.kind === 'click' ? `clicked ${label}` : label;
      history.push(`${step}. ${did} -> ${note}`);
      fails = 0;
      lines = after;
    } catch (e) {
      if (!(e instanceof HatchError)) throw e;
      fails += 1;
      action.detail = `The action failed: ${e.message}`;
      history.push(`${step}. tried ${label} -> failed: ${e.message.slice(0, 160)}`);
      lines = await read();
    }
  }
  if (status === 'timeout' && actions.every((a) => a.executed_action === null)) error = 'The time ran out before any action finished. Raise max_seconds or make the goal simpler.';

  const elapsed = Date.now() - started;
  const cost = tokens.input * USD_PER_INPUT_TOKEN;
  const final = lines ?? (await outlineOf(page).catch(() => null));
  const snapshot = o.format === 'text' ? await page.evaluate<string>("document.body ? document.body.innerText.slice(0, 24000) : ''", 4000).catch(() => '') : final ? renderOutline(final) : '';
  const since = (list: { time: number }[]): boolean => list.length > 0 && list.some((e) => e.time >= started);
  const result = {
    status,
    ...(error ? { error } : {}),
    ...(status === 'done' ? {} : { guidance: GUIDANCE[status] }),
    actions,
    final_url: await addressOf(page).catch(() => page.guest.getURL()),
    ...(since(page.console) ? { console_errors: page.console.filter((c) => c.time >= started && c.level === 'error').map((c) => c.text.slice(0, 300)).slice(-10) } : {}),
    ...(since(page.network) ? { network_errors: page.network.filter((n) => n.time >= started && (n.status ?? 0) >= 400).map((n) => ({ url: n.url.slice(0, 300), status: n.status! })).slice(-10) } : {}),
    cost_usd: Number(cost.toFixed(6)),
    elapsed_ms: elapsed,
    jev_calls: calls,
    tokens_used: tokens,
  };
  const executed = actions.filter((a) => a.executed_action).length;
  await record({ time: new Date(started).toISOString(), host: hostOf(page.guest.getURL()), goal_chars: o.goal.length, status, steps: executed, jev_calls: calls, input_tokens: tokens.input, cost_usd: result.cost_usd, elapsed_ms: elapsed, confidences: actions.map((a) => a.confidence) });
  const line = resultLine(status, executed, cost, elapsed);
  return {
    text: [`jev_run: ${line}.${error ? ` ${error}` : ''}`, JSON.stringify(result, null, 1), o.format === 'text' ? 'final_snapshot, as the text of the page:' : 'final_snapshot, whose references are ready to use:', snapshot].join('\n'),
    activity: { result: line, costUsd: result.cost_usd, trace: actions.map((a) => ({ step: a.step, action: a.executed_action ?? `${a.proposed_action} (not run)`, detail: a.detail, confidence: a.confidence })) },
  };
}

const round = (n: number): number => Math.round(n * 100) / 100;
const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};

export const jevRunTools = [
  tool({
    name: 'jev_run',
    description:
      'Hands a goal to Jev, a fast decision model, which takes the steps on your current page: click, type, choose an option, press Enter and scroll. Use it for a mechanical goal such as searching a site, paging through results or clicking through a known flow. Jev chooses among options and writes nothing, so put every text it must type inside quotes in the goal, such as: search for "espresso machine" and open the first result. The reply holds a status (done, stuck, max_steps, timeout or error), a trace of every step with Jev\'s confidence, what the run cost, and final_snapshot, the agent view with references ready to use. Verify the result before you rely on it. It works once the user has connected Jev in Settings; status says whether it is on. It takes no target and no ref.',
    shape: {
      goal: z.string().min(4).max(600).describe('What the page should reach, in plain words, with every text to type inside quotes.'),
      max_steps: z.number().int().min(1).max(60).default(20).describe('The most steps Jev may take. Default 20.'),
      max_seconds: z.number().min(5).max(600).default(180).describe('The most seconds the run may take. Default 180. Pass less when your agent app limits one call to less.'),
      min_confidence: z.number().min(0).max(1).default(0).describe('Hatch stops before an action Jev is less sure of than this. Default 0, which sets no threshold. 0.8 suits a page you do not trust.'),
      format: z.enum(['agent', 'text']).default('agent').describe('final_snapshot as the agent view, or as the plain text of the page. Default agent.'),
      hatch,
      intent,
    },
    summary: (a) => `jev_run(goal: ${JSON.stringify(a.goal.length > 70 ? `${a.goal.slice(0, 69)}…` : a.goal)}, max_steps: ${a.max_steps ?? 20})`,
    run: (a, ctx) =>
      onPage(ctx, a.hatch, async (page) => {
        if (!(await canAsk())) throw new HatchError('Jev is not connected, so jev_run cannot start. Ask the user to add their TypeSafe key in Hatch under Settings, in "Connect Jev". A key comes from console.typesafe.ai/settings/keys. Until then, use snapshot, click and fill.');
        if (page.tainted) throw new HatchError('Hatch filled a saved sign-in on this page, so no part of the page leaves the Mac until it navigates. Use snapshot, click and fill here.');
        if (page.dialog) throw new HatchError(`The page is showing a ${page.dialog.kind} dialog: ${JSON.stringify(page.dialog.message)}. Answer it with handle_dialog before jev_run.`);
        const { text, activity } = await run(page, { goal: a.goal, max_steps: a.max_steps ?? 20, max_seconds: a.max_seconds ?? 180, min_confidence: a.min_confidence ?? 0, format: a.format ?? 'agent' }, ctx);
        return { text, activity };
      }),
  }),
];
