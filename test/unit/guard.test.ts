import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getVersion: () => '0.0.0' } }));
vi.mock('../../src/main/mcp/server', () => ({ createEndpoint: () => ({}) }));

const { guard } = await import('../../src/main/mcp/http');

describe('the MCP endpoint guard', () => {
  it('accepts an agent on the loopback address', () => {
    expect(guard({ host: '127.0.0.1:42824' }, 42824)).toBeNull();
    expect(guard({ host: 'localhost:42824' }, 42824)).toBeNull();
  });

  it('rejects anything a browser sends, including a page Hatch itself shows', () => {
    expect(guard({ host: '127.0.0.1:42824', origin: 'http://localhost:5173' }, 42824)).not.toBeNull();
    expect(guard({ host: '127.0.0.1:42824', origin: 'null' }, 42824)).not.toBeNull();
    expect(guard({ host: '127.0.0.1:42824', 'sec-fetch-site': 'same-origin' }, 42824)).not.toBeNull();
  });

  it('rejects another Host, which blocks DNS rebinding', () => {
    expect(guard({ host: 'evil.example:42824' }, 42824)).not.toBeNull();
    expect(guard({ host: '127.0.0.1:1' }, 42824)).not.toBeNull();
    expect(guard({}, 42824)).not.toBeNull();
  });
});
