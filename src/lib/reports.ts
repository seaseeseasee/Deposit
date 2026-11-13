import { withTx, type Scope } from './db.ts';
import { expensesEnabled } from './features.ts';

export type Kind = 'text' | 'money' | 'int' | 'datetime' | 'date';
export type Col = { key: string; label: string; kind?: Kind };
export type Report = {
  type: string; title: string; note?: string; cols: Col[];
  rows: Record<string, unknown>[]; totals?: Record<string, number>;
};
export type Params = { wardIds: number[]; from: string; to: string };

const ALL_REPORTS: Record<string, { title: string; ranged: boolean }> = {
  'patient-deposits': { title: 'เงินฝากรายบุคคล', ranged: true },
  'daily-in': { title: 'เงินรับเข้ารายวัน', ranged: true },
  'daily-out': { title: 'เงินจ่ายออกรายวัน', ranged: true },
  'patient-balance': { title: 'เงินคงเหลือรายบุคคล', ranged: false },
  'ward-balance': { title: 'เงินคงเหลือรวมประจำหอผู้ป่วย', ranged: false },
  pending: { title: 'รายการที่รอตรวจสอบ', ranged: false },
  rejected: { title: 'รายการที่ถูกปฏิเสธ', ranged: true },
  monthly: { title: 'สรุปรายเดือน', ranged: true },
  adjustments: { title: 'ประวัติการปรับปรุงและหักยอดเงิน', ranged: true },
};

const EXPENSE_ONLY_REPORTS = new Set(['daily-out', 'adjustments']);
const EXPENSE_COLS = new Set(['total_spent', 'total_deducted', 'expense', 'net']);
export const REPORTS: Record<string, { title: string; ranged: boolean }> = Object.fromEntries(
  Object.entries(ALL_REPORTS).filter(([k]) => expensesEnabled() || !EXPENSE_ONLY_REPORTS.has(k)));

const DAY = (col: string) => `(${col} AT TIME ZONE 'Asia/Bangkok')::date`;
const NOT_TRANSFER = `t.type NOT IN ('transfer_in','transfer_out')`;
const TYPE_LABEL = `CASE t.type WHEN 'deposit' THEN 'ฝากเงิน' WHEN 'expense' THEN 'รายจ่าย' WHEN 'deduction' THEN 'หักค่าเสียหาย'
  WHEN 'adjustment' THEN 'ปรับปรุงยอด' WHEN 'reversal' THEN 'ยกเลิกรายการ' WHEN 'refund' THEN 'คืนเงิน' ELSE t.type::text END`;

export const validDate = (s: string | undefined) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

function sumOf(rows: Record<string, unknown>[], keys: string[]) {
  const totals: Record<string, number> = {};
  for (const k of keys) totals[k] = rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  return totals;
}

export async function buildReport(scope: Scope, type: string, p: Params): Promise<Report> {
  const meta = REPORTS[type];
  if (!meta) throw new Error('ไม่รู้จักประเภทรายงาน');
  const q = async (sql: string, args: unknown[]) => withTx(scope, async (c) => (await c.query(sql, args)).rows);
  const ranged = [p.wardIds, p.from, p.to];
  const R = (allCols: Col[], rows: Record<string, unknown>[], sum: string[] = [], note?: string): Report => {
    const cols = expensesEnabled() ? allCols : allCols.filter((c) => !EXPENSE_COLS.has(c.key));
    return { type, title: meta.title, cols, rows, note, totals: sum.length ? sumOf(rows, sum.filter((k) => cols.some((c) => c.key === k))) : undefined };
  };

  switch (type) {
    case 'patient-deposits':
      return R([
        { key: 'occurred_at', label: 'วันเวลา', kind: 'datetime' }, { key: 'full_name', label: 'ผู้ป่วย' }, { key: 'hn', label: 'HN' },
        { key: 'ward', label: 'หอ' }, { key: 'ref_no', label: 'เลขอ้างอิงสลิป' }, { key: 'txn_no', label: 'เลขรายการ' },
        { key: 'amount', label: 'จำนวนเงิน', kind: 'money' },
      ], await q(
        `SELECT t.occurred_at, p.full_name, p.hn, w.name AS ward, s.ref_no, t.txn_no, t.amount
           FROM financial_transactions t JOIN patient_admissions a ON a.id = t.admission_id
           JOIN patients p ON p.id = a.patient_id JOIN wards w ON w.id = t.ward_id
           LEFT JOIN deposit_submissions s ON s.id = t.source_submission_id
          WHERE t.ward_id = ANY($1) AND t.type = 'deposit' AND ${DAY('t.occurred_at')} BETWEEN $2 AND $3
          ORDER BY p.full_name, t.occurred_at`, ranged), ['amount']);

    case 'daily-in':
      return R([
        { key: 'day', label: 'วันที่', kind: 'date' }, { key: 'n', label: 'จำนวนรายการ', kind: 'int' },
        { key: 'amount', label: 'ยอดรับเข้า', kind: 'money' },
      ], await q(
        `SELECT ${DAY('t.occurred_at')} AS day, COUNT(*) AS n, SUM(t.amount) AS amount
           FROM financial_transactions t
          WHERE t.ward_id = ANY($1) AND t.direction = 'credit' AND ${NOT_TRANSFER} AND ${DAY('t.occurred_at')} BETWEEN $2 AND $3
          GROUP BY 1 ORDER BY 1`, ranged), ['n', 'amount']);

    case 'daily-out':
      return R([
        { key: 'day', label: 'วันที่', kind: 'date' }, { key: 'n', label: 'จำนวนรายการ', kind: 'int' },
        { key: 'expense', label: 'รายจ่าย', kind: 'money' }, { key: 'deduction', label: 'หักค่าเสียหาย', kind: 'money' },
        { key: 'total', label: 'รวม', kind: 'money' },
      ], await q(
        `SELECT ${DAY('t.occurred_at')} AS day, COUNT(*) AS n,
                COALESCE(SUM(t.amount) FILTER (WHERE t.type <> 'deduction'),0) AS expense,
                COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'deduction'),0) AS deduction, SUM(t.amount) AS total
           FROM financial_transactions t
          WHERE t.ward_id = ANY($1) AND t.direction = 'debit' AND ${NOT_TRANSFER} AND ${DAY('t.occurred_at')} BETWEEN $2 AND $3
          GROUP BY 1 ORDER BY 1`, ranged), ['n', 'expense', 'deduction', 'total']);

    case 'patient-balance':
      return R([
        { key: 'full_name', label: 'ผู้ป่วย' }, { key: 'hn', label: 'HN' }, { key: 'ward', label: 'หอ' }, { key: 'bed_no', label: 'เตียง' },
        { key: 'status', label: 'สถานะ' }, { key: 'total_deposited', label: 'ฝากสะสม', kind: 'money' },
        { key: 'total_spent', label: 'ใช้ไป', kind: 'money' }, { key: 'total_deducted', label: 'ถูกหัก', kind: 'money' },
        { key: 'balance', label: 'คงเหลือ', kind: 'money' },
      ], await q(
        `SELECT p.full_name, p.hn, w.name AS ward, a.bed_no,
                CASE a.status WHEN 'active' THEN 'Admit' WHEN 'discharged' THEN 'จำหน่ายแล้ว' ELSE 'ย้ายหอ' END AS status,
                b.total_deposited, b.total_spent, b.total_deducted, b.balance
           FROM patient_admissions a JOIN patients p ON p.id = a.patient_id JOIN wards w ON w.id = a.ward_id
           JOIN v_admission_balance b ON b.admission_id = a.id
          WHERE a.ward_id = ANY($1) AND (a.status = 'active' OR b.balance <> 0)
          ORDER BY w.name, p.full_name`, [p.wardIds]),
      ['total_deposited', 'total_spent', 'total_deducted', 'balance'], 'ยอด ณ เวลาที่ออกรายงาน (ไม่ขึ้นกับช่วงวันที่)');

    case 'ward-balance':
      return R([
        { key: 'ward', label: 'หอผู้ป่วย' }, { key: 'patients', label: 'ผู้ป่วยที่มียอดคงเหลือ', kind: 'int' },
        { key: 'total_deposited', label: 'ฝากสะสม', kind: 'money' }, { key: 'total_spent', label: 'ใช้ไป', kind: 'money' },
        { key: 'total_deducted', label: 'ถูกหัก', kind: 'money' }, { key: 'balance', label: 'คงเหลือรวม', kind: 'money' },
      ], await q(
        `SELECT w.name AS ward, COUNT(*) FILTER (WHERE b.balance > 0) AS patients,
                SUM(b.total_deposited) AS total_deposited, SUM(b.total_spent) AS total_spent,
                SUM(b.total_deducted) AS total_deducted, SUM(b.balance) AS balance
           FROM v_admission_balance b JOIN wards w ON w.id = b.ward_id
          WHERE b.ward_id = ANY($1) GROUP BY w.name ORDER BY w.name`, [p.wardIds]),
      ['patients', 'total_deposited', 'total_spent', 'total_deducted', 'balance'], 'ยอด ณ เวลาที่ออกรายงาน');

    case 'pending':
      return R([
        { key: 'created_at', label: 'ส่งเมื่อ', kind: 'datetime' }, { key: 'ref_no', label: 'เลขอ้างอิง' }, { key: 'ward', label: 'หอ' },
        { key: 'patient_name_input', label: 'ผู้ป่วย' }, { key: 'payer_name', label: 'ผู้โอน' },
        { key: 'amount', label: 'จำนวนเงิน', kind: 'money' }, { key: 'status', label: 'สถานะ' },
      ], await q(
        `SELECT s.created_at, s.ref_no, w.name AS ward, s.patient_name_input, s.payer_name, s.amount,
                CASE s.status WHEN 'duplicate' THEN 'อาจซ้ำ' ELSE 'รอตรวจ' END AS status
           FROM deposit_submissions s JOIN wards w ON w.id = s.ward_id
          WHERE s.ward_id = ANY($1) AND s.status IN ('pending','duplicate') ORDER BY s.created_at`, [p.wardIds]),
      ['amount'], 'ยอดในรายงานนี้ยังไม่เข้าบัญชีผู้ป่วย');

    case 'rejected':
      return R([
        { key: 'created_at', label: 'ส่งเมื่อ', kind: 'datetime' }, { key: 'ref_no', label: 'เลขอ้างอิง' }, { key: 'ward', label: 'หอ' },
        { key: 'patient_name_input', label: 'ผู้ป่วย' }, { key: 'payer_name', label: 'ผู้โอน' },
        { key: 'amount', label: 'จำนวนเงิน', kind: 'money' }, { key: 'reviewer', label: 'ผู้ตรวจ' },
        { key: 'reviewed_at', label: 'ตรวจเมื่อ', kind: 'datetime' }, { key: 'reject_reason', label: 'เหตุผล' },
      ], await q(
        `SELECT s.created_at, s.ref_no, w.name AS ward, s.patient_name_input, s.payer_name, s.amount,
                u.full_name AS reviewer, s.reviewed_at, s.reject_reason
           FROM deposit_submissions s JOIN wards w ON w.id = s.ward_id LEFT JOIN users u ON u.id = s.reviewed_by
          WHERE s.ward_id = ANY($1) AND s.status = 'rejected' AND ${DAY('s.created_at')} BETWEEN $2 AND $3
          ORDER BY s.created_at`, ranged), ['amount']);

    case 'monthly':
      return R([
        { key: 'month', label: 'เดือน' }, { key: 'income', label: 'รับเข้า', kind: 'money' },
        { key: 'expense', label: 'จ่ายออก', kind: 'money' }, { key: 'net', label: 'สุทธิ', kind: 'money' },
      ], await q(
        `SELECT to_char(date_trunc('month', t.occurred_at AT TIME ZONE 'Asia/Bangkok'), 'YYYY-MM') AS month,
                COALESCE(SUM(t.amount) FILTER (WHERE t.direction='credit'),0) AS income,
                COALESCE(SUM(t.amount) FILTER (WHERE t.direction='debit'),0) AS expense,
                COALESCE(SUM(t.amount) FILTER (WHERE t.direction='credit'),0)
                - COALESCE(SUM(t.amount) FILTER (WHERE t.direction='debit'),0) AS net
           FROM financial_transactions t
          WHERE t.ward_id = ANY($1) AND ${NOT_TRANSFER} AND ${DAY('t.occurred_at')} BETWEEN $2 AND $3
          GROUP BY 1 ORDER BY 1`, ranged), ['income', 'expense', 'net']);

    case 'adjustments':
      return R([
        { key: 'occurred_at', label: 'วันเวลา', kind: 'datetime' }, { key: 'full_name', label: 'ผู้ป่วย' }, { key: 'ward', label: 'หอ' },
        { key: 'type_label', label: 'ประเภท' }, { key: 'direction_label', label: 'ทิศทาง' },
        { key: 'amount', label: 'จำนวนเงิน', kind: 'money' }, { key: 'detail', label: 'รายละเอียด' },
        { key: 'recorder', label: 'ผู้บันทึก' }, { key: 'approver', label: 'ผู้อนุมัติ' },
      ], await q(
        `SELECT t.occurred_at, p.full_name, w.name AS ward, ${TYPE_LABEL} AS type_label,
                CASE t.direction WHEN 'credit' THEN 'เพิ่ม' ELSE 'ลด' END AS direction_label, t.amount,
                COALESCE(e.incident_detail, e.description, t.note) AS detail, ru.full_name AS recorder, du.full_name AS approver
           FROM financial_transactions t JOIN patient_admissions a ON a.id = t.admission_id
           JOIN patients p ON p.id = a.patient_id JOIN wards w ON w.id = t.ward_id
           LEFT JOIN expense_records e ON e.id = t.source_expense_id
           LEFT JOIN approvals ap ON ap.target_type = 'expense_record' AND ap.target_id = t.source_expense_id
           LEFT JOIN users ru ON ru.id = t.created_by LEFT JOIN users du ON du.id = ap.decided_by
          WHERE t.ward_id = ANY($1) AND t.type IN ('adjustment','reversal','deduction') AND ${DAY('t.occurred_at')} BETWEEN $2 AND $3
          ORDER BY t.occurred_at`, ranged), ['amount']);
  }
  throw new Error('ไม่รู้จักประเภทรายงาน');
}

/** Plain display string for any cell, in Asia/Bangkok. Used by HTML preview and PDF. */
export function cellText(v: unknown, kind: Kind = 'text'): string {
  if (v === null || v === undefined || v === '') return '';
  if (kind === 'money') return Number(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (kind === 'int') return Number(v).toLocaleString('th-TH');
  if (kind === 'datetime') return new Date(v as string).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
  if (kind === 'date') return new Date(v as string).toLocaleDateString('th-TH', { dateStyle: 'medium', timeZone: 'UTC' });
  return String(v);
}
