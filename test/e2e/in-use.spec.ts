// The user sees which Hatch an agent is using, who uses it, and the element each action lands on.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { capture, freshHome, launch, serveSite } from './helpers';

test('a Hatch an agent uses wears an outline and a chip, and each action marks its element on the page and in the agent view', async () => {
  const site = await serveSite();
  const home = freshHome();
  const { app, win } = await launch(home, 0);
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  const agent = new Client({ name: 'fox', version: '1.0.0' });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=fox`)));
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<string> => ((await agent.callTool({ name, arguments: args })) as { content: { text: string }[] }).content[0]!.text;

  try {
    await call('navigate', { to: `${site.url}/login.html`, intent: 'I am signing in to check the account page.' });
    const chip = win.locator('[data-testid^="in-use-chip-"]');
    await expect(chip).toContainText('fox is using this Hatch');
    await expect(chip).toContainText('I am signing in to check the account page.');
    await expect(win.locator('.hatch-border.working')).toHaveCount(1);
    // The sparkle sits on the border of the Hatch in use and moves along it.
    const sparkle = win.locator('[data-testid^="sparkle-"]');
    await expect(sparkle).toHaveCount(1);
    const edge = (await win.locator('.hatch-border.working').boundingBox())!;
    const at = (await sparkle.boundingBox())!;
    const cx = at.x + at.width / 2;
    const cy = at.y + at.height / 2;
    const onEdge = [cx - edge.x, edge.x + edge.width - cx, cy - edge.y, edge.y + edge.height - cy].some((d) => Math.abs(d) < 4);
    expect(onEdge).toBe(true);
    await win.waitForTimeout(400);
    const later = (await sparkle.boundingBox())!;
    expect(Math.abs(later.x - at.x) + Math.abs(later.y - at.y)).toBeGreaterThan(2);

    const view = await call('snapshot');
    const email = view.match(/textbox "Email".*\[(e\d+)\]/)![1]!;
    await call('fill', { ref: email, text: 'kim@studio.example' });
    const mark = win.locator('[data-testid^="agent-act-"]');
    await expect(mark).toHaveCount(1);
    const box = await mark.boundingBox();
    expect(box!.width).toBeGreaterThan(80);
    await capture(app, 'test-results/screens/22-agent-in-use.png');
    // The mark leaves on its own.
    await expect(mark).toHaveCount(0, { timeout: 4000 });

    // In the agent view the same action marks its line.
    await win.locator('[data-testid^="header-"]').first().click();
    await win.locator('[data-testid^="view-agent-"]').click();
    await expect(win.locator('.agent-view')).toBeVisible();
    await call('fill', { ref: email, text: 'sam@studio.example' });
    await expect(win.locator('.agent-line.acted')).toContainText('textbox "Email"');

    // finish_working clears the outline and the chip.
    await call('finish_working');
    await expect(chip).toHaveCount(0);
    await expect(win.locator('.hatch-border.working')).toHaveCount(0);
    await expect(sparkle).toHaveCount(0);
  } finally {
    await agent.close().catch(() => undefined);
    await app.close();
    await site.close();
  }
});
