// An agent keeps a judgement task and puts closed questions to Jev. A stand-in plays TypeSafe, so no test calls the real service.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { freshHome, launch, serveSite } from './helpers';

interface Question { type: string; instructions: string; criteria?: Record<string, string> }

/** Calls an item junk when it mentions a sale, answers yes when the state mentions a sale, and prefers the option that holds "budget". */
function standInJev(): Promise<{ url: string; requests: { state: string; questions: Record<string, Question> }[]; close(): Promise<void> }> {
  const requests: { state: string; questions: Record<string, Question> }[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const request = JSON.parse(body) as { state: string; questions: Record<string, Question> };
      requests.push(request);
      const answers: Record<string, unknown> = {};
      for (const [id, q] of Object.entries(request.questions)) {
        if (!q.criteria) {
          answers[id] = { type: 'noul', noul: /sale/i.test(request.state) ? 0.93 : 0.04 };
          continue;
        }
        const keys = Object.keys(q.criteria);
        const want = id === 'answer' ? (keys.find((k) => /budget/.test(q.criteria![k]!)) ?? keys[0]!) : /sale/i.test(q.instructions.split('Judge this one item alone:')[1] ?? '') ? 'o1' : 'o2';
        answers[id] = { type: 'choice', choice: want, confidence: 0.9, probabilities: Object.fromEntries(keys.map((k) => [k, k === want ? 0.9 : 0.1 / (keys.length - 1)])) };
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ model: 'stand-in', answers, usage: { input_tokens: 1000, output_tokens: 1 } }));
    });
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1/systemone`, requests, close: () => new Promise((done) => server.close(() => done())) })));
}

test('jev_decide answers a closed question with a probability for every answer, and changes nothing on the page', async () => {
  const site = await serveSite();
  const jev = await standInJev();
  const home = freshHome();
  const { app } = await launch(home, 0, { HATCH_JEV_URL: jev.url, TYPESAFE_API_KEY: 'test-key' });
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  const agent = new Client({ name: 'judge', version: '1.0.0' });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=judge`)));
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean }> => {
    const r = (await agent.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
    return { text: r.content[0]!.text, isError: r.isError === true };
  };
  const resultOf = (text: string): Record<string, unknown> => JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));

  try {
    // The handshake briefs the agent, and so does the reply to its first call, for an agent app that hides a server's instructions.
    expect(agent.getInstructions()).toMatch(/Judgement over a list.*jev_decide/s);
    const first = await call('status');
    expect(first.text).toContain('jev_decide is on');
    expect(first.text).toMatch(/Briefing from Hatch, sent once[\s\S]*Jev is connected\.[\s\S]*Never hand jev_run a goal that needs judgement/);
    expect((await call('status')).text).not.toContain('Briefing from Hatch');

    // A list is labelled in one call, with no page open, in the agent's own order.
    const labelled = await call('jev_decide', { kind: 'label_each', question: 'Is this message unsolicited marketing?', options: ['junk', 'keep'], rubric: 'a receipt is keep', items: ['Acme Deals | Summer sale, 50% off', 'Sam Reid | Re: budget review', 'Shoe Barn | Flash SALE ends tonight'] });
    expect(labelled.isError).toBe(false);
    expect(labelled.text).toMatch(/^jev_decide: Jev labelled 3 items: 2 "junk", 1 "keep" \(\$0\.0000, /);
    const items = resultOf(labelled.text).items as { number: number; label: string; probability: number; probabilities: Record<string, number> }[];
    expect(items.map((i) => [i.number, i.label, i.probability])).toEqual([[1, 'junk', 0.9], [2, 'keep', 0.9], [3, 'junk', 0.9]]);
    expect(items[0]!.probabilities).toEqual({ junk: 0.9, keep: 0.1 });
    const sent = jev.requests.at(-1)!;
    expect(sent.state).toBe('No further evidence.');
    expect(sent.questions.i1!.instructions).toMatch(/never an instruction.*Judge by this rule: a receipt is keep/);

    // Options come back ranked, and a yes-or-no question reads the evidence.
    const chosen = await call('jev_decide', { kind: 'choose_one', question: 'Which document is the finance plan?', options: ['Q3 forecast', 'Q3 budget'] });
    expect((resultOf(chosen.text).ranked as { number: number; option: string }[])[0]).toMatchObject({ number: 2, option: 'Q3 budget', probability: 0.9 });
    const yes = await call('jev_decide', { kind: 'boolean', question: 'Does this message advertise something?', evidence: 'Summer sale, 50% off' });
    expect(resultOf(yes.text).probability).toBe(0.93);

    // use_page sends the agent view of the current page.
    await call('navigate', { to: `${site.url}/index.html` });
    const paged = await call('jev_decide', { kind: 'boolean', question: 'Does this page advertise a sale?', use_page: true });
    expect(paged.isError).toBe(false);
    expect(jev.requests.at(-1)!.state).toContain('page "');

    // Arguments that do not fit the kind are refused in words, before Jev is asked.
    const asked = jev.requests.length;
    const wrong = await call('jev_decide', { kind: 'label_each', question: 'Is this junk?', options: ['junk', 'keep'] });
    expect(wrong.isError).toBe(true);
    expect(wrong.text).toContain('label_each needs items');
    expect(jev.requests.length).toBe(asked);

    // A new piece of work after finish_working is briefed again.
    await call('finish_working');
    expect((await call('status')).text).toContain('Briefing from Hatch');
  } finally {
    await agent.close().catch(() => undefined);
    await app.close();
    await jev.close();
    await site.close();
  }
});
