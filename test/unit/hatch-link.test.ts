import { describe, expect, it } from 'vitest';
import { parseAddress } from '@shared/address';
import { hatchLink, idFromLink } from '@shared/hatch-link';

describe('the link a user copies for an agent', () => {
  it('wraps an id and gives it back', () => {
    expect(hatchLink('hatch_ab12cd34')).toBe('hatch:@hatch_ab12cd34');
    expect(idFromLink('hatch:@hatch_ab12cd34')).toBe('hatch_ab12cd34');
    expect(idFromLink('  HATCH:@tab_x1  ')).toBe('tab_x1');
  });

  it('lets a bare id through, so an agent may pass either form', () => {
    expect(idFromLink('hatch_ab12cd34')).toBe('hatch_ab12cd34');
  });

  it('never reads as a project address', () => {
    expect(parseAddress(hatchLink('hatch_ab12cd34')).ok).toBe(false);
  });
});
