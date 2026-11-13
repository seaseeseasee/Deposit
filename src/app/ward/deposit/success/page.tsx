export default async function Success({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  return (
    <main className="page" style={{ paddingTop: 32 }}>
      <div className="done" aria-hidden="true">✓</div>
      <h1 style={{ textAlign: 'center' }}>ส่งข้อมูลเรียบร้อยแล้ว</h1>
      <div style={{ textAlign: 'center' }}>เลขที่อ้างอิงของท่าน</div>
      <div className="ref">{(ref ?? '').slice(0, 40)}</div>
      <div className="alert">
        การส่งสลิปยังไม่ใช่การยืนยันว่าเงินเข้าบัญชีแล้ว เจ้าหน้าที่จะตรวจสอบกับรายการเดินบัญชีของหอผู้ป่วย
      </div>
      <div className="muted" style={{ textAlign: 'center' }}>กรุณาเก็บเลขที่อ้างอิงไว้ หากต้องการสอบถามเจ้าหน้าที่</div>
    </main>
  );
}
