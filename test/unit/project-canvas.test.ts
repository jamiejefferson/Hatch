import { describe, expect, it } from 'vitest';
import { canvasNote, oneCanvasPerProject, projectForFolder } from '@shared/project-canvas';
import type { Tab } from '@shared/types';

const projects = [
  { name: 'site', folder: '/Users/u/work/site', kind: 'server' as const },
  { name: 'docs', folder: '/Users/u/work/site/docs', kind: 'folder' as const },
  { name: 'deck', folder: '/Users/u/decks/pitch/index.html', kind: 'file' as const },
];

describe('projectForFolder', () => {
  it('finds the project a folder is, or sits inside, and prefers the deepest', () => {
    expect(projectForFolder('/Users/u/work/site', projects)?.name).toBe('site');
    expect(projectForFolder('/Users/u/work/site/src/app/', projects)?.name).toBe('site');
    expect(projectForFolder('/Users/u/work/site/docs/guide', projects)?.name).toBe('docs');
    expect(projectForFolder('/Users/u/decks/pitch', projects)?.name).toBe('deck');
  });

  it('gives no project for a folder outside every project, a near-miss name or the home folder', () => {
    expect(projectForFolder('/Users/u/work/site-old', projects)).toBeNull();
    expect(projectForFolder('/Users/u', [{ name: 'home', folder: '/Users/u', kind: 'folder' as const }], '/Users/u')).toBeNull();
    expect(projectForFolder('', projects)).toBeNull();
  });
});

describe('oneCanvasPerProject', () => {
  const tab = (id: string, project?: string): Tab => ({ id, hatches: [], selectedHatchId: null, pan: { x: 0, y: 0 }, zoom: 1, ...(project ? { project } : {}) });

  it('lets the first canvas keep a project, or the one named to keep it', () => {
    expect(oneCanvasPerProject([tab('a', 'site'), tab('b', 'site'), tab('c', 'docs')]).map((t) => t.project)).toEqual(['site', undefined, 'docs']);
    expect(oneCanvasPerProject([tab('a', 'site'), tab('b', 'site')], 'b').map((t) => t.project)).toEqual([undefined, 'site']);
  });
});

describe('canvasNote', () => {
  it('names the canvas and tells an agent how to reach it', () => {
    const note = JSON.parse(canvasNote({ id: 'tab_1', label: 'Site' }, 'site'));
    expect(note).toMatchObject({ canvas: 'tab_1', name: 'Site', project: 'site' });
    expect(note.forAgents).toContain('use_project');
  });
});
