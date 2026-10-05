import { describe, expect, it } from 'vitest';
import { canvasForFolderIn, canvasNote, folderName, oneCanvasPerFolder } from '@shared/project-canvas';
import type { Tab } from '@shared/types';

const tab = (id: string, folder?: string): Tab => ({ id, hatches: [], selectedHatchId: null, pan: { x: 0, y: 0 }, zoom: 1, ...(folder ? { folder } : {}) });

describe('canvasForFolderIn', () => {
  const tabs = [tab('site', '/Users/u/work/site'), tab('docs', '/Users/u/work/site/docs'), tab('mine'), tab('notes', '/Users/u/Notes/Client A')];

  it('finds the canvas of the folder an agent works in, or of a folder above it, and prefers the deepest', () => {
    expect(canvasForFolderIn('/Users/u/work/site', tabs)?.id).toBe('site');
    expect(canvasForFolderIn('/Users/u/work/site/src/app/', tabs)?.id).toBe('site');
    expect(canvasForFolderIn('/Users/u/work/site/docs/guide', tabs)?.id).toBe('docs');
    expect(canvasForFolderIn('/Users/u/Notes/Client A/briefs', tabs)?.id).toBe('notes');
  });

  it('finds no canvas for a folder outside every attached folder, a near-miss name or the home folder', () => {
    expect(canvasForFolderIn('/Users/u/work/site-old', tabs)).toBeNull();
    expect(canvasForFolderIn('/Users/u', [tab('home', '/Users/u')], '/Users/u')).toBeNull();
    expect(canvasForFolderIn('', tabs)).toBeNull();
  });
});

describe('oneCanvasPerFolder', () => {
  it('lets the first canvas keep a folder, or the one named to keep it', () => {
    expect(oneCanvasPerFolder([tab('a', '/w/site'), tab('b', '/w/site'), tab('c', '/w/docs')]).map((t) => t.folder)).toEqual(['/w/site', undefined, '/w/docs']);
    expect(oneCanvasPerFolder([tab('a', '/w/site'), tab('b', '/w/site')], 'b').map((t) => t.folder)).toEqual([undefined, '/w/site']);
  });
});

describe('canvasNote', () => {
  it('names the canvas and the folder, and tells an agent how to reach it', () => {
    const note = JSON.parse(canvasNote({ id: 'tab_1', label: 'Site' }, '/w/site'));
    expect(note).toMatchObject({ canvas: 'tab_1', name: 'Site', folder: '/w/site' });
    expect(note.forAgents).toContain('use_project');
    expect(folderName('/w/Client A/')).toBe('Client A');
  });
});
