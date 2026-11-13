import { withTx, type Scope } from './db.ts';

/**
 * Staff confirmation of a slip. One DB transaction: lock the submission, write the ledger row,
 * flip the status, write the audit log. The UNIQUE(source_submission_id) constraint and the
 * row lock make a double confirmation impossible even under concurrent clicks.
 */
export async function verifySubmission(
  scope: Scope,
  p: {
    submissionId: number; admissionId?: number; newPatient?: { name: string; hn: string; bed: string };
    userId: number; checkedBank: boolean;
  },
) {
  if (!p.checkedBank) throw new Error('ต้องยืนยันว่าตรวจกับรายการเดินบัญชีแล้ว');
  return withTx(scope, async (c) => {
    const s = (await c.query(
      `SELECT id, ward_id, amount, status FROM deposit_submissions WHERE id=$1 FOR UPDATE`, [p.submissionId])).rows[0];
    if (!s) throw new Error('ไม่พบรายการ หรือไม่มีสิทธิ์เข้าถึง');
    if (s.status !== 'pending' && s.status !== 'duplicate') throw new Error('รายการนี้ถูกดำเนินการแล้ว');
    let admissionId = p.admissionId;
    if (!admissionId) {
      const np = p.newPatient;
      if (!np || !np.name.trim()) throw new Error('กรุณาเลือกผู้ป่วย หรือกรอกชื่อผู้ป่วยใหม่');
      let patientId: number | undefined = np.hn
        ? (await c.query(`SELECT id FROM patients WHERE hn = $1`, [np.hn])).rows[0]?.id
        : undefined;
      if (!patientId) {
        patientId = (await c.query(
          `INSERT INTO patients (hn, full_name) VALUES ($1,$2) RETURNING id`,
          [np.hn || null, np.name.trim()])).rows[0].id;
      }
      const active = (await c.query(
        `SELECT 1 FROM patient_admissions WHERE patient_id=$1 AND status='active'`, [patientId])).rows[0];
      if (active) throw new Error('ผู้ป่วยรายนี้มีการ admit อยู่แล้ว กรุณาเลือกจากรายชื่อ');
      admissionId = (await c.query(
        `INSERT INTO patient_admissions (patient_id, ward_id, bed_no) VALUES ($1,$2,$3) RETURNING id`,
        [patientId, s.ward_id, np.bed || null])).rows[0].id;
    }
    const adm = (await c.query(
      `SELECT id FROM patient_admissions WHERE id=$1 AND ward_id=$2 AND status='active'`,
      [admissionId, s.ward_id])).rows[0];
    if (!adm) throw new Error('ผู้ป่วยไม่ได้อยู่ในหอนี้หรือไม่ได้ admit อยู่');
    const t = await c.query(
      `INSERT INTO financial_transactions
         (admission_id, ward_id, type, direction, amount, source_submission_id, created_by)
       VALUES ($1,$2,'deposit','credit',$3,$4,$5) RETURNING id, txn_no`,
      [admissionId, s.ward_id, s.amount, s.id, p.userId],
    );
    await c.query(
      `UPDATE deposit_submissions SET status='verified', admission_id=$1, reviewed_by=$2, reviewed_at=now() WHERE id=$3`,
      [admissionId, p.userId, s.id],
    );
    await c.query(
      `INSERT INTO audit_logs (user_id, ward_id, action, entity_type, entity_id, before_json, after_json)
       VALUES ($1,$2,'submission.verify','deposit_submission',$3,$4,$5)`,
      [p.userId, s.ward_id, s.id, JSON.stringify({ status: s.status }),
       JSON.stringify({ status: 'verified', txn_no: t.rows[0].txn_no })],
    );
    return t.rows[0] as { id: number; txn_no: string };
  });
}

export async function rejectSubmission(scope: Scope, p: { submissionId: number; userId: number; reason: string }) {
  if (!p.reason.trim()) throw new Error('ต้องระบุเหตุผลในการปฏิเสธ');
  return withTx(scope, async (c) => {
    const r = await c.query(
      `UPDATE deposit_submissions SET status='rejected', reject_reason=$1, reviewed_by=$2, reviewed_at=now()
        WHERE id=$3 AND status IN ('pending','duplicate') RETURNING id, ward_id`,
      [p.reason.trim(), p.userId, p.submissionId],
    );
    if (!r.rows[0]) throw new Error('ไม่พบรายการ หรือถูกดำเนินการแล้ว');
    await c.query(
      `INSERT INTO audit_logs (user_id, ward_id, action, entity_type, entity_id, after_json)
       VALUES ($1,$2,'submission.reject','deposit_submission',$3,$4)`,
      [p.userId, r.rows[0].ward_id, p.submissionId, JSON.stringify({ reason: p.reason.trim() })],
    );
  });
}
