import { expensesEnabled } from '@/lib/features.ts';
import { getUser } from '@/lib/auth.ts';
import { createExpense } from '@/lib/expenses.ts';
import { sameOrigin, see } from '@/lib/http.ts';
import { saveSlip } from '@/lib/slip.ts';
import { detectImage, MAX_SLIP_BYTES } from '@/lib/validate.ts';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!expensesEnabled()) return new Response('Not found', { status: 404 });
  if (!sameOrigin(req)) return new Response('Forbidden', { status: 403 });
  const user = await getUser();
  if (!user) return see('/login');
  const f = await req.formData();
  const adm = Number(f.get('admission'));
  if (!Number.isInteger(adm)) return see('/staff/patients');
  const to = (k: 'error' | 'done', m: string) => see(`/staff/patients/${adm}?${k}=${encodeURIComponent(m)}`);
  if (user.role === 'admin') return to('error', 'ผู้ดูแลระบบไม่มีสิทธิ์บันทึกรายจ่าย');

  let evidencePath: string | null = null;
  const file = f.get('evidence');
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_SLIP_BYTES) return to('error', 'ไฟล์หลักฐานใหญ่เกิน 5 MB');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = detectImage(bytes);
    if (!kind) return to('error', 'หลักฐานรองรับเฉพาะรูปภาพ JPG, PNG หรือ WebP');
    evidencePath = await saveSlip(bytes, kind);
  }
  try {
    const r = await createExpense(user.scope, {
      admissionId: adm, categoryId: Number(f.get('category')), spentAt: String(f.get('spentAt') ?? ''),
      description: String(f.get('description') ?? ''), amount: String(f.get('amount') ?? ''),
      note: String(f.get('note') ?? ''), incidentDetail: String(f.get('incidentDetail') ?? ''),
      evidencePath, userId: user.id,
    });
    return to('done', r.pending ? 'ส่งคำขอหักเงินแล้ว รอหัวหน้าหออนุมัติ' : 'บันทึกรายจ่ายเรียบร้อยแล้ว');
  } catch (e) {
    return to('error', e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
  }
}
