import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db.ts';

export const runtime = 'nodejs';
const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

/** The ward's receiving-account QR is public by design (it is shown on the relatives' page). Nothing else is served here. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return new NextResponse('Not found', { status: 404 });
  const r = await pool.query(
    `SELECT b.qr_image_path FROM ward_bank_accounts b JOIN wards w ON w.id = b.ward_id
      WHERE b.ward_id = $1 AND b.is_active AND w.is_active AND b.qr_image_path IS NOT NULL`, [id]);
  const rel = r.rows[0]?.qr_image_path;
  if (!rel) return new NextResponse('Not found', { status: 404 });
  const root = path.resolve(process.env.SLIP_STORAGE_DIR ?? './storage/slips');
  const full = path.resolve(root, rel);
  const mime = MIME[path.extname(full)];
  if (!full.startsWith(root + path.sep) || !mime) return new NextResponse('Not found', { status: 404 });
  const bytes = await readFile(full).catch(() => null);
  if (!bytes) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=300' } });
}
