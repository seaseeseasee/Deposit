import { pool } from '@/lib/db.ts';

export const dynamic = 'force-dynamic';

export default async function Categories({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const { error, done } = await searchParams;
  const cats = (await pool.query(`SELECT id, name, requires_approval, is_active FROM expense_categories ORDER BY id`)).rows;
  return (
    <main className="staff">
      <h1 className="h">หมวดค่าใช้จ่าย</h1>
      {error && <div className="error banner" role="alert">{error}</div>}
      {done && <div className="okmsg banner" role="status">{done}</div>}
      <div className="tw"><table>
        <thead><tr><th>หมวด</th><th>ต้องให้หัวหน้าหออนุมัติ</th><th>ใช้งาน</th><th /></tr></thead>
        <tbody>{cats.map((c) => (
          <tr key={c.id}>
            <td>{c.name}</td>
            <td colSpan={3}>
              <form action="/api/admin/category-update" method="post" className="inline">
                <input type="hidden" name="id" value={c.id} />
                <label className="chk" style={{ alignItems: 'center' }}><input type="checkbox" name="approval" defaultChecked={c.requires_approval} /> ต้องอนุมัติ (หักเป็นค่าเสียหาย)</label>
                <label className="chk" style={{ alignItems: 'center' }}><input type="checkbox" name="active" defaultChecked={c.is_active} /> ใช้งาน</label>
                <button className="sm" type="submit">บันทึก</button>
              </form>
            </td>
          </tr>
        ))}</tbody>
      </table></div>
      <form action="/api/admin/category-create" method="post" className="card inline">
        <input name="name" placeholder="ชื่อหมวดใหม่" required aria-label="ชื่อหมวดใหม่" maxLength={80} />
        <label className="chk" style={{ alignItems: 'center' }}><input type="checkbox" name="approval" /> ต้องให้หัวหน้าหออนุมัติ</label>
        <button className="sm" type="submit">เพิ่มหมวด</button>
      </form>
      <p className="muted">ลบหมวดไม่ได้เพราะมีประวัติการเงินอ้างอิง ให้ปิดการใช้งานแทน</p>
    </main>
  );
}
