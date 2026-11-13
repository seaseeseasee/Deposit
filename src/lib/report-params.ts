import { validDate } from './reports.ts';
import { pickWardIds, type WardRow } from './wards.ts';

const bangkokDay = (offsetDays = 0) =>
  new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

/** Parses ward/from/to from a query, clamped to the wards the user may see and to a sane date range. */
export function reportParams(q: { ward?: string | null; from?: string | null; to?: string | null }, allowed: WardRow[]) {
  const to = validDate(q.to ?? undefined) ? q.to! : bangkokDay();
  let from = validDate(q.from ?? undefined) ? q.from! : bangkokDay(-29);
  if (from > to) from = to;
  const wardIds = pickWardIds(allowed, q.ward ?? undefined);
  const wardNames = allowed.filter((w) => wardIds.includes(w.id)).map((w) => w.name).join(', ') || '-';
  return { wardIds, from, to, wardNames };
}
