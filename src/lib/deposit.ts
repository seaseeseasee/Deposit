import { randomBytes } from 'node:crypto';
import { withTx, pool } from './db.ts';
import type { DepositInput, ImageKind } from './validate.ts';

export type Ward = {
  id: number; code: string; name: string; hospital_name: string;
  bank_name: string; account_name: string; account_no: string; qr_image_path: string | null;
};

/** Public data only: ward name and the receiving account. No patient data. */
export async function getPublicWard(slug: string): Promise<Ward | null> {
  const r = await pool.query(
    `SELECT w.id, w.code, w.name, w.hospital_name, b.bank_name, b.account_name, b.account_no, b.qr_image_path
       FROM wards w JOIN ward_bank_accounts b ON b.ward_id = w.id AND b.is_active
      WHERE w.slug = $1 AND w.is_active`,
    [slug],
  );
  return r.rows[0] ?? null;
}

const newRef = (code: string) => {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `${code.toUpperCase()}-${ymd}-${randomBytes(3).toString('hex').toUpperCase()}`;
};

export async function createSubmission(
  ward: Ward,
  f: DepositInput,
  slip: { path: string; sha256: string; kind: ImageKind; size: number },
  ip: string | null,
): Promise<string> {
  return withTx({ wardIds: [ward.id] }, async (c) => {
    // Possible duplicate: same slip file, or same amount + payer within 1 hour of transfer time.
    const dup = await c.query(
      `SELECT s.id FROM deposit_submissions s
         LEFT JOIN deposit_slips sl ON sl.submission_id = s.id
        WHERE s.ward_id = $1 AND s.status <> 'rejected'
          AND (sl.sha256 = $2 OR (s.amount = $3 AND lower(s.payer_name) = lower($4)
               AND abs(extract(epoch FROM (s.transfer_at - $5::timestamptz))) < 3600))
        ORDER BY s.id LIMIT 1`,
      [ward.id, slip.sha256, f.amount, f.payerName, f.transferAt],
    );
    const dupId: number | null = dup.rows[0]?.id ?? null;

    const ref = newRef(ward.code);
    const ins = await c.query(
      `INSERT INTO deposit_submissions
         (ref_no, ward_id, patient_name_input, hn_input, payer_name, amount, transfer_at, phone, note,
          status, duplicate_of_id, client_ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [ref, ward.id, f.patientName, f.hn || null, f.payerName, f.amount, f.transferAt, f.phone || null,
       f.note || null, dupId ? 'duplicate' : 'pending', dupId, ip],
    );
    const id = ins.rows[0].id;
    await c.query(
      `INSERT INTO deposit_slips (submission_id, storage_path, sha256, mime, size_bytes) VALUES ($1,$2,$3,$4,$5)`,
      [id, slip.path, slip.sha256, slip.kind.mime, slip.size],
    );
    await c.query(
      `INSERT INTO audit_logs (user_id, ward_id, action, entity_type, entity_id, after_json, ip)
       VALUES (NULL,$1,'submission.create','deposit_submission',$2,$3,$4)`,
      [ward.id, id, JSON.stringify({ ref_no: ref, amount: f.amount, status: dupId ? 'duplicate' : 'pending' }), ip],
    );
    return ref;
  });
}

export type PublicWard = Omit<Ward, 'code' | 'hospital_name' | 'qr_image_path'> & { slug: string; hospital_name: string; has_qr: boolean };

/** Buildings shown on the public kiosk page: names and receiving accounts only, never patient data. */
export async function listPublicWards(): Promise<PublicWard[]> {
  const r = await pool.query(
    `SELECT w.id, w.slug, w.name, w.hospital_name, b.bank_name, b.account_name, b.account_no, (b.qr_image_path IS NOT NULL) AS has_qr
       FROM wards w JOIN ward_bank_accounts b ON b.ward_id = w.id AND b.is_active
      WHERE w.is_active ORDER BY w.name`);
  return r.rows.map((x) => ({ ...x, id: Number(x.id) }));
}
