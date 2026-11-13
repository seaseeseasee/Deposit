import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth.ts';
import { withTx } from '@/lib/db.ts';

export const runtime = 'nodejs';

const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

/** Expense evidence images, served only within the user's ward scope (RLS on expense_records). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return new NextResponse('Not found', { status: 404 });
  const row = await withTx(user.scope, async (c) =>
    (await c.query(`SELECT evidence_path FROM expense_records WHERE id = $1`, [id])).rows[0]);
  if (!row?.evidence_path) return new NextResponse('Not found', { status: 404 });

  const root = path.resolve(process.env.SLIP_STORAGE_DIR ?? './storage/slips');
  const full = path.resolve(root, row.evidence_path);
  if (!full.startsWith(root + path.sep)) return new NextResponse('Not found', { status: 404 });
  const bytes = await readFile(full).catch(() => null);
  const mime = MIME[path.extname(full)];
  if (!bytes || !mime) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: { 'Content-Type': mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
