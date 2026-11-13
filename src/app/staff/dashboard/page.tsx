import { expensesEnabled } from '@/lib/features.ts';
import { requireUser } from '@/lib/auth.ts';
import { withTx } from '@/lib/db.ts';
import { baht, dateTime } from '@/lib/format.ts';
import { allowedWards, pickWardIds } from '@/lib/wards.ts';

export const dynamic = 'force-dynamic';

const TODAY = `(now() AT TIME ZONE 'Asia/Bangkok')::date`;
const LOCAL = (col: string) => `(${col} AT TIME ZONE 'Asia/Bangkok')::date`;
const NOT_TRANSFER = `t.type NOT IN ('transfer_in','transfer_out')`;

function Bars({ values, cls = '' }: { values: number[]; cls?: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className={`bars ${cls}`} role="img" aria-label={`สูงสุด ${baht(max)} บาท`}>
      {values.map((v, i) => <i key={i} style={{ height: `${Math.max(v > 0 ? 3 : 0, (v / max) * 100)}%` }} title={baht(v)} />)}
    </div>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ ward?: string; days?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const wards = await allowedWards(user);
  const wardIds = pickWardIds(wards, sp.ward);
  const ex = expensesEnabled();
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;

  const d = await withTx(user.scope, async (c) => {
    const one = async (sql: string, p: unknown[]) => (await c.query(sql, p)).rows[0];
    const totals = await one(
      `SELECT COALESCE(SUM(total_deposited),0) AS dep, COALESCE(SUM(balance),0) AS bal,
              COUNT(*) FILTER (WHERE balance > 0) AS pts
         FROM v_admission_balance WHERE ward_id = ANY($1)`, [wardIds]);
    const today = await one(
      `SELECT COALESCE(SUM(t.amount) FILTER (WHERE t.direction='credit'),0) AS inc,
              COALESCE(SUM(t.amount) FILTER (WHERE t.direction='debit'),0) AS exp
         FROM financial_transactions t
        WHERE t.ward_id = ANY($1) AND ${NOT_TRANSFER} AND ${LOCAL('t.occurred_at')} = ${TODAY}`, [wardIds]);
    const pending = await one(
      `SELECT COUNT(*) AS n FROM deposit_submissions WHERE ward_id = ANY($1) AND status IN ('pending','duplicate')`, [wardIds]);
    const daily = (await c.query(
      `SELECT d::date AS day,
              COALESCE(SUM(t.amount) FILTER (WHERE t.direction='credit'),0) AS inc,
              COALESCE(SUM(t.amount) FILTER (WHERE t.direction='debit'),0) AS exp
         FROM generate_series(${TODAY} - ($2::int - 1), ${TODAY}, interval '1 day') d
         LEFT JOIN financial_transactions t ON t.ward_id = ANY($1) AND ${NOT_TRANSFER}
              AND ${LOCAL('t.occurred_at')} = d::date
        GROUP BY d ORDER BY d`, [wardIds, days])).rows;
    const monthly = (await c.query(
      `SELECT to_char(m, 'MM/YYYY') AS label,
              COALESCE(SUM(t.amount) FILTER (WHERE t.direction='credit'),0) AS inc,
              COALESCE(SUM(t.amount) FILTER (WHERE t.direction='debit'),0) AS exp
         FROM generate_series(date_trunc('month', ${TODAY}::timestamp) - interval '5 months',
                              date_trunc('month', ${TODAY}::timestamp), interval '1 month') m
         LEFT JOIN financial_transactions t ON t.ward_id = ANY($1) AND ${NOT_TRANSFER}
              AND date_trunc('month', t.occurred_at AT TIME ZONE 'Asia/Bangkok') = m
        GROUP BY m ORDER BY m`, [wardIds])).rows;
    const share = (await c.query(
      `SELECT cat.name, SUM(e.amount) AS total
         FROM expense_records e JOIN expense_categories cat ON cat.id = e.category_id
        WHERE e.ward_id = ANY($1) AND e.status = 'approved' AND e.spent_at >= ${TODAY} - ($2::int - 1)
        GROUP BY cat.name ORDER BY total DESC`, [wardIds, days])).rows;
    const latest = (await c.query(
      `SELECT t.occurred_at, t.txn_no, t.type, t.direction, t.amount, p.full_name, e.description
         FROM financial_transactions t
         JOIN patient_admissions a ON a.id = t.admission_id JOIN patients p ON p.id = a.patient_id
         LEFT JOIN expense_records e ON e.id = t.source_expense_id
        WHERE t.ward_id = ANY($1) ORDER BY t.id DESC LIMIT 10`, [wardIds])).rows;
    return { totals, today, pending, daily, monthly, share, latest };
  });

  const shareMax = Math.max(1, ...d.share.map((s) => Number(s.total)));
  const label = { deposit: 'ฝากเงิน', expense: 'รายจ่าย', deduction: 'หักเงิน', adjustment: 'ปรับปรุง', reversal: 'ยกเลิก', refund: 'คืนเงิน' } as Record<string, string>;
  const first = d.daily[0]?.day, last = d.daily.at(-1)?.day;
  const short = (x: Date) => new Date(x).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'UTC' });

  return (
    <main className="staff">
      <h1 className="h">Dashboard</h1>
      <form className="filters" method="get">
        <select name="ward" defaultValue={sp.ward ?? ''} aria-label="หอผู้ป่วย">
          <option value="">ทุกหอที่มีสิทธิ์</option>
          {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select name="days" defaultValue={String(days)} aria-label="ช่วงเวลา">
          <option value="7">7 วันล่าสุด</option><option value="30">30 วันล่าสุด</option><option value="90">90 วันล่าสุด</option>
        </select>
        <button className="sm" type="submit">แสดง</button>
      </form>

      <section className="cards" aria-label="สรุป">
        <div className="card"><div className="k">ยอดเงินฝากสะสมทั้งหมด</div><div className="v">{baht(d.totals.dep)}</div></div>
        <div className="card"><div className="k">รับเข้าวันนี้</div><div className="v in">{baht(d.today.inc)}</div></div>
        {ex && <div className="card"><div className="k">จ่ายวันนี้</div><div className="v out">{baht(d.today.exp)}</div></div>}
        {ex && <div className="card"><div className="k">คงเหลือรวม</div><div className="v">{baht(d.totals.bal)}</div></div>}
        <div className={`card ${Number(d.pending.n) > 0 ? 'attn' : ''}`}><div className="k">รอตรวจสอบ</div><div className="v">{d.pending.n}</div></div>
        <div className="card"><div className="k">ผู้ป่วยที่มีเงินคงเหลือ</div><div className="v">{d.totals.pts}</div></div>
      </section>

      <section className="charts">
        <div className="card"><h2 className="h">รายรับรายวัน ({days} วัน)</h2>
          <Bars values={d.daily.map((r) => Number(r.inc))} />
          <div className="legend"><span>{first && short(first)}</span><span>{last && short(last)}</span></div></div>
        {ex && (<div className="card"><h2 className="h">รายจ่ายรายวัน ({days} วัน)</h2>
          <Bars cls="o" values={d.daily.map((r) => Number(r.exp))} />
          <div className="legend"><span>{first && short(first)}</span><span>{last && short(last)}</span></div></div>)}
        <div className="card"><h2 className="h">{ex ? 'รับ-จ่ายรายเดือน' : 'ยอดรับรายเดือน'} (6 เดือน)</h2>
          <div className="bars" style={{ gap: 10 }}>
            {(() => {
              const max = Math.max(1, ...d.monthly.flatMap((m) => [Number(m.inc), Number(m.exp)]));
              return d.monthly.map((m) => (
                <div className="pair" key={m.label} title={`${m.label}: รับ ${baht(m.inc)} / จ่าย ${baht(m.exp)}`}>
                  <i style={{ height: `${(Number(m.inc) / max) * 100}%`, background: 'var(--accent)' }} />
                  {ex && <i className="o" style={{ height: `${(Number(m.exp) / max) * 100}%` }} />}
                </div>
              ));
            })()}
          </div>
          <div className="legend">{d.monthly.map((m) => <span key={m.label}>{m.label.slice(0, 2)}</span>)}</div>
          {ex && <div className="legend"><span><b className="in">■</b> รับ</span><span><b className="out">■</b> จ่าย</span></div>}</div>
        {ex && (<div className="card"><h2 className="h">สัดส่วนค่าใช้จ่ายตามประเภท ({days} วัน)</h2>
          {d.share.length === 0 ? <p className="muted">ยังไม่มีรายจ่ายในช่วงนี้</p> : (
            <div className="share">
              {d.share.map((s) => (
                <div key={s.name} style={{ display: 'contents' }}>
                  <span>{s.name}</span><span className="n">{baht(s.total)}</span>
                  <div className="t" style={{ gridColumn: '1 / -1' }}><b style={{ width: `${(Number(s.total) / shareMax) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}</div>)}
      </section>

      <section>
        <h2 className="h" style={{ marginBottom: 8 }}>รายการล่าสุด</h2>
        <div className="tw"><table>
          <thead><tr><th>เวลา</th><th>ผู้ป่วย</th><th>รายการ</th><th className="n">รายรับ</th>{ex && <th className="n">รายจ่าย</th>}</tr></thead>
          <tbody>
            {d.latest.filter((r) => ex || r.direction === 'credit').map((r) => (
              <tr key={r.txn_no}>
                <td>{dateTime(r.occurred_at)}</td><td>{r.full_name}</td>
                <td>{label[r.type] ?? r.type}{r.description ? ` · ${r.description}` : ''}</td>
                <td className="n in">{r.direction === 'credit' ? baht(r.amount) : ''}</td>
                {ex && <td className="n out">{r.direction === 'debit' ? baht(r.amount) : ''}</td>}
              </tr>
            ))}
            {d.latest.length === 0 && <tr><td colSpan={ex ? 5 : 4} className="muted">ยังไม่มีรายการ</td></tr>}
          </tbody>
        </table></div>
      </section>
      <p className="muted">รับเข้า/จ่ายออก นับจากรายการในบัญชีที่ยืนยันแล้วเท่านั้น (ไม่นับสลิปที่ยังรอตรวจ) เวลาอิง Asia/Bangkok</p>
    </main>
  );
}
