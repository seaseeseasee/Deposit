import { getUser } from '@/lib/auth.ts';
import { sameOrigin, see } from '@/lib/http.ts';
import { verifySubmission } from '@/lib/ledger.ts';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response('Forbidden', { status: 403 });
  const user = await getUser();
  if (!user) return see('/login');
  const f = await req.formData();
  const id = Number(f.get('id'));
  if (!Number.isInteger(id)) return see('/staff');
  const to = (k: 'error' | 'done', m: string) => see(`/staff/submissions/${id}?${k}=${encodeURIComponent(m)}`);
  if (user.role === 'admin') return to('error', 'ผู้ดูแลระบบไม่มีสิทธิ์ยืนยันรายการ');

  const choice = String(f.get('admission') ?? '');
  try {
    await verifySubmission(user.scope, {
      submissionId: id, userId: user.id, checkedBank: f.get('checked') === 'on',
      admissionId: /^\d+$/.test(choice) ? Number(choice) : undefined,
      newPatient: {
        name: String(f.get('newName') ?? ''), hn: String(f.get('newHn') ?? '').trim(),
        bed: String(f.get('newBed') ?? '').trim(),
      },
    });
  } catch (e) {
    return to('error', e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
  }
  return to('done', 'ยืนยันรับเงินเรียบร้อยแล้ว');
}
