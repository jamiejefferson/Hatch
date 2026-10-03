// The /hatch skill, copied into the folders where Claude Code and Codex look for the user's own skills.
// The plugin carries the same file, so this serves a user who connected through the Settings line in place of the plugin.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { app } from 'electron';

export type SkillState = 'installed' | 'missing' | 'outdated';

/** The packaged app carries the skill in its resources. A checkout reads it from the plugin. `HATCH_SKILLS_HOME` points the tests at a stand-in home folder. */
function source(): string {
  return app.isPackaged ? join(process.resourcesPath, 'skills', 'hatch', 'SKILL.md') : join(app.getAppPath(), 'plugins', 'hatch', 'skills', 'hatch', 'SKILL.md');
}

/** Claude Code reads ~/.claude/skills, and Codex reads ~/.agents/skills. */
function targets(): string[] {
  const home = process.env.HATCH_SKILLS_HOME || homedir();
  return [join(home, '.claude', 'skills', 'hatch', 'SKILL.md'), join(home, '.agents', 'skills', 'hatch', 'SKILL.md')];
}

/** 'outdated' means a copy is missing from one folder or differs from the skill this version of Hatch carries. */
export function skillState(): SkillState {
  const wanted = readFileSync(source(), 'utf8');
  const copies = targets().map((path) => (existsSync(path) ? readFileSync(path, 'utf8') : null));
  if (copies.every((copy) => copy === wanted)) return 'installed';
  return copies.every((copy) => copy === null) ? 'missing' : 'outdated';
}

export function installSkill(): SkillState {
  const text = readFileSync(source(), 'utf8');
  for (const path of targets()) {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, text);
  }
  return skillState();
}
