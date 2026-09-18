// The link a user copies in Hatch and pastes to an agent, so the agent works on that exact Hatch or canvas.
// It reads hatch:@<id>. A project address never starts with @, so the two forms cannot collide.

const PREFIX = 'hatch:@';

export const hatchLink = (id: string): string => `${PREFIX}${id}`;

/** The Hatch or tab id inside a copied link. A bare id passes through, so an agent may send either. */
export function idFromLink(text: string): string {
  const trimmed = text.trim();
  return trimmed.toLowerCase().startsWith(PREFIX) ? trimmed.slice(PREFIX.length) : trimmed;
}
