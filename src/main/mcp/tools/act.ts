import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { click, ensureNoDialog, fill, handleDialog, hover, pressKey, scroll, selectOption } from '../../cdp/actions';
import { HatchError } from '../../cdp/session';
import { hatchHome } from '../../paths';
import { settingsStore } from '../../store/stores';
import { onPage } from './page';
import { elementFor, optionalRef as ref, target, withPick } from './target';
import { hatch, intent, tool } from './types';

/** Writes a long evaluate result to ~/.hatch/results, so the agent reads it from disk in one go. */
async function saveResult(text: string, ext: string): Promise<string> {
  const dir = join(hatchHome(), 'results');
  await mkdir(dir, { recursive: true });
  const file = join(dir, `evaluate-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${Math.random().toString(36).slice(2, 6)}.${ext}`);
  await writeFile(file, text);
  return file;
}

/** The element as the Activity panel names it: the reference, or the description in quotes. */
const named = (a: { ref?: string; target?: string }): string => a.ref ?? JSON.stringify(a.target ?? '');

export const actTools = [
  tool({
    name: 'click',
    description: 'Clicks an element with a real mouse event. Name it by ref, or by target in plain words. Hatch scrolls it into view first and refuses when another element covers it. The reply says what changed in the agent view.',
    shape: { ref, target, double: z.boolean().default(false).describe('Double-click.'), hatch, intent },
    summary: (a) => `click ${named(a)}`,
    run: (a, ctx) =>
      onPage(ctx, a.hatch, async (page) => {
        const found = await elementFor(page, a, 'any', 'click');
        return withPick(found, await click(page, found.ref, { double: a.double, seen: found.seen }));
      }),
  }),
  tool({
    name: 'fill',
    description: 'Replaces the text in a field. Works with fields that a framework controls. An empty string clears the field. The reply lists what the typing brought up, such as a list of suggestions with their references, so click the suggestion you want straight from the reply. A field that suggests rarely accepts the typed text alone.',
    shape: { ref, target, text: z.string().describe('The text the field should hold.'), hatch, intent },
    summary: (a) => `fill ${named(a)}`,
    run: (a, ctx) =>
      onPage(ctx, a.hatch, async (page) => {
        const found = await elementFor(page, a, 'field', 'type into');
        return withPick(found, await fill(page, found.ref, a.text));
      }),
  }),
  tool({
    name: 'select_option',
    description: 'Chooses an option in a native dropdown by its label or value. A custom dropdown is a button: click it, take a snapshot, then click the option.',
    shape: { ref, target, option: z.string().describe('The option\'s label, or its value.'), hatch, intent },
    summary: (a) => `select_option ${named(a)} ${JSON.stringify(a.option)}`,
    run: (a, ctx) =>
      onPage(ctx, a.hatch, async (page) => {
        const found = await elementFor(page, a, 'dropdown', 'choose an option in');
        return withPick(found, await selectOption(page, found.ref, a.option));
      }),
  }),
  tool({
    name: 'press_key',
    description: 'Presses a key or a chord in the page, such as Enter, Tab, Escape, ArrowDown, a, Meta+a or Shift+Tab.',
    shape: { key: z.string().describe('Key name, with modifiers joined by +.'), ref: z.string().optional().describe('Focus this element first.'), hatch, intent },
    summary: (a) => `press_key ${a.key}`,
    run: (a, ctx) => onPage(ctx, a.hatch, (page) => pressKey(page, a.key, a.ref)),
  }),
  tool({
    name: 'hover',
    description: 'Moves the pointer over an element, which opens hover menus and tooltips.',
    shape: { ref, target, hatch, intent },
    summary: (a) => `hover ${named(a)}`,
    run: (a, ctx) =>
      onPage(ctx, a.hatch, async (page) => {
        const found = await elementFor(page, a, 'any', 'hover over');
        return withPick(found, await hover(page, found.ref));
      }),
  }),
  tool({
    name: 'scroll',
    description: 'Scrolls the page: to an element, to the top or bottom, or by a number of pixels. With nothing passed it scrolls down 600 pixels. click and fill already scroll their element into view.',
    shape: { ref: z.string().optional().describe('Scroll this element to the middle of the viewport.'), to: z.enum(['top', 'bottom']).optional(), dy: z.number().optional().describe('Pixels to scroll down. A negative number scrolls up.'), hatch, intent },
    summary: (a) => `scroll ${a.ref ?? a.to ?? a.dy ?? 600}`,
    run: (a, ctx) => onPage(ctx, a.hatch, (page) => scroll(page, a)),
  }),
  tool({
    name: 'handle_dialog',
    description: 'Answers the JavaScript dialog (alert, confirm, prompt) a page has open. While one is open every other page tool returns an error that names it.',
    shape: { accept: z.boolean().describe('true presses OK. false presses Cancel.'), text: z.string().optional().describe('The answer to a prompt.'), hatch, intent },
    summary: (a) => `handle_dialog ${a.accept ? 'accept' : 'dismiss'}`,
    run: (a, ctx) => onPage(ctx, a.hatch, (page) => handleDialog(page, a.accept, a.text)),
  }),
  tool({
    name: 'evaluate',
    description: 'Runs JavaScript in the page and returns the result. A result longer than max_chars arrives cut, and Hatch saves the whole of it to a file whose path the reply gives, so read a long text in one call and never in chunks. Off by default: the user turns it on in Hatch\'s settings. Hatch also blocks it after it fills a saved sign-in, until the page navigates.',
    shape: {
      expression: z.string().describe('An expression. Its value must serialise to JSON.'),
      max_chars: z.number().int().min(500).max(200000).default(20000).describe('Where to cut the result in the reply. The file holds all of it.'),
      hatch,
      intent,
    },
    summary: () => 'evaluate',
    run: (a, ctx) =>
      onPage(ctx, a.hatch, async (page) => {
        if (!(await settingsStore.read()).allowEvaluate) throw new HatchError('Running script in pages is switched off. The user can switch it on in Hatch under Settings. snapshot, find, get_console and get_network cover most needs without it.');
        if (page.tainted) throw new HatchError('Hatch filled a saved sign-in on this page, so it blocks page scripting here until the page navigates.');
        ensureNoDialog(page);
        const value = await page.evaluate<unknown>(a.expression, 15000);
        // A string returns as itself, so a saved text reads as the page had it.
        const text = value === undefined ? 'undefined' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
        if (text.length <= a.max_chars) return typeof value === 'string' ? JSON.stringify(value) : text;
        const file = await saveResult(text, typeof value === 'string' ? 'txt' : 'json');
        return `${text.slice(0, a.max_chars)}\n… cut at ${a.max_chars.toLocaleString('en-GB')} of ${text.length.toLocaleString('en-GB')} characters. The whole result is saved at ${file}.`;
      }),
  }),
];
