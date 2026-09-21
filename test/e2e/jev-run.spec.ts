// An agent hands Jev a goal and Hatch runs the steps. A stand-in plays TypeSafe, so no test calls the real service.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { capture, freshHome, inPages, launch, serveSite } from './helpers';

interface Question { type: string; instructions: string; criteria?: Record<string, string> }
type Plan = (state: string) => { act: string; text?: string; confidence?: number; goal?: number; stuck?: number };

/** Answers each step from a plan that reads the state, the way Jev reads the goal, the steps taken and the outline. */
function standInJev(plan: Plan, costPerCall?: number): Promise<{ url: string; states: string[]; models: string[]; status: { code: number }; close(): Promise<void> }> {
  const states: string[] = [];
  const models: string[] = [];
  const status = { code: 200 };
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const request = JSON.parse(body) as { state: string; model: string; questions: Record<string, Question> };
      models.push(request.model);
      if (request.questions.check) return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ answers: { check: { type: 'noul', noul: 0.99 } }, usage: { input_tokens: 10, output_tokens: 0 } }));
      if (status.code !== 200) return void res.writeHead(status.code).end('{}');
      states.push(request.state);
      const want = plan(request.state);
      const answers: Record<string, unknown> = {};
      for (const [id, q] of Object.entries(request.questions)) {
        if (id === 'goal') answers[id] = { type: 'noul', noul: want.goal ?? 0.03 };
        else if (id === 'stuck') answers[id] = { type: 'noul', noul: want.stuck ?? 0.02 };
        else {
          const wanted = id === 'text' ? want.text : want.act;
          const key = Object.entries(q.criteria ?? {}).find(([k, v]) => k === wanted || v === wanted || (wanted && v.startsWith(wanted)))?.[0] ?? 'none';
          const confidence = want.confidence ?? 0.93;
          answers[id] = { type: 'choice', choice: key, confidence, probabilities: { [key]: confidence } };
        }
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ model: 'stand-in', answers, usage: { input_tokens: 5000, output_tokens: 0, ...(costPerCall === undefined ? {} : { cost: costPerCall }) } }));
    });
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1/systemone`, states, models, status, close: () => new Promise((done) => server.close(() => done())) })));
}

const signIn: Plan = (state) => {
  if (state.includes('heading 1 "Your account"')) return { act: 'done', goal: 0.97 };
  if (!state.includes('typed "kim@studio.example"')) return { act: 'textbox "Email"', text: 'kim@studio.example' };
  if (!state.includes('typed "open-sesame"')) return { act: 'textbox "Password"', text: 'open-sesame' };
  return { act: 'button "Sign in"' };
};

test('jev_run takes a goal through a sign-in form, returns a trace and fresh references, and shows its cost to the user', async () => {
  const site = await serveSite();
  const jev = await standInJev(signIn);
  const home = freshHome();
  const { app, win } = await launch(home, 0, { HATCH_JEV_URL: jev.url, TYPESAFE_API_KEY: '' });
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  const agent = new Client({ name: 'runner', version: '1.0.0' });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=runner`)));
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean }> => {
    const r = (await agent.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
    return { text: r.content[0]!.text, isError: r.isError === true };
  };
  const goal = 'sign in with the email "kim@studio.example" and the password "open-sesame"';

  try {
    expect((await agent.listTools()).tools.map((t) => t.name)).toContain('jev_run');
    await call('navigate', { to: `${site.url}/login.html` });

    // With no key the tool says who must act, and nothing leaves the Mac.
    const keyless = await call('jev_run', { goal });
    expect(keyless.isError).toBe(true);
    expect(keyless.text).toContain('Ask the user to add a TypeSafe key or an OpenRouter key');
    expect(jev.states).toHaveLength(0);
    // It takes a goal alone.
    expect((await call('jev_run', { goal, target: 'the email field' })).isError).toBe(true);

    expect(await win.evaluate("window.hatch.setJevKey('key-for-the-test-9f3a')")).toEqual({ ok: true, value: true });
    expect((await call('status')).text).toContain('jev_run is on');

    const ran = await call('jev_run', { goal, intent: 'Signing in to the test account' });
    expect(ran.isError).toBe(false);
    expect(ran.text).toMatch(/^jev_run: done \(3 steps, \$0\.\d+, \d+\.\ds\)\./);
    const result = JSON.parse(ran.text.slice(ran.text.indexOf('{'), ran.text.indexOf('\nfinal_snapshot'))) as { status: string; actions: { proposed_action: string; executed_action: string | null; detail: string; confidence: number; goal_probability: number; stuck_probability: number }[]; final_url: string; cost_usd: number; jev_calls: number; tokens_used: { input: number }; elapsed_ms: number };
    expect(result.status).toBe('done');
    expect(result.actions.map((a) => a.proposed_action.replace(/e\d+/, 'eN'))).toEqual(['type_eN', 'type_eN', 'click_eN', 'done']);
    expect(result.actions[3]!.executed_action).toBeNull();
    expect(result.actions[2]!.detail).toContain('navigated to');
    expect(result.actions[0]).toMatchObject({ confidence: 0.93, goal_probability: 0.03, stuck_probability: 0.02 });
    expect(result.final_url).toContain('/account.html');
    expect(result.jev_calls).toBe(4);
    expect(result.tokens_used.input).toBe(20_000);
    expect(result.cost_usd).toBeCloseTo(0.00084, 6);
    expect((await inPages<string>(app, "sessionStorage.getItem('signed-in')"))[0]).toBe('kim@studio.example:11');

    // Jev reads the goal, the steps taken and the outline, and never the password as a field value.
    expect(jev.states[2]).toContain('1. typed "kim@studio.example" into textbox "Email"');
    expect(jev.states[2]).not.toMatch(/value "open-sesame"/);

    // The final snapshot carries references the agent uses at once.
    const snapshot = ran.text.slice(ran.text.indexOf('final_snapshot'));
    expect(snapshot).toContain('heading 1 "Your account"');
    const ref = snapshot.match(/heading 1 "Your account" \[(e\d+)\]/)![1]!;
    expect((await call('get_element', { ref })).isError).toBe(false);

    // The user sees the call, its result with the cost, the trace and the session's spend.
    await win.getByRole('tab', { name: 'Activity' }).click();
    const entry = win.getByTestId('activity-entry').filter({ hasText: 'jev_run(goal:' }).last();
    await expect(entry).toContainText('max_steps: 20');
    await expect(entry.getByTestId('activity-result')).toHaveText(/→ done \(3 steps, \$0\.0008, \d+\.\ds\)/);
    await entry.getByTestId('activity-trace').locator('summary').click();
    await expect(entry.getByTestId('activity-trace').locator('li')).toHaveCount(4);
    await expect(entry.getByTestId('activity-trace')).toContainText('· 0.93');
    await expect(win.getByTestId('jev-spend')).toContainText('Jev ran one goal, which cost $0.0008 in all.');

    const metrics = JSON.parse(readFileSync(join(home, 'jev_metrics.json'), 'utf8')) as { runs: Record<string, unknown>[] };
    expect(metrics.runs).toHaveLength(1);
    expect(metrics.runs[0]).toMatchObject({ status: 'done', steps: 3, jev_calls: 4, goal_chars: goal.length });
    expect(JSON.stringify(metrics)).not.toContain('open-sesame');
  } finally {
    await app.close();
    await site.close();
    await jev.close();
  }
});

test('jev_run stops when Jev is stuck, unsure, out of steps or rate limited, and says what to do next', async () => {
  const site = await serveSite();
  let mode: 'stuck' | 'unsure' | 'loop' | 'muddle' = 'stuck';
  const jev = await standInJev(() => (mode === 'stuck' ? { act: 'none', stuck: 0.94 } : mode === 'unsure' ? { act: 'link "Docs"', confidence: 0.41 } : mode === 'muddle' ? { act: 'link "Docs"', goal: 0.95, stuck: 0.95 } : { act: 'scroll_down' }));
  const home = freshHome();
  const { app, win } = await launch(home, 0, { HATCH_JEV_URL: jev.url });
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  const agent = new Client({ name: 'runner', version: '1.0.0' });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=runner`)));
  const call = async (args: Record<string, unknown>): Promise<string> => ((await agent.callTool({ name: 'jev_run', arguments: args })) as { content: { text: string }[] }).content[0]!.text;

  try {
    await win.evaluate("window.hatch.setJevKey('key-for-the-test')");
    await agent.callTool({ name: 'navigate', arguments: { to: `${site.url}/index.html` } });

    const stuck = await call({ goal: 'book a flight to Lisbon' });
    expect(stuck).toMatch(/^jev_run: stuck \(0 steps/);
    expect(stuck).toContain('"guidance": "Read the trace');
    expect(stuck).toContain('final_snapshot');

    mode = 'unsure';
    const unsure = await call({ goal: 'open the documentation', min_confidence: 0.8 });
    expect(unsure).toMatch(/^jev_run: stuck/);
    expect(unsure).toContain('sits under min_confidence 0.8, so Hatch did not act');
    expect(unsure).toContain('"executed_action": null');
    expect((await inPages<string>(app, 'location.pathname'))[0]).toBe('/index.html');

    mode = 'loop';
    expect(await call({ goal: 'find the footer', max_steps: 2 })).toMatch(/^jev_run: max_steps \(2 steps/);
    const looped = await call({ goal: 'find the footer' });
    expect(looped).toMatch(/^jev_run: stuck \(3 steps/);
    expect(looped).toContain('The same action ran three times');

    mode = 'muddle';
    expect(await call({ goal: 'open the documentation' })).toContain('does not hold together');

    jev.status.code = 429;
    const limited = await call({ goal: 'open the documentation' });
    expect(limited).toMatch(/^jev_run: error/);
    expect(limited).toContain('TypeSafe limited the rate of calls. Try again in 30 seconds to a minute.');
  } finally {
    await app.close();
    await site.close();
    await jev.close();
  }
});

test('Settings shows the end of the saved key and tests the connection', async () => {
  const jev = await standInJev(() => ({ act: 'none' }));
  const home = freshHome();
  const { app, win } = await launch(home, 0, { HATCH_JEV_URL: jev.url });
  try {
    await win.getByRole('tab', { name: 'Settings' }).click();
    await win.getByTestId('jev-key').fill('key-for-the-test-9f3a');
    await win.getByTestId('jev-save').click();
    await expect(win.getByTestId('jev-hint')).toHaveText('The saved TypeSafe key ends in ••••9f3a');
    await win.getByTestId('jev-test').click();
    await expect(win.getByTestId('jev-test-ok')).toHaveText('Jev answered, so the connection works.');
    await jev.close();
    await win.getByTestId('jev-test').click();
    await expect(win.getByTestId('jev-test-error')).toContainText('Hatch could not reach Jev');
  } finally {
    await app.close();
  }
});

test('a user who updates sees one note about Jev, and closing it keeps it away', async () => {
  const home = freshHome();
  writeFileSync(join(home, 'settings.json'), JSON.stringify({ guideSeen: true }));
  const { app, win } = await launch(home, 0, { HATCH_GUIDE: '1' });
  try {
    await expect(win.getByTestId('whats-new')).toContainText('Jev clicks for your agent');
    await capture(app, 'test-results/screens/21-whats-new.png');
    await win.getByTestId('whats-new-close').click();
    await expect(win.getByTestId('whats-new')).toHaveCount(0);
    await expect.poll(() => JSON.parse(readFileSync(join(home, 'settings.json'), 'utf8')).jevRunSeen).toBe(true);
  } finally {
    await app.close();
  }
});

test('an OpenRouter key sends the same questions under OpenRouter\'s model name, and the run adds up the cost OpenRouter states', async () => {
  const site = await serveSite();
  const jev = await standInJev(signIn, 0.0005);
  const home = freshHome();
  const { app, win } = await launch(home, 0, { HATCH_JEV_URL: jev.url, TYPESAFE_API_KEY: '', OPENROUTER_API_KEY: '' });
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  const agent = new Client({ name: 'runner', version: '1.0.0' });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=runner`)));
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<string> => ((await agent.callTool({ name, arguments: args })) as { content: { text: string }[] }).content[0]!.text;

  try {
    await win.getByRole('tab', { name: 'Settings' }).click();
    await win.getByTestId('jev-key').fill('sk-or-v1-key-for-the-test-7c2e');
    await win.getByTestId('jev-save').click();
    await expect(win.getByTestId('jev-hint')).toHaveText('The saved OpenRouter key ends in ••••7c2e');

    await call('navigate', { to: `${site.url}/login.html` });
    const reply = await call('jev_run', { goal: 'sign in with the email "kim@studio.example" and the password "open-sesame"' });
    expect(reply).toMatch(/^jev_run: done \(3 steps, \$0\.0020,/);
    expect(new Set(jev.models)).toEqual(new Set(['~typesafe/jev-latest']));
    const result = JSON.parse(reply.slice(reply.indexOf('{'), reply.indexOf('\nfinal_snapshot'))) as { jev_calls: number; cost_usd: number };
    expect(result.cost_usd).toBeCloseTo(result.jev_calls * 0.0005, 6);
  } finally {
    await agent.close().catch(() => undefined);
    await app.close();
    await jev.close();
    await site.close();
  }
});
