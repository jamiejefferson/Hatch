import { describe, expect, it } from 'vitest';
import { MAX_ACTION_BUTTONS, repairActionButtons } from '@shared/action-buttons';

describe('repairActionButtons', () => {
  it('keeps whole buttons, trims names and gives an unknown icon the web icon', () => {
    expect(repairActionButtons([{ id: 'a', name: '  Sheets ', url: 'https://docs.google.com/spreadsheets', icon: 'spreadsheet' }, { id: 'b', name: 'Mail', url: 'https://mail.google.com', icon: 'rocket' }])).toEqual([
      { id: 'a', name: 'Sheets', url: 'https://docs.google.com/spreadsheets', icon: 'spreadsheet' },
      { id: 'b', name: 'Mail', url: 'https://mail.google.com', icon: 'web' },
    ]);
  });

  it('drops a button with no name, no address or a repeated id, and anything that is no list', () => {
    expect(repairActionButtons([{ id: 'a', name: '', url: 'x.com' }, { id: 'b', name: 'B', url: ' ' }, { id: 'c', name: 'C', url: 'c.com', icon: 'web' }, { id: 'c', name: 'Again', url: 'd.com', icon: 'web' }, null, 'text'])).toEqual([{ id: 'c', name: 'C', url: 'c.com', icon: 'web' }]);
    expect(repairActionButtons({ id: 'a' })).toEqual([]);
  });

  it(`keeps at most ${MAX_ACTION_BUTTONS} buttons`, () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `b${i}`, name: `B${i}`, url: 'a.com', icon: 'web' }));
    expect(repairActionButtons(many)).toHaveLength(MAX_ACTION_BUTTONS);
  });
});
