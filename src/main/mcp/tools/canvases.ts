import { z } from 'zod';
import { canvasForFolder, hatchFor, inTabQueue, tabFor } from '../../agents/agents';
import { projectsState } from '../../servers/manager';
import { HatchError } from '../../cdp/session';
import { callInterface } from '../../renderer-rpc';
import { idFromLink } from '@shared/hatch-link';
import { projectRoot } from '@shared/project-canvas';
import type { InterfaceState } from '@shared/types';
import { intent, tool } from './types';

// A canvas is a tab in Hatch's window. No agent owns one: any agent opens, closes and works in any canvas, and
// calls on one canvas run one at a time. A canvas an agent opened stays open after the agent finishes, so the
// user can see what it did (JJ, 22 Sep 2026).

const canvasArg = z.string().describe('Canvas id from list_canvases, or a copied hatch:@ link to a canvas.');

function describe(state: InterfaceState, held: string | null): string {
  return state.tabs
    .map((t) => {
      const head = `${t.id}${t.id === held ? ' (yours)' : ''}${t.id === state.activeTabId ? ' (the user is looking at it)' : ''}  ${JSON.stringify(t.label)}${t.folder ? `  folder ${t.folder}` : ''}  ${t.hatches.length === 1 ? '1 Hatch' : `${t.hatches.length} Hatches`}`;
      const pages = t.hatches.map((h) => `  ${h.id}  ${JSON.stringify(h.title || '(no title yet)')}  ${h.url}`);
      return [head, ...pages].join('\n');
    })
    .join('\n');
}

export const canvasTools = [
  tool({
    name: 'use_project',
    description: "Moves you to the canvas of the folder you work in, so you leave the user's other canvases alone. A project is the folder where its work takes place, any folder, with or without a dev server. Pass that folder, or a registered project's name. The canvas attached to the folder, or to a folder above it, is the one; a folder with no canvas gets a new one attached to it. Hatch does this by itself for an agent whose Hatch command starts in the folder.",
    shape: {
      folder: z.string().optional().describe('Absolute path of the folder you work in.'),
      project: z.string().optional().describe("A registered project's name from list_projects, in place of folder. Its folder is used."),
      intent,
    },
    summary: (a) => `use_project ${a.project ?? a.folder?.split('/').pop() ?? ''}`.trim(),
    async run(a, ctx) {
      let folder = (a.folder ?? '').replace(/\/+$/, '');
      if (a.project) {
        const name = a.project.replace(/^hatch:/, '').toLowerCase();
        const { projects } = await projectsState(false);
        const project = projects.find((p) => p.name === name);
        if (!project) throw new HatchError(`No project is named ${name}. Pass folder, the absolute path you work in, or a name from list_projects.`);
        folder = projectRoot(project);
      }
      folder ||= ctx.agent.folder ?? '';
      if (!folder.startsWith('/')) throw new HatchError('Pass folder, the absolute path you work in, or project, a name from list_projects.');
      ctx.agent.folder = folder;
      const found = await canvasForFolder(folder);
      ctx.agent.tabId = found.tabId;
      ctx.agent.hatchId = null;
      ctx.agent.finished = false;
      const state = await callInterface<InterfaceState>('state');
      const tab = state.tabs.find((t) => t.id === found.tabId)!;
      ctx.at(tab.id, null);
      const pages = tab.hatches.length ? `\nIts Hatches:\n${tab.hatches.map((h) => `  ${h.id}  ${JSON.stringify(h.title || '(no title yet)')}  ${h.url}`).join('\n')}` : '\nIt has no Hatch yet. Call navigate with an address.';
      return `You now work on ${JSON.stringify(tab.label)} (${tab.id}), the canvas of the working folder ${found.folder}.${found.opened ? ' Hatch opened it just now, behind the canvas the user is looking at.' : ''}${pages}`;
    },
  }),
  tool({
    name: 'list_canvases',
    description: 'Lists every canvas in the Hatch window with id and name, and under each one its Hatches with id, title and address. A canvas is a tab. Any agent may work in any canvas and act on any Hatch: pass a canvas id as the canvas argument of a call or to select_canvas, or pass a Hatch id to select_hatch or to any page tool.',
    shape: { intent },
    readOnly: true,
    async run(_args, ctx) {
      const state = await callInterface<InterfaceState>('state');
      const held = ctx.agent.tabId && state.tabs.some((t) => t.id === ctx.agent.tabId) ? ctx.agent.tabId : null;
      ctx.at(held, null);
      return describe(state, held);
    },
  }),
  tool({
    name: 'open_canvas',
    description: 'Opens a new, empty canvas and makes it the one you hold. It opens behind the canvas the user is looking at. Give it a name so the user knows what it is for; it stays open after you finish.',
    shape: { name: z.string().max(60).optional().describe('The name shown on the tab, such as "Pricing page review". Without one the tab takes its project\'s name.'), intent },
    summary: (a) => `open_canvas ${a.name ? JSON.stringify(a.name) : ''}`.trim(),
    async run(a, ctx) {
      const tabId = await callInterface<string>('newTab', { name: a.name });
      ctx.agent.tabId = tabId;
      ctx.agent.hatchId = null;
      ctx.agent.finished = false;
      ctx.at(tabId, null);
      return `Opened canvas ${tabId}${a.name ? ` named ${JSON.stringify(a.name)}` : ''}. You now hold it. Call navigate or open_hatch with an address to put a page in it.`;
    },
  }),
  tool({
    name: 'select_canvas',
    description: 'Makes a canvas the one your later calls act in. The user\'s own tab stays as it is.',
    shape: { canvas: canvasArg, intent },
    summary: (a) => `select_canvas ${a.canvas}`,
    async run(a, ctx) {
      const { tabId, hatchId, state } = await hatchFor(ctx.agent, undefined, a.canvas);
      ctx.at(tabId, hatchId);
      const tab = state.tabs.find((t) => t.id === tabId)!;
      if (!hatchId) return `You now hold the canvas ${JSON.stringify(tab.label)} (${tabId}). It has no Hatch yet, so call navigate or open_hatch.`;
      return `You now hold the canvas ${JSON.stringify(tab.label)} (${tabId}). Your calls act on its Hatch ${hatchId}. Call list_hatches to see the rest.`;
    },
  }),
  tool({
    name: 'close_canvas',
    description: 'Closes a canvas and every Hatch in it. Closing the last canvas leaves one empty canvas, because the window always shows one.',
    shape: { canvas: canvasArg, intent },
    summary: (a) => `close_canvas ${a.canvas}`,
    async run(a, ctx) {
      const id = idFromLink(a.canvas);
      const { tabId } = await tabFor(ctx.agent, id);
      ctx.at(tabId, null);
      await inTabQueue(tabId, () => callInterface('closeTab', { tabId }));
      const state = await callInterface<InterfaceState>('state');
      if (state.tabs.some((t) => t.id === id)) throw new HatchError(`The canvas ${id} did not close. Call list_canvases to see what is open.`);
      ctx.agent.tabId = null;
      ctx.agent.hatchId = null;
      const left = state.tabs.length === 1 ? 'One canvas remains.' : `${state.tabs.length} canvases remain.`;
      return `Closed canvas ${id}. ${left} Your next call claims a canvas again, or name one with select_canvas.`;
    },
  }),
];
