import type { PoolClient } from 'pg';
import { getUser } from '@/lib/auth.ts';
import { withTx } from '@/lib/db.ts';
import { sameOrigin, see } from '@/lib/http.ts';
import { hashPassword } from '@/lib/password.ts';
import { saveSlip } from '@/lib/slip.ts';
import { detectImage, MAX_SLIP_BYTES } from '@/lib/validate.ts';

export const runtime = 'nodejs';

class Bad extends Error {}
const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const need = (v: string, msg: string) => { if (!v) throw new Bad(msg); return v; };
const audit = (c: PoolClient, uid: number, action: string, entity: string, id: number | null, before: unknown, after: unknown, ward: number | null = null) =>
  c.query(`INSERT INTO audit_logs (user_id, ward_id, action, entity_type, entity_id, before_json, after_json) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [uid, ward, action, entity, id, before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after)]);

const PAGE: Record<string, string> = {
  'ward-create': 'wards', 'ward-update': 'wards', 'bank-save': 'wards',
  'user-create': 'users', 'user-active': 'users', 'user-password': 'users', 'user-wards': 'users',
  'category-create': 'categories', 'category-update': 'categories', 'settings-save': 'settings',
};

async function handle(c: PoolClient, action: string, f: FormData, uid: number): Promise<string> {
  switch (action) {
    case 'ward-create': {
      const code = need(s(f, 'code').toUpperCase(), 'กรุณากรอกรหัสหอ');
      const slug = need(s(f, 'slug').toLowerCase(), 'กรุณากรอก slug ของลิงก์');
      if (!/^[A-Z0-9-]{1,10}$/.test(code)) throw new Bad('รหัสหอใช้ A-Z 0-9 และ - ได้ไม่เกิน 10 ตัว');
      if (!/^[a-z0-9-]{2,40}$/.test(slug)) throw new Bad('slug ใช้ a-z 0-9 และ - ได้ 2-40 ตัว');
      const w = (await c.query(`INSERT INTO wards (code, slug, name, hospital_name) VALUES ($1,$2,$3,$4) RETURNING id`,
        [code, slug, need(s(f, 'name'), 'กรุณากรอกชื่อหอ'), need(s(f, 'hospital'), 'กรุณากรอกชื่อโรงพยาบาล')])).rows[0];
      await c.query(`INSERT INTO ward_bank_accounts (ward_id, bank_name, account_name, account_no) VALUES ($1,$2,$3,$4)`,
        [w.id, need(s(f, 'bank'), 'กรุณากรอกธนาคาร'), need(s(f, 'accountName'), 'กรุณากรอกชื่อบัญชี'), need(s(f, 'accountNo'), 'กรุณากรอกเลขบัญชี')]);
      await audit(c, uid, 'admin.ward.create', 'ward', w.id, null, { code, slug, name: s(f, 'name') }, w.id);
      return 'เพิ่มหอผู้ป่วยแล้ว';
    }
    case 'ward-update': {
      const id = Number(f.get('id'));
      const before = (await c.query(`SELECT name, hospital_name, is_active FROM wards WHERE id = $1 FOR UPDATE`, [id])).rows[0];
      if (!before) throw new Bad('ไม่พบหอ');
      const after = { name: need(s(f, 'name'), 'กรุณากรอกชื่อหอ'), hospital_name: need(s(f, 'hospital'), 'กรุณากรอกชื่อโรงพยาบาล'), is_active: f.get('active') === 'on' };
      await c.query(`UPDATE wards SET name=$1, hospital_name=$2, is_active=$3 WHERE id=$4`, [after.name, after.hospital_name, after.is_active, id]);
      await audit(c, uid, 'admin.ward.update', 'ward', id, before, after, id);
      return 'บันทึกข้อมูลหอแล้ว';
    }
    case 'bank-save': {
      const id = Number(f.get('id'));
      const next = { bank_name: need(s(f, 'bank'), 'กรุณากรอกธนาคาร'), account_name: need(s(f, 'accountName'), 'กรุณากรอกชื่อบัญชี'), account_no: need(s(f, 'accountNo'), 'กรุณากรอกเลขบัญชี') };
      let qr: string | null = null;
      const file = f.get('qr');
      if (file instanceof File && file.size > 0) {
        if (file.size > MAX_SLIP_BYTES) throw new Bad('ไฟล์ QR ใหญ่เกิน 5 MB');
        const bytes = new Uint8Array(await file.arrayBuffer());
        const kind = detectImage(bytes);
        if (!kind) throw new Bad('QR รองรับเฉพาะรูปภาพ JPG, PNG หรือ WebP');
        qr = await saveSlip(bytes, kind);
      }
      const cur = (await c.query(`SELECT id, bank_name, account_name, account_no, qr_image_path FROM ward_bank_accounts WHERE ward_id=$1 AND is_active FOR UPDATE`, [id])).rows[0];
      if (cur) {
        await c.query(`UPDATE ward_bank_accounts SET bank_name=$1, account_name=$2, account_no=$3, qr_image_path=$4 WHERE id=$5`,
          [next.bank_name, next.account_name, next.account_no, qr ?? cur.qr_image_path, cur.id]);
      } else {
        await c.query(`INSERT INTO ward_bank_accounts (ward_id, bank_name, account_name, account_no, qr_image_path) VALUES ($1,$2,$3,$4,$5)`,
          [id, next.bank_name, next.account_name, next.account_no, qr]);
      }
      // Receiving-account changes are a fraud risk, so before/after are always logged.
      await audit(c, uid, 'admin.bank.save', 'ward_bank_account', cur?.id ?? null,
        cur ? { bank_name: cur.bank_name, account_name: cur.account_name, account_no: cur.account_no } : null,
        { ...next, qr_changed: !!qr }, id);
      return 'บันทึกบัญชีรับโอนแล้ว';
    }
    case 'user-create': {
      const username = need(s(f, 'username'), 'กรุณากรอกชื่อผู้ใช้');
      const password = String(f.get('password') ?? '');
      const role = s(f, 'role');
      if (!/^[a-zA-Z0-9._-]{3,30}$/.test(username)) throw new Bad('ชื่อผู้ใช้ใช้ a-z 0-9 . _ - ได้ 3-30 ตัว');
      if (password.length < 8) throw new Bad('รหัสผ่านอย่างน้อย 8 ตัวอักษร');
      if (!['staff', 'manager', 'admin'].includes(role)) throw new Bad('บทบาทไม่ถูกต้อง');
      const u = (await c.query(`INSERT INTO users (username, password_hash, full_name, role) VALUES ($1,$2,$3,$4) RETURNING id`,
        [username, await hashPassword(password), need(s(f, 'fullName'), 'กรุณากรอกชื่อ-นามสกุล'), role])).rows[0];
      if (role !== 'admin') for (const w of f.getAll('wards').map(Number).filter(Number.isInteger))
        await c.query(`INSERT INTO user_ward_permissions (user_id, ward_id, role_in_ward) VALUES ($1,$2,$3)`, [u.id, w, role]);
      await audit(c, uid, 'admin.user.create', 'user', u.id, null, { username, role, wards: f.getAll('wards') });
      return 'สร้างผู้ใช้แล้ว';
    }
    case 'user-active': {
      const id = Number(f.get('id')); const active = f.get('active') === '1';
      if (id === uid && !active) throw new Bad('ปิดบัญชีของตนเองไม่ได้');
      await c.query(`UPDATE users SET is_active = $1 WHERE id = $2`, [active, id]);
      if (!active) await c.query(`DELETE FROM sessions WHERE user_id = $1`, [id]);
      await audit(c, uid, active ? 'admin.user.enable' : 'admin.user.disable', 'user', id, { is_active: !active }, { is_active: active });
      return active ? 'เปิดใช้งานบัญชีแล้ว' : 'ปิดใช้งานบัญชีแล้ว';
    }
    case 'user-password': {
      const id = Number(f.get('id')); const pw = String(f.get('password') ?? '');
      if (pw.length < 8) throw new Bad('รหัสผ่านอย่างน้อย 8 ตัวอักษร');
      await c.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [await hashPassword(pw), id]);
      await c.query(`DELETE FROM sessions WHERE user_id = $1`, [id]);
      await audit(c, uid, 'admin.user.password_reset', 'user', id, null, null);
      return 'รีเซ็ตรหัสผ่านแล้ว (ผู้ใช้ต้องเข้าสู่ระบบใหม่)';
    }
    case 'user-wards': {
      const id = Number(f.get('id'));
      const u = (await c.query(`SELECT role FROM users WHERE id = $1`, [id])).rows[0];
      if (!u) throw new Bad('ไม่พบผู้ใช้');
      if (u.role === 'admin') throw new Bad('ผู้ดูแลระบบเข้าถึงทุกหออยู่แล้ว');
      const before = (await c.query(`SELECT ward_id FROM user_ward_permissions WHERE user_id = $1 ORDER BY ward_id`, [id])).rows.map((r) => Number(r.ward_id));
      const wards = f.getAll('wards').map(Number).filter(Number.isInteger);
      await c.query(`DELETE FROM user_ward_permissions WHERE user_id = $1`, [id]);
      for (const w of wards) await c.query(`INSERT INTO user_ward_permissions (user_id, ward_id, role_in_ward) VALUES ($1,$2,$3)`, [id, w, u.role]);
      await c.query(`DELETE FROM sessions WHERE user_id = $1`, [id]);
      await audit(c, uid, 'admin.user.wards', 'user', id, { wards: before }, { wards });
      return 'บันทึกสิทธิ์รายหอแล้ว';
    }
    case 'category-create': {
      const name = need(s(f, 'name'), 'กรุณากรอกชื่อหมวด');
      const r = (await c.query(`INSERT INTO expense_categories (name, requires_approval) VALUES ($1,$2) RETURNING id`, [name, f.get('approval') === 'on'])).rows[0];
      await audit(c, uid, 'admin.category.create', 'expense_category', r.id, null, { name, requires_approval: f.get('approval') === 'on' });
      return 'เพิ่มหมวดแล้ว';
    }
    case 'category-update': {
      const id = Number(f.get('id'));
      const before = (await c.query(`SELECT is_active, requires_approval FROM expense_categories WHERE id = $1 FOR UPDATE`, [id])).rows[0];
      if (!before) throw new Bad('ไม่พบหมวด');
      const after = { is_active: f.get('active') === 'on', requires_approval: f.get('approval') === 'on' };
      await c.query(`UPDATE expense_categories SET is_active=$1, requires_approval=$2 WHERE id=$3`, [after.is_active, after.requires_approval, id]);
      await audit(c, uid, 'admin.category.update', 'expense_category', id, before, after);
      return 'บันทึกหมวดแล้ว';
    }
    case 'settings-save': {
      const retention = s(f, 'retention');
      if (retention && !/^\d{1,2}$/.test(retention)) throw new Bad('ระยะเวลาเก็บข้อมูลเป็นจำนวนปี (ตัวเลข)');
      const next = { require_hn: f.get('requireHn') === 'on', data_retention_years: retention ? Number(retention) : null };
      const before = Object.fromEntries((await c.query(`SELECT key, value_json FROM system_settings WHERE key IN ('require_hn','data_retention_years')`)).rows.map((r) => [r.key, r.value_json]));
      for (const [k, v] of Object.entries(next))
        await c.query(`INSERT INTO system_settings (key, value_json, updated_by) VALUES ($1,$2,$3)
                       ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [k, JSON.stringify(v), uid]);
      await audit(c, uid, 'admin.settings.save', 'system_settings', null, before, next);
      return 'บันทึกการตั้งค่าแล้ว';
    }
  }
  throw new Bad('ไม่รู้จักคำสั่ง');
}

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  if (!sameOrigin(req)) return new Response('Forbidden', { status: 403 });
  const user = await getUser();
  if (!user) return see('/login');
  const { action } = await params;
  if (user.role !== 'admin' || !PAGE[action]) return new Response('Forbidden', { status: 403 });
  const page = `/admin/${PAGE[action]}`;
  const f = await req.formData();
  try {
    const msg = await withTx({ isAdmin: true }, (c) => handle(c, action, f, user.id));
    return see(`${page}?done=${encodeURIComponent(msg)}`);
  } catch (e) {
    let msg = e instanceof Error ? e.message : 'เกิดข้อผิดพลาด';
    if (!(e instanceof Bad)) msg = /duplicate key/.test(msg) ? 'ข้อมูลซ้ำกับที่มีอยู่แล้ว (รหัส/slug/ชื่อผู้ใช้/ชื่อหมวด)' : 'บันทึกไม่สำเร็จ';
    return see(`${page}?error=${encodeURIComponent(msg)}`);
  }
}
