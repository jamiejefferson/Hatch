// An agent names an element in plain words and Hatch acts in one call. A stand-in plays TypeSafe, so no test calls the real service.
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { freshHome, launch, serveSite } from './helpers';

interface Seen { auth: string; state: string; options: string[]; instructions: string }

/** Chooses the option whose text holds the rule's words, with the rule's confidence. */
function standInJev(rules: { when: RegExp; choose: string; confidence: number }[]): Promise<{ url: string; seen: Seen[]; close(): Promise<void> }> {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const request = JSON.parse(body) as { state: string; questions: Record<string, { instructions: string; criteria: Record<string, string> }> };
      const answers: Record<string, unknown> = {};
      for (const [id, q] of Object.entries(request.questions)) {
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
    expect(off.text).toContain('switched off');
    expect(jev.seen).toHaveLength(0);

    await win.evaluate('window.hatch.setSettings({ describeElements: true })');
    const keyless = await call('click', { target: 'open the documentation' });
    expect(keyless.text).toContain('holds no TypeSafe key');

    expect(await win.evaluate("window.hatch.setJevKey('key-for-the-test')")).toEqual({ ok: true, value: true });
    expect(existsSync(join(home, 'jev.json'))).toBe(true);
    expect(readFileSync(join(home, 'jev.json'), 'utf8')).not.toContain('key-for-the-test');
    expect((await call('status')).text).toContain('Finding elements from a description is on');

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
