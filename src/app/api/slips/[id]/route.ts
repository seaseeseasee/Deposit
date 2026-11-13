import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth.ts';
import { withTx } from '@/lib/db.ts';

export const runtime = 'nodejs';

/** Slips are served only to a logged-in user whose ward scope includes the submission (RLS enforces it). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return new NextResponse('Not found', { status: 404 });

  const slip = await withTx(user.scope, async (c) =>
    (await c.query(
      `SELECT sl.storage_path, sl.mime FROM deposit_slips sl
         JOIN deposit_submissions s ON s.id = sl.submission_id WHERE sl.id = $1`, [id])).rows[0]);
  if (!slip) return new NextResponse('Not found', { status: 404 });

  const root = path.resolve(process.env.SLIP_STORAGE_DIR ?? './storage/slips');
  const full = path.resolve(root, slip.storage_path);
  if (!full.startsWith(root + path.sep)) return new NextResponse('Not found', { status: 404 });

  const bytes = await readFile(full).catch(() => null);
  if (!bytes) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': slip.mime, 'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline',
    },
  });
}
