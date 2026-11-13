import { getSetting } from '@/lib/settings.ts';

export const dynamic = 'force-dynamic';

export default async function Settings({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const { error, done } = await searchParams;
  const requireHn = await getSetting<boolean>('require_hn', false);
  const retention = await getSetting<number | null>('data_retention_years', null);
  return (
    <main className="staff">
      <h1 className="h">ตั้งค่าระบบและนโยบายข้อมูล</h1>
      {error && <div className="error banner" role="alert">{error}</div>}
      {done && <div className="okmsg banner" role="status">{done}</div>}
      <form action="/api/admin/settings-save" method="post" className="card stack">
        <label className="chk"><input type="checkbox" name="requireHn" defaultChecked={requireHn} /> บังคับให้ญาติกรอก HN ในหน้าฝากเงิน</label>
        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="retention">ระยะเวลาเก็บรักษาข้อมูล (ปี)</label>
          <input id="retention" name="retention" inputMode="numeric" defaultValue={retention ?? ''} placeholder="ยังไม่กำหนด" />
        </div>
        <p className="muted">ค่าระยะเวลาเก็บข้อมูลเป็นนโยบายที่บันทึกไว้เท่านั้น ระบบยังไม่ลบข้อมูลอัตโนมัติ ต้องกำหนดตามนโยบายของโรงพยาบาลและกฎหมายที่เกี่ยวข้อง (เช่น PDPA)</p>
        <button className="sm" type="submit">บันทึก</button>
      </form>
      <p className="muted">ยอดเงินของผู้ป่วยติดลบไม่ได้ (บังคับที่ระดับฐานข้อมูล) จึงไม่มีตัวเลือกให้ปิด</p>
    </main>
  );
}
