export type ImageKind = { mime: 'image/jpeg' | 'image/png' | 'image/webp'; ext: 'jpg' | 'png' | 'webp' };

export const MAX_SLIP_BYTES = 5 * 1024 * 1024;

/** Detects the real type from magic bytes. The client-supplied MIME type is never trusted. */
export function detectImage(b: Uint8Array): ImageKind | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: 'image/png', ext: 'png' };
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP')
    return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/** "1,000" / "1000.5" -> "1000.50". Returns null if not a positive amount with at most 2 decimals. */
export function parseAmount(raw: string): string | null {
  const s = raw.replace(/,/g, '').trim();
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(s)) return null;
  const [i, d = ''] = s.split('.');
  const out = `${i}.${d.padEnd(2, '0')}`;
  return Number(out) > 0 ? out : null;
}

export type DepositInput = {
  patientName: string; hn: string; amount: string; transferAt: Date;
  payerName: string; phone: string; note: string;
};

export function validateDepositFields(
  f: Record<string, string>,
): { ok: true; value: DepositInput } | { ok: false; error: string } {
  const patientName = (f.patientName ?? '').trim();
  const payerName = (f.payerName ?? '').trim();
  const amount = parseAmount(f.amount ?? '');
  const transferAt = new Date(f.transferAt ?? '');
  if (!patientName || patientName.length > 120) return { ok: false, error: 'กรุณากรอกชื่อผู้ป่วย' };
  if (!payerName || payerName.length > 120) return { ok: false, error: 'กรุณากรอกชื่อผู้โอน' };
  if (!amount) return { ok: false, error: 'จำนวนเงินไม่ถูกต้อง' };
  if (Number.isNaN(transferAt.getTime())) return { ok: false, error: 'กรุณาระบุวันและเวลาที่โอน' };
  if (transferAt.getTime() > Date.now() + 5 * 60_000) return { ok: false, error: 'เวลาที่โอนอยู่ในอนาคต' };
  if (Date.now() - transferAt.getTime() > 90 * 86_400_000) return { ok: false, error: 'วันที่โอนเก่าเกินไป กรุณาติดต่อเจ้าหน้าที่' };
  const phone = (f.phone ?? '').trim();
  if (phone && !/^[0-9+\-\s]{6,20}$/.test(phone)) return { ok: false, error: 'เบอร์โทรไม่ถูกต้อง' };
  const note = (f.note ?? '').trim();
  if (note.length > 500) return { ok: false, error: 'หมายเหตุยาวเกินไป' };
  return { ok: true, value: { patientName, hn: (f.hn ?? '').trim().slice(0, 30), amount, transferAt, payerName, phone, note } };
}
