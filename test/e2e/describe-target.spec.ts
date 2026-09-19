// An agent names an element in plain words and Hatch acts in one call. A stand-in plays TypeSafe, so no test calls the real service.
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { freshHome, inPages, launch, serveSite } from './helpers';

const inPagesValue = async (app: Parameters<typeof inPages>[0], js: string): Promise<string> => (await inPages<string>(app, js))[0]!;

interface Seen { auth: string; state: string; options: string[]; instructions: string }

/** Chooses the option whose text holds the rule's words, with the rule's confidence. */
function standInJev(rules: { when: RegExp; choose: string; confidence: number }[]): Promise<{ url: string; seen: Seen[]; close(): Promise<void> }> {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.headers.authorization === 'Bearer wrong-key') return void res.writeHead(401).end('{}');
      const request = JSON.parse(body) as { state: string; questions: Record<string, { instructions: string; criteria?: Record<string, string> }> };
      const answers: Record<string, unknown> = {};
      for (const [id, q] of Object.entries(request.questions)) {
        if (!q.criteria) {
          // A yes-or-no question holds once the page's outline carries the words in its rule.
          const rule = rules.find((r) => r.when.test(q.instructions));
          answers[id] = { type: 'noul', noul: rule && request.state.includes(rule.choose) ? rule.confidence : 0.03 };
          continue;
        }
        seen.push({ auth: String(req.headers.authorization), state: request.state, options: Object.values(q.criteria), instructions: q.instructions });
        const rule = rules.find((r) => r.when.test(q.instructions));
        const ref = rule && Object.entries(q.criteria).find(([, text]) => text.includes(rule.choose))?.[0];
        answers[id] = ref ? { type: 'choice', choice: ref, confidence: rule!.confidence, probabilities: { [ref]: rule!.confidence, none: 1 - rule!.confidence } } : { type: 'choice', choice: 'none', confidence: 0.99, probabilities: { none: 0.99 } };
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ model: 'stand-in', answers, usage: { input_tokens: 1, output_tokens: 1 } }));
    });
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1/systemone`, seen, close: () => new Promise((done) => server.close(() => done())) })));
}

test('click and fill take a description, act when sure, and hold back when unsure', async () => {
  const site = await serveSite();
  const jev = await standInJev([
    { when: /documentation/, choose: 'link "Docs"', confidence: 0.97 },
    { when: /email address/, choose: 'textbox "Email"', confidence: 0.95 },
    { when: /cheapest plan/, choose: 'button "Start free trial"', confidence: 0.55 },
  ]);
  const home = freshHome();
  const { app, win } = await launch(home, 0, { HATCH_JEV_URL: jev.url });
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  const agent = new Client({ name: 'describer', version: '1.0.0' });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=describer`)));
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean }> => {
    const r = (await agent.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
    return { text: r.content[0]!.text, isError: r.isError === true };
  };

  try {
    await call('navigate', { to: `${site.url}/index.html` });

    // Switched off, the tool explains itself and nothing leaves the Mac.
    const off = await call('click', { target: 'open the documentation' });
    expect(off.isError).toBe(true);
    expect(off.text).toContain('Jev is not connected');
    expect(jev.seen).toHaveLength(0);

    await win.evaluate('window.hatch.setSettings({ describeElements: true })');
    const keyless = await call('click', { target: 'open the documentation' });
    expect(keyless.text).toContain('Jev is not connected');

    expect(await win.evaluate("window.hatch.setJevKey('key-for-the-test')")).toEqual({ ok: true, value: true });
    expect(existsSync(join(home, 'jev.json'))).toBe(true);
    expect(readFileSync(join(home, 'jev.json'), 'utf8')).not.toContain('key-for-the-test');
    expect((await call('status')).text).toContain('Jev is connected');

    // Below the gate Hatch does nothing and hands back the closest elements.
    const unsure = await call('click', { target: 'start the cheapest plan' });
    expect(unsure.isError).toBe(true);
    expect(unsure.text).toContain('not sure');
    expect(unsure.text).toMatch(/button "Start free trial" \[e\d+\]  \(0\.55\)/);

    // Sure, it clicks, names its pick and brings the new page's outline back.
    const sure = await call('click', { target: 'open the documentation' });
    expect(sure.isError).toBe(false);
    expect(sure.text).toMatch(/^Hatch chose link "Docs" \[e\d+\] for "open the documentation" \(confidence 0\.97\)\. Clicked e\d+\./);
    expect(sure.text).toContain('/docs.html');
    expect(sure.text).toContain('Its agent view starts:');
    expect(jev.seen.at(-1)!.auth).toBe('Bearer key-for-the-test');
    expect(jev.seen.at(-1)!.state).toContain('link "Docs"');

    await call('navigate', { to: `${site.url}/login.html` });
    const filled = await call('fill', { target: 'the email address field', text: 'sam@studio.example' });
    expect(filled.text).toMatch(/^Hatch chose textbox "Email"/);
    // fill offers fields alone.
    expect(jev.seen.at(-1)!.options.some((o) => o.startsWith('button'))).toBe(false);

    expect((await call('click', { ref: 'e1', target: 'anything' })).text).toContain('never both');
    expect((await call('click', {})).text).toContain('Pass ref');
  } finally {
    await app.close();
    await site.close();
    await jev.close();
  }
});

test('a click by reference says what changed in the agent view', async () => {
  const site = await serveSite();
  const home = freshHome();
  const { app } = await launch(home, 0);
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  const agent = new Client({ name: 'reader', version: '1.0.0' });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=reader`)));
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<string> => ((await agent.callTool({ name, arguments: args })) as { content: { text: string }[] }).content[0]!.text;
  try {
    await call('navigate', { to: `${site.url}/index.html` });
    const ref = (await call('snapshot')).split('\n').find((l) => l.includes('link "Docs"'))!.match(/\[(e\d+)\]/)![1]!;
    const said = await call('click', { ref });
    expect(said).toContain('Its agent view starts:');
    expect(said).toMatch(/page ".*"\s+http/);
  } finally {
    await app.close();
    await site.close();
  }
});

test('run_steps fills a form and sends it in one call, and stops where Hatch is unsure', async () => {
  const site = await serveSite();
  const jev = await standInJev([
    { when: /email address/, choose: 'textbox "Email"', confidence: 0.96 },
    { when: /password field/, choose: 'textbox "Password"', confidence: 0.94 },
    { when: /account page is showing/, choose: 'heading 1 "Your account"', confidence: 0.93 },
    { when: /somewhere vague/, choose: 'button "Sign in"', confidence: 0.4 },
  ]);
  const home = freshHome();
  const { app, win } = await launch(home, 0, { HATCH_JEV_URL: jev.url });
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  const agent = new Client({ name: 'stepper', version: '1.0.0' });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=stepper`)));
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<string> => ((await agent.callTool({ name, arguments: args })) as { content: { text: string }[] }).content[0]!.text;

  try {
    await win.evaluate('window.hatch.setSettings({ describeElements: true })');
    await win.evaluate("window.hatch.setJevKey('key-for-the-test')");
    await call('navigate', { to: `${site.url}/login.html` });

    // An unsure step stops the run, and the steps before it stay done.
    const halted = await call('run_steps', { steps: [{ do: 'fill', target: 'the email address field', text: 'sam@studio.example' }, { do: 'click', target: 'somewhere vague' }, { do: 'press_key', key: 'Enter' }] });
    expect(halted).toMatch(/^Ran 1 of 3 steps\./);
    expect(halted).toContain('Hatch stopped at step 2 of 3 (click)');
    expect(halted).toContain('not sure');
    expect((await inPagesValue(app, `document.querySelector('[name=email]').value`))).toBe('sam@studio.example');

    const done = await call('run_steps', {
      steps: [
        { do: 'fill', target: 'the email address field', text: 'kim@studio.example' },
        { do: 'fill', target: 'the password field', text: 'open-sesame' },
        { do: 'press_key', key: 'Enter' },
        { do: 'wait', until: 'the account page is showing' },
      ],
    });
    expect(done).toMatch(/^Ran all 4 steps\./);
    expect(done).toContain('1. Hatch chose textbox "Email"');
    expect(done).toContain('"the account page is showing" holds');
    expect(done).toContain('Its agent view starts:');
    expect(done).toContain('heading 1 "Your account"');

    // wait_for takes the same kind of statement on its own.
    expect(await call('wait_for', { until: 'the account page is showing', timeout_s: 5 })).toContain('holds after');
    // A step with a missing argument stops the run with a plain reason.
    expect(await call('run_steps', { steps: [{ do: 'fill', ref: 'e1' }] })).toContain('A fill step needs text.');
  } finally {
    await app.close();
    await site.close();
    await jev.close();
  }
});

test('the user connects Jev with a Save button, hears about a wrong key, and can disconnect', async () => {
  const jev = await standInJev([]);
  const home = freshHome();
  const { app, win } = await launch(home, 0, { HATCH_JEV_URL: jev.url });
  try {
    await win.getByRole('tab', { name: 'Settings' }).click();
    const section = win.getByTestId('jev');
    await expect(section.getByRole('heading', { name: 'Connect Jev' })).toBeVisible();
    await expect(win.getByTestId('jev-save')).toBeDisabled();

    await win.getByTestId('jev-key').fill('wrong-key');
    await win.getByTestId('jev-save').click();
    await expect(win.getByTestId('jev-error')).toHaveText('Jev did not accept that key. Check it and paste it again.');
    expect(existsSync(join(home, 'jev.json'))).toBe(false);

    await win.getByTestId('jev-key').fill('key-for-the-test');
    await win.getByTestId('jev-save').click();
    await expect(win.getByTestId('jev-connected')).toHaveText('Your key is saved and Jev is connected.');
    await expect.poll(() => JSON.parse(readFileSync(join(home, 'settings.json'), 'utf8')).describeElements).toBe(true);
    expect(readFileSync(join(home, 'jev.json'), 'utf8')).not.toContain('key-for-the-test');

    await win.getByTestId('jev-disconnect').click();
    await expect(win.getByTestId('jev-key')).toBeVisible();
    await expect.poll(() => JSON.parse(readFileSync(join(home, 'settings.json'), 'utf8')).describeElements).toBe(false);
  } finally {
    await app.close();
    await jev.close();
  }
});
