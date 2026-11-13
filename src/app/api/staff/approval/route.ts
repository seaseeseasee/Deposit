import { expensesEnabled } from '@/lib/features.ts';
import { getUser } from '@/lib/auth.ts';
import { decideApproval } from '@/lib/expenses.ts';
import { sameOrigin, see } from '@/lib/http.ts';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!expensesEnabled()) return new Response('Not found', { status: 404 });
  if (!sameOrigin(req)) return new Response('Forbidden', { status: 403 });
  const user = await getUser();
  if (!user) return see('/login');
  const f = await req.formData();
  const to = (k: 'error' | 'done', m: string) => see(`/staff/approvals?${k}=${encodeURIComponent(m)}`);
  if (user.role !== 'manager') return to('error', 'เฉพาะหัวหน้าหอเท่านั้นที่อนุมัติได้');
  const id = Number(f.get('id'));
  if (!Number.isInteger(id)) return see('/staff/approvals');
  const approve = f.get('decision') === 'approve';
  try {
    await decideApproval(user.scope, { approvalId: id, userId: user.id, approve, comment: String(f.get('comment') ?? '') });
  } catch (e) {
    return to('error', e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
  }
  return to('done', approve ? 'อนุมัติแล้ว หักเงินเรียบร้อย' : 'ไม่อนุมัติรายการแล้ว');
}
