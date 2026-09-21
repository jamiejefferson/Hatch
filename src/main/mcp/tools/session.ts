import { z } from 'zod';
import { app } from 'electron';
import { finish, hatchFor, UNNAMED } from '../../agents/agents';
import { logPath } from '../../agents/activity';
import { pageFor } from '../../hatches/registry';
import { canAsk, hasKey } from '../../jev/client';
import { settingsStore } from '../../store/stores';
import { GUIDE, TOPICS } from '../guide/topics';
import { intent, tool, type Tool } from './types';

/** Every tool on one page: its arguments, with a question mark on the optional ones, and the first sentence of what it does. */
function toolsPage(tools: Tool[]): string {
  const lines = tools.map((t) => {
    const args = Object.entries(t.shape)
      .filter(([name]) => name !== 'intent')
      .map(([name, schema]) => `${name}${(schema as z.ZodType).isOptional() ? '?' : ''}`);
    return `- ${t.name}(${args.join(', ')}) — ${t.description.split(/(?<=\.)\s/)[0]}`;
  });
  return `# Every Hatch tool\n\nEach tool also takes intent, one sentence on why you are calling, which Hatch shows to the user. A question mark marks an optional argument.\n\n${lines.join('\n')}`;
}

export const sessionTools = [
  tool({
    name: 'status',
    description: 'Start here. Reports your tab, its Hatches (pages on the canvas) and anything that needs attention, such as an open dialog. New to Hatch? Call get_guide with topic "start".',
    shape: { hatch: z.string().optional().describe('A link the user copied in Hatch (hatch:@ and an id), to a Hatch or a whole canvas. Pass it here first and status reports that canvas.'), intent },
    readOnly: true,
    async run(args, ctx) {
      const { tabId, hatchId, state } = await hatchFor(ctx.agent, args.hatch);
      if (args.hatch && hatchId) ctx.agent.hatchId = hatchId;
      ctx.at(tabId, hatchId);
      const tab = state.tabs.find((t) => t.id === tabId)!;
      const lines = [`Hatch ${app.getVersion()}. You are agent "${ctx.agent.id}" and you hold one tab.`];
      if (tab.hatches.length === 0) lines.push('Your tab has no Hatch yet. Call navigate with an address to open a page.');
      for (const h of tab.hatches) {
        const page = pageFor(h.id);
        const notes = [h.id === hatchId ? 'current' : '', page?.loading ? 'loading' : '', page?.dialog ? `${page.dialog.kind} dialog open` : '', h.view === 'agent' ? 'user sees the agent view' : ''].filter(Boolean);
        lines.push(`- ${h.id}  ${JSON.stringify(h.title || '(no title yet)')}  ${h.url}  ${h.width} × ${h.height}${notes.length ? `  (${notes.join(', ')})` : ''}`);
      }
      if (ctx.agent.id.startsWith(UNNAMED)) lines.push('You connected with no name, so Hatch named you after your app. Two sessions of one app would then share this tab. Add ?agent=<your-name> to the address, or set HATCH_AGENT for the command.');
      if ((await settingsStore.read()).describeElements && (await hasKey())) lines.push('Jev is connected, so finding elements from a description is on: click, fill, select_option, hover and the steps of run_steps take target in plain words in place of ref, which saves you a snapshot. wait_for takes until in plain words.');
      if (await canAsk()) lines.push('jev_run is on: hand it a mechanical goal, such as a search or a known flow, and Jev takes the steps and returns a trace. get_guide with topic "jev" says when to use it.');
      lines.push(`Activity log: ${logPath()}`);
      return lines.join('\n');
    },
  }),
  tool({
    name: 'get_guide',
    description: `Hatch's built-in usage guide. Topics: ${[...TOPICS, 'tools'].join(', ')}.`,
    shape: { topic: z.string().default('start').describe(`One of: ${[...TOPICS, 'tools'].join(', ')}.`) },
    readOnly: true,
    summary: (a) => `get_guide ${a.topic}`,
    async run({ topic }) {
      if (topic.trim().toLowerCase() === 'tools') return toolsPage((await import('./index')).TOOLS);
      return GUIDE[topic.trim().toLowerCase()] ?? `Hatch has no guide topic called "${topic}". Topics: ${[...TOPICS, 'tools'].join(', ')}.`;
    },
  }),
  tool({
    name: 'finish_working',
    description: 'Tell Hatch you have finished. The working indicator clears and another agent may take your tab. Your next page call claims a tab again.',
    shape: { summary: z.string().max(400).optional().describe('One or two sentences on what you did, for the user.') },
    summary: () => 'finish_working',
    async run({ summary }, ctx) {
      finish(ctx.agent);
      return summary ? 'Hatch marked your work as finished and showed your summary to the user.' : 'Hatch marked your work as finished.';
    },
  }),
];
