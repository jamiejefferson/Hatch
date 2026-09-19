import { actTools } from './act';
import { commentTools } from './comments';
import { credentialTools } from './credentials';
import { extractTools } from './extract';
import { hatchTools } from './hatches';
import { navigateTools } from './navigate';
import { linkTools, projectTools } from './projects';
import { readTools } from './read';
import { sessionTools } from './session';
import { stepTools } from './steps';
import type { Tool } from './types';

/** The tool list is static. A tool that a setting switches off stays listed and explains itself when called. */
export const TOOLS: Tool[] = [...sessionTools, ...hatchTools, ...navigateTools, ...readTools, ...extractTools, ...actTools, ...stepTools, ...projectTools, ...linkTools, ...commentTools, ...credentialTools];
