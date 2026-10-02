// Fewer turns for an agent: a reply that waits for the page's answer, run_steps that covers a whole flow, and a long script result saved to a file.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { freshHome, launch, serveSite } from './helpers';

test('a click reply carries what a slow request drew, run_steps covers a whole flow, and a long evaluate result lands in a file', async () => {
  const site = await serveSite();
  const home = freshHome();
  writeFileSync(join(home, 'settings.json'), JSON.stringify({ allowEvaluate: true }));
  const { app } = await launch(home, 0);
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  const agent = new Client({ name: 'turns', version: '1.0.0' });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=turns`)));
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean }> => {
    const r = (await agent.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
    return { text: r.content[0]!.text, isError: r.isError === true };
  };

  try {
    const page = await call('navigate', { to: `${site.url}/search.html` });
    const field = /\[(e\d+)\][^\n]*"Query"/.exec(page.text)?.[1] ?? /textbox[^\n]*\[(e\d+)\]/.exec(page.text)?.[1];
    const button = /button "Search"[^\n]*\[(e\d+)\]/.exec(page.text)?.[1] ?? /\[(e\d+)\][^\n]*button "Search"/.exec(page.text)?.[1];
    expect(field, page.text).toBeTruthy();
    expect(button, page.text).toBeTruthy();

    // The server answers 800 ms after the click, and the reply still shows the results.
    await call('fill', { ref: field, text: 'blue' });
    const clicked = await call('click', { ref: button });
    expect(clicked.text).toContain('First result for blue');

    // One call opens the page afresh, searches, waits, checks, scrolls and reads.
    const run = await call('run_steps', {
      steps: [
        { do: 'navigate', to: `${site.url}/search.html` },
        { do: 'fill', ref: 'e1', text: 'ignored' },
      ],
    });
    // A reference from before the navigation names nothing on the new page, so the run stops there and says so.
    expect(run.text).toContain('Ran 1 of 2 steps.');
    expect(run.text).toContain('Loaded');

    const fresh = await call('snapshot');
    const f2 = /textbox[^\n]*\[(e\d+)\]/.exec(fresh.text)?.[1] ?? /\[(e\d+)\][^\n]*textbox/.exec(fresh.text)?.[1];
    const b2 = /button "Search"[^\n]*\[(e\d+)\]/.exec(fresh.text)?.[1] ?? /\[(e\d+)\][^\n]*button "Search"/.exec(fresh.text)?.[1];
    const flow = await call('run_steps', {
      steps: [
        { do: 'fill', ref: f2, text: 'green' },
        { do: 'click', ref: b2 },
        { do: 'wait', text: 'First result for green', timeout_s: 5 },
        { do: 'wait', text_gone: 'Searching', timeout_s: 5 },
        { do: 'scroll', to: 'bottom' },
        { do: 'read' },
      ],
    });
    expect(flow.text).toContain('Ran all 6 steps.');
    expect(flow.text).toContain('The page reads:');
    expect(flow.text).toContain('Second result for green');
    expect(flow.text).toMatch(/The page sits at [1-9]\d* of/);

    // A wait that does not hold stops the run before the step after it.
    const checked = await call('run_steps', { steps: [{ do: 'wait', text: 'No such words', timeout_s: 1 }, { do: 'click', ref: b2 }] });
    expect(checked.text).toContain('Ran 0 of 2 steps.');

    // A long result arrives cut, and the whole of it sits in the file the reply names.
    const long = await call('evaluate', { expression: "'x'.repeat(50000)", max_chars: 1000 });
    const file = /saved at (\S+?\.txt)\./.exec(long.text)?.[1];
    expect(file, long.text).toBeTruthy();
    expect(existsSync(file!)).toBe(true);
    expect(readFileSync(file!, 'utf8')).toHaveLength(50000);
    expect((await call('evaluate', { expression: "'short'" })).text).toBe('"short"');
  } finally {
    await agent.close();
    await app.close();
    await site.close();
  }
});
