// Captures the agent-facing states: the agent view beside the page, a view request, a page dialog and the Activity panel.
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { test } from '@playwright/test';
import { capture, freshHome, launch, serveSite } from './helpers';

const OUT = process.env.HATCH_SCREENS ?? 'test-results/screens';

test('capture the agent-facing states', async () => {
  mkdirSync(OUT, { recursive: true });
  const site = await serveSite();
  const home = freshHome();
  const { app, win } = await launch(home);
  try {
    const url = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8')).url;
    const agent = new Client({ name: 'screens', version: '1.0.0' });
    await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=screens`)));
    const call = (name: string, args: Record<string, unknown> = {}) => agent.callTool({ name, arguments: args });

    await win.getByRole('tab', { name: 'Activity' }).click();
    await capture(app, `${OUT}/5-activity-empty.png`);

    await call('navigate', { to: `${site.url}/index.html`, intent: 'Open the pricing page.' });
    await call('open_hatch', { to: `${site.url}/contact.html`, width: 896, height: 896, intent: 'Open the contact form beside it.' });
    await call('snapshot', { intent: 'Read the contact form.' });
    await call('set_view', { view: 'agent', reason: 'The Team size field reads oddly in the outline. Take a look before I change it.', intent: 'Show how the form reads.' });
    await win.waitForTimeout(400);
    await capture(app, `${OUT}/6-view-request.png`);

    await win.getByTestId('view-request').getByRole('button', { name: 'Show the agent view' }).click();
    await win.getByTestId('sidebar-toggle').click();
    await win.waitForTimeout(500);
    await capture(app, `${OUT}/7-compare-agent-view.png`);
    await win.getByTestId('sidebar-toggle').click();

    const outline = ((await call('snapshot')) as { content: { text: string }[] }).content[0]!.text;
    const ref = outline.split('\n').find((l) => l.includes('button "Delete draft"'))!.match(/\[(e\d+)\]/)![1];
    await call('click', { ref, intent: 'Delete the draft to test the confirm step.' });
    // The view switch sits in the Hatch panel, so the second Hatch is selected from the panel's list first.
    await win.getByTestId('panel-hatch').click();
    await win.getByTestId('hatch-list').locator('.hatch-row').last().click();
    await win.locator('[data-testid^="view-page-"]').click();
    await win.getByTestId('sidebar-toggle').click();
    await win.waitForTimeout(400);
    await capture(app, `${OUT}/8-page-dialog.png`);
    await agent.close();
  } finally {
    await app.close();
    await site.close();
  }
});
