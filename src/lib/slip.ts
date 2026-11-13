import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ImageKind } from './validate.ts';

export const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/** Stores the slip outside the web root under a random name. Returns the storage-relative path. */
export async function saveSlip(bytes: Uint8Array, kind: ImageKind): Promise<string> {
  const root = path.resolve(process.env.SLIP_STORAGE_DIR ?? './storage/slips');
  const now = new Date();
  const rel = path.join(
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    `${randomBytes(16).toString('hex')}.${kind.ext}`,
  );
  const full = path.join(root, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes, { flag: 'wx', mode: 0o600 });
  return rel;
}
