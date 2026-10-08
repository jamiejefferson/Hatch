import { afterEach, describe, expect, it, vi } from 'vitest';
import { refusePasskeys } from '@shared/passkeys';

const g = globalThis as Record<string, unknown>;
afterEach(() => {
  delete g.CredentialsContainer;
  delete g.dispatchEvent;
  vi.restoreAllMocks();
});

function container(): { proto: Record<string, (o?: unknown) => Promise<unknown>>; native: ReturnType<typeof vi.fn> } {
  const native = vi.fn(() => new Promise(() => {}));
  const proto = { get: native, create: native };
  g.CredentialsContainer = { prototype: proto };
  return { proto, native };
}

describe('refusePasskeys', () => {
  it('refuses a passkey request at once with the error a cancelled request gives, and raises the event', async () => {
    const { proto, native } = container();
    const raised = vi.fn((_e: Event) => true);
    g.dispatchEvent = raised;
    refusePasskeys('test-passkey');
    await expect(proto.get!({ publicKey: {} })).rejects.toMatchObject({ name: 'NotAllowedError' });
    await expect(proto.create!({ publicKey: {} })).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(raised.mock.calls.map(([e]) => e.type)).toEqual(['test-passkey', 'test-passkey']);
    expect(native).not.toHaveBeenCalled();
  });

  it('leaves autofill passkey requests and other credentials to the browser', () => {
    const { proto, native } = container();
    refusePasskeys('test-passkey');
    void proto.get!({ publicKey: {}, mediation: 'conditional' });
    void proto.get!({ password: true });
    void proto.get!();
    expect(native).toHaveBeenCalledTimes(3);
  });
});
