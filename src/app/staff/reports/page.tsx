import { requireUser } from '@/lib/auth.ts';
import { reportParams } from '@/lib/report-params.ts';
import { buildReport, cellText, REPORTS } from '@/lib/reports.ts';
import { allowedWards } from '@/lib/wards.ts';

export const dynamic = 'force-dynamic';
const PREVIEW_ROWS = 100;

export default async function Reports({ searchParams }: { searchParams: Promise<{ type?: string; ward?: string; from?: string; to?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const type = sp.type && REPORTS[sp.type] ? sp.type : 'patient-deposits';
  const wards = await allowedWards(user);
  const p = reportParams(sp, wards);
  const report = p.wardIds.length ? await buildReport(user.scope, type, p) : null;
  const qs = new URLSearchParams({ ward: sp.ward ?? '', from: p.from, to: p.to }).toString();

  return (
    <main className="staff">
      <h1 className="h">รายงาน</h1>
      <form className="filters" method="get">
        <select name="type" defaultValue={type} aria-label="ประเภทรายงาน">
          {Object.entries(REPORTS).map(([k, v]) => <option key={k} value={k}>{v.title}</option>)}
        </select>
        <select name="ward" defaultValue={sp.ward ?? ''} aria-label="หอผู้ป่วย">
          <option value="">ทุกหอที่มีสิทธิ์</option>
          {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <input type="date" name="from" defaultValue={p.from} aria-label="ตั้งแต่วันที่" disabled={!REPORTS[type].ranged} />
        <input type="date" name="to" defaultValue={p.to} aria-label="ถึงวันที่" disabled={!REPORTS[type].ranged} />
        <button className="sm" type="submit">แสดงรายงาน</button>
      </form>

      {!report ? <p className="muted">ไม่มีหอที่คุณมีสิทธิ์เข้าถึง</p> : (
        <>
          <div className="bar">
            <b>{report.title}</b>
            <span className="muted">{report.rows.length} แถว{report.note ? ` · ${report.note}` : ''}</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <a className="btnlink" href={`/api/reports/${type}?format=xlsx&${qs}`}>ส่งออก Excel</a>
              <a className="btnlink ghost" href={`/api/reports/${type}?format=pdf&${qs}`}>ส่งออก PDF</a>
            </span>
          </div>
          <div className="tw"><table>
            <thead><tr>{report.cols.map((c) => <th key={c.key} className={c.kind === 'money' || c.kind === 'int' ? 'n' : ''}>{c.label}</th>)}</tr></thead>
            <tbody>
              {report.rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                <tr key={i}>{report.cols.map((c) => <td key={c.key} className={c.kind === 'money' || c.kind === 'int' ? 'n' : ''}>{cellText(r[c.key], c.kind)}</td>)}</tr>
              ))}
              {report.rows.length === 0 && <tr><td colSpan={report.cols.length} className="muted">ไม่มีข้อมูลในช่วงที่เลือก</td></tr>}
              {report.totals && (
                <tr style={{ fontWeight: 700 }}>{report.cols.map((c, i) => (
                  <td key={c.key} className={c.kind === 'money' || c.kind === 'int' ? 'n' : ''}>{i === 0 ? 'รวม' : report.totals![c.key] !== undefined ? cellText(report.totals![c.key], c.kind) : ''}</td>
                ))}</tr>
              )}
            </tbody>
          </table></div>
          {report.rows.length > PREVIEW_ROWS && <p className="muted">แสดง {PREVIEW_ROWS} แถวแรก ไฟล์ที่ส่งออกมีครบทั้ง {report.rows.length} แถว</p>}
          <p className="muted">การส่งออกรายงานถูกบันทึกใน Audit log · รายงานมีข้อมูลผู้ป่วย โปรดเก็บรักษาตามนโยบายของโรงพยาบาล</p>
        </>
      )}
    </main>
  );
}
