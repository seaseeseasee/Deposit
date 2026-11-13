import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as unknown as (p: string, s: Buffer, k: number) => Promise<Buffer>;

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const h = await scrypt(pw, salt, 64);
  return `s1$${salt.toString('hex')}$${h.toString('hex')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [v, s, h] = stored.split('$');
  if (v !== 's1' || !s || !h) return false;
  const got = await scrypt(pw, Buffer.from(s, 'hex'), 64);
  const want = Buffer.from(h, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}
