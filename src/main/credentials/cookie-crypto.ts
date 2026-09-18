// How Chrome and the browsers built on it protect a cookie value on macOS. This file imports nothing from Electron, so the unit tests load it.
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';

/** The Keychain holds a password, and the AES key is derived from it. */
export const keyFromPassword = (password: string): Buffer => pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');

/** A value starts with `v10`. From cookie file version 24 the plain text starts with a 32-byte hash of the domain, which is dropped. */
export function decryptValue(encrypted: Buffer, key: Buffer, fileVersion: number): string | null {
  if (encrypted.length < 4 || encrypted.subarray(0, 3).toString() !== 'v10') return null;
  try {
    const decipher = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, ' '));
    const plain = Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()]);
    return (fileVersion >= 24 ? plain.subarray(32) : plain).toString('utf8');
  } catch {
    return null;
  }
}
