import { getUser } from '@/lib/auth.ts';
import { withTx } from '@/lib/db.ts';
import { toPdf, toXlsx } from '@/lib/export.ts';
import { reportParams } from '@/lib/report-params.ts';
import { buildReport, REPORTS } from '@/lib/reports.ts';
import { allowedWards } from '@/lib/wards.ts';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ type: string }> }) {
  const user = await getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { type } = await params;
  if (!REPORTS[type]) return new Response('Not found', { status: 404 });

  const u = new URL(req.url);
  const format = u.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx';
  const wards = await allowedWards(user);
  const p = reportParams({ ward: u.searchParams.get('ward'), from: u.searchParams.get('from'), to: u.searchParams.get('to') }, wards);
  if (p.wardIds.length === 0) return new Response('No ward access', { status: 403 });

  const report = await buildReport(user.scope, type, p);
  const meta = {
    wards: p.wardNames, range: REPORTS[type].ranged ? `${p.from} ถึง ${p.to}` : null, by: user.fullName,
    at: new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }),
  };
  const body = format === 'pdf' ? await toPdf(report, meta) : await toXlsx(report, meta);

  // Exports of patient/financial data are themselves audited.
  await withTx({ isAdmin: true }, (c) => c.query(
    `INSERT INTO audit_logs (user_id, ward_id, action, entity_type, after_json) VALUES ($1,$2,'report.export','report',$3)`,
    [user.id, p.wardIds.length === 1 ? p.wardIds[0] : null,
     JSON.stringify({ type, format, wards: p.wardIds, from: p.from, to: p.to, rows: report.rows.length })]));

  const name = `${type}-${p.to}.${format}`;
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    },
  });
}
