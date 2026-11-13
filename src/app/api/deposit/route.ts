import { NextResponse, type NextRequest } from 'next/server';
import { createSubmission, getPublicWard } from '@/lib/deposit.ts';
import { saveSlip, sha256 } from '@/lib/slip.ts';
import { getSetting } from '@/lib/settings.ts';
import { sameOrigin } from '@/lib/http.ts';
import { detectImage, MAX_SLIP_BYTES, validateDepositFields } from '@/lib/validate.ts';

export const runtime = 'nodejs';

// Minimal per-IP limiter (single instance). Replace with a shared store behind a load balancer.
const hits = new Map<string, number[]>();
function tooMany(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 8;
}

const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  if (ip && tooMany(ip)) return fail('ส่งข้อมูลบ่อยเกินไป กรุณารอสักครู่', 429);

  // CSRF: the form must come from our own origin.
  if (!sameOrigin(req)) return fail('คำขอไม่ถูกต้อง', 403);

  const form = await req.formData();
  if (form.get('website')) return NextResponse.json({ ok: true, ref: 'OK' }); // honeypot: pretend success

  const ward = await getPublicWard(String(form.get('ward') ?? ''));
  if (!ward) return fail('ไม่พบหอผู้ป่วย', 404);

  const fields: Record<string, string> = {};
  for (const k of ['patientName', 'hn', 'amount', 'transferAt', 'payerName', 'phone', 'note']) fields[k] = String(form.get(k) ?? '');
  const v = validateDepositFields(fields);
  if (!v.ok) return fail(v.error);
  if (!v.value.hn && (await getSetting<boolean>('require_hn', false))) return fail('กรุณากรอก HN');

  const file = form.get('slip');
  if (!(file instanceof File) || file.size === 0) return fail('กรุณาแนบรูปสลิป');
  if (file.size > MAX_SLIP_BYTES) return fail('ไฟล์ใหญ่เกิน 5 MB');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectImage(bytes);
  if (!kind) return fail('รองรับเฉพาะรูปภาพ JPG, PNG หรือ WebP');

  const stored = await saveSlip(bytes, kind);
  const ref = await createSubmission(ward, v.value, { path: stored, sha256: sha256(bytes), kind, size: bytes.length }, ip);
  return NextResponse.json({ ok: true, ref });
}
