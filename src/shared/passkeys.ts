// Electron services no passkey request on its own: it shows no window and never answers, so a site that asks for a passkey
// (Microsoft's sign-in does by default) waits for ever. A probe on 2026-10-08 (spikes/webauthn/main.cjs) found the request still
// pending after 8 seconds. Electron's Touch ID authenticator needs a keychain access group that only an Apple Developer
// signature can grant, and it would hold passkeys of its own, never the user's iCloud or phone passkeys. Hatch therefore
// refuses a passkey request at once, as a browser does when the user cancels, and the site offers its other ways to sign in.

/** The event the page's own world raises when it refuses a passkey request, for the preload to report. */
export const PASSKEY_REFUSED = 'hatch-passkey-refused';

/**
 * Runs in the page's own world before its scripts. A request that waits for the user to choose a passkey from autofill
 * (`mediation: 'conditional'`) stays with Chromium, because it waits quietly in every browser and the site cancels it itself.
 * It is sent as source, so it refers to nothing outside itself.
 */
export function refusePasskeys(eventName: string): void {
  const page = globalThis as unknown as {
    navigator?: { credentials?: { get?: unknown; create?: unknown } };
    CredentialsContainer?: { prototype: Record<string, unknown> };
    PublicKeyCredential?: { isConditionalMediationAvailable?: unknown };
    dispatchEvent?: (e: Event) => boolean;
  };
  const proto = page.CredentialsContainer?.prototype;
  if (!proto) return;
  const wrap = (name: 'get' | 'create'): void => {
    const native = proto[name] as ((this: unknown, options?: unknown) => Promise<unknown>) | undefined;
    if (typeof native !== 'function') return;
    proto[name] = function (this: unknown, options?: { publicKey?: unknown; mediation?: string }) {
      if (!options?.publicKey || options.mediation === 'conditional') return native.call(this, options);
      try {
        page.dispatchEvent?.(new CustomEvent(eventName));
      } catch {}
      return Promise.reject(new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError'));
    };
  };
  wrap('get');
  wrap('create');
}
