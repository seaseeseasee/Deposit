import { withTx, type Scope } from './db.ts';
import { parseAmount } from './validate.ts';

const friendly = (e: unknown) =>
  e instanceof Error && e.message.includes('insufficient balance') ? new Error('ยอดเงินคงเหลือของผู้ป่วยไม่พอ') : e;

export type ExpenseInput = {
  admissionId: number; categoryId: number; spentAt: string; description: string; amount: string;
  note: string; incidentDetail: string; evidencePath: string | null; userId: number;
};

/**
 * Records an expense against one patient's balance.
 * Normal categories hit the ledger immediately (the DB refuses a negative balance).
 * Categories that need approval (property damage) create a pending request only; money moves on approval.
 */
export async function createExpense(scope: Scope, p: ExpenseInput): Promise<{ pending: boolean }> {
  const amount = parseAmount(p.amount);
  if (!amount) throw new Error('จำนวนเงินไม่ถูกต้อง');
  if (!p.description.trim()) throw new Error('กรุณาระบุรายละเอียด');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.spentAt)) throw new Error('วันที่จ่ายไม่ถูกต้อง');
  try {
    return await withTx(scope, async (c) => {
      const adm = (await c.query(
        `SELECT id, ward_id, status FROM patient_admissions WHERE id = $1 FOR UPDATE`, [p.admissionId])).rows[0];
      if (!adm) throw new Error('ไม่พบผู้ป่วย หรือไม่มีสิทธิ์เข้าถึง');
      if (adm.status !== 'active') throw new Error('ผู้ป่วยรายนี้ไม่ได้อยู่ในหอแล้ว บันทึกรายจ่ายไม่ได้');
      const cat = (await c.query(
        `SELECT id, name, requires_approval FROM expense_categories WHERE id = $1 AND is_active`, [p.categoryId])).rows[0];
      if (!cat) throw new Error('ไม่พบหมวดค่าใช้จ่าย');
      const needs: boolean = cat.requires_approval;
      if (needs && !p.incidentDetail.trim()) throw new Error('หมวดนี้ต้องระบุรายละเอียดเหตุการณ์');

      const bal = Number((await c.query(
        `SELECT COALESCE(SUM(CASE direction WHEN 'credit' THEN amount ELSE -amount END),0) AS b
           FROM financial_transactions WHERE admission_id = $1`, [adm.id])).rows[0].b);
      if (bal < Number(amount)) throw new Error('ยอดเงินคงเหลือของผู้ป่วยไม่พอ');

      const e = (await c.query(
        `INSERT INTO expense_records (admission_id, ward_id, category_id, spent_at, description, amount,
                                      evidence_path, note, incident_detail, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [adm.id, adm.ward_id, cat.id, p.spentAt, p.description.trim(), amount, p.evidencePath,
         p.note.trim() || null, p.incidentDetail.trim() || null, needs ? 'pending_approval' : 'approved', p.userId])).rows[0];

      if (needs) {
        await c.query(
          `INSERT INTO approvals (target_type, target_id, ward_id, requested_by) VALUES ('expense_record',$1,$2,$3)`,
          [e.id, adm.ward_id, p.userId]);
      } else {
        await c.query(
          `INSERT INTO financial_transactions (admission_id, ward_id, type, direction, amount, source_expense_id, created_by)
           VALUES ($1,$2,'expense','debit',$3,$4,$5)`, [adm.id, adm.ward_id, amount, e.id, p.userId]);
      }
      await c.query(
        `INSERT INTO audit_logs (user_id, ward_id, action, entity_type, entity_id, after_json)
         VALUES ($1,$2,$3,'expense_record',$4,$5)`,
        [p.userId, adm.ward_id, needs ? 'expense.request' : 'expense.create', e.id,
         JSON.stringify({ category: cat.name, amount, description: p.description.trim() })]);
      return { pending: needs };
    });
  } catch (e) {
    throw friendly(e);
  }
}

/** Ward manager decision on a pending approval. Approving writes the ledger deduction in the same transaction. */
export async function decideApproval(scope: Scope, p: { approvalId: number; userId: number; approve: boolean; comment: string }) {
  if (!p.approve && !p.comment.trim()) throw new Error('ต้องระบุเหตุผลที่ไม่อนุมัติ');
  try {
    return await withTx(scope, async (c) => {
      const a = (await c.query(`SELECT * FROM approvals WHERE id = $1 FOR UPDATE`, [p.approvalId])).rows[0];
      if (!a) throw new Error('ไม่พบรายการ หรือไม่มีสิทธิ์เข้าถึง');
      if (a.status !== 'pending') throw new Error('รายการนี้ถูกดำเนินการแล้ว');
      if (Number(a.requested_by) === p.userId) throw new Error('ไม่สามารถอนุมัติรายการที่ตนเองเป็นผู้ขอ');
      if (a.target_type !== 'expense_record') throw new Error('ประเภทรายการยังไม่รองรับ');
      const e = (await c.query(`SELECT * FROM expense_records WHERE id = $1 FOR UPDATE`, [a.target_id])).rows[0];

      if (p.approve) {
        await c.query(
          `INSERT INTO financial_transactions (admission_id, ward_id, type, direction, amount, source_expense_id, created_by, note)
           VALUES ($1,$2,'deduction','debit',$3,$4,$5,'หักค่าเสียหาย (อนุมัติโดยหัวหน้าหอ)')`,
          [e.admission_id, e.ward_id, e.amount, e.id, e.created_by]);
      }
      await c.query(`UPDATE expense_records SET status = $1 WHERE id = $2`, [p.approve ? 'approved' : 'rejected', e.id]);
      await c.query(
        `UPDATE approvals SET status = $1, decided_by = $2, decided_at = now(), comment = $3 WHERE id = $4`,
        [p.approve ? 'approved' : 'rejected', p.userId, p.comment.trim() || null, a.id]);
      await c.query(
        `INSERT INTO audit_logs (user_id, ward_id, action, entity_type, entity_id, before_json, after_json)
         VALUES ($1,$2,$3,'approval',$4,$5,$6)`,
        [p.userId, a.ward_id, p.approve ? 'approval.approve' : 'approval.reject', a.id,
         JSON.stringify({ status: 'pending' }), JSON.stringify({ status: p.approve ? 'approved' : 'rejected', comment: p.comment.trim() })]);
    });
  } catch (e) {
    throw friendly(e);
  }
}
