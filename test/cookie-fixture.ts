// Encrypts a cookie value the way Chrome does on macOS, for the unit test and the end-to-end test.
import { createCipheriv, createHash } from 'node:crypto';
import { keyFromPassword } from '../src/main/credentials/cookie-crypto';

export function encrypt(value: string, host: string, password: string, fileVersion: number): Buffer {
  const cipher = createCipheriv('aes-128-cbc', keyFromPassword(password), Buffer.alloc(16, ' '));
  const plain = Buffer.concat([fileVersion >= 24 ? createHash('sha256').update(host).digest() : Buffer.alloc(0), Buffer.from(value)]);
  return Buffer.concat([Buffer.from('v10'), cipher.update(plain), cipher.final()]);
}
