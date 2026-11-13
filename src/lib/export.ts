import path from 'node:path';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { cellText, type Report } from './reports.ts';

export type ExportMeta = { wards: string; range: string | null; by: string; at: string };

const FONT = path.resolve(process.cwd(), 'assets/fonts/NotoSansThai.ttf');

export async function toXlsx(r: Report, meta: ExportMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.by;
  const ws = wb.addWorksheet(r.title.slice(0, 31));
  const head = [r.title, `หอ: ${meta.wards}`, meta.range ? `ช่วงวันที่: ${meta.range}` : '', `ออกโดย ${meta.by} เมื่อ ${meta.at}`, r.note ?? ''];
  head.filter(Boolean).forEach((t, i) => { ws.addRow([t]); ws.getRow(i + 1).font = { bold: i === 0, size: i === 0 ? 14 : 10 }; });
  ws.addRow([]);
  const hr = ws.addRow(r.cols.map((c) => c.label));
  hr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hr.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D7C74' } }; });
  for (const row of r.rows) {
    ws.addRow(r.cols.map((c) => {
      const v = row[c.key];
      if (v === null || v === undefined) return '';
      if (c.kind === 'money' || c.kind === 'int') return Number(v);
      if (c.kind === 'datetime' || c.kind === 'date') return cellText(v, c.kind); // text keeps Bangkok time as shown
      return String(v); // always a string cell, never a formula
    }));
  }
  if (r.totals) {
    const tr = ws.addRow(r.cols.map((c, i) => (i === 0 ? 'รวม' : r.totals![c.key] ?? '')));
    tr.font = { bold: true };
  }
  r.cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.kind === 'money' ? 16 : c.kind === 'datetime' ? 20 : c.kind === 'int' ? 12 : 24;
    if (c.kind === 'money') col.numFmt = '#,##0.00';
  });
  ws.views = [{ state: 'frozen', ySplit: head.filter(Boolean).length + 2 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function toPdf(r: Report, meta: ExportMeta): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30, font: FONT, info: { Title: r.title, Author: meta.by } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const weights = r.cols.map((c) => (c.kind === 'money' ? 1.1 : c.kind === 'datetime' ? 1.3 : c.kind === 'int' || c.kind === 'date' ? 0.9 : 1.6));
    const total = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / total) * width);
    const ROW = 18;
    const align = (k?: string) => (k === 'money' || k === 'int' ? 'right' : 'left');

    const header = () => {
      doc.fontSize(15).fillColor('#14292b').text(r.title, left, doc.page.margins.top, { width });
      doc.fontSize(9).fillColor('#5b7072');
      doc.text(`หอ: ${meta.wards}${meta.range ? `   ช่วงวันที่: ${meta.range}` : ''}`);
      doc.text(`ออกโดย ${meta.by} เมื่อ ${meta.at}${r.note ? `   ·   ${r.note}` : ''}`);
      let y = doc.y + 8;
      doc.rect(left, y, width, ROW).fill('#0d7c74');
      let x = left;
      doc.fillColor('#ffffff').fontSize(9);
      r.cols.forEach((c, i) => {
        doc.text(c.label, x + 3, y + 4, { width: widths[i] - 6, lineBreak: false, ellipsis: true, align: align(c.kind) });
        x += widths[i];
      });
      return y + ROW;
    };

    let y = header();
    const line = (cells: string[], bold = false, shade = false) => {
      if (y + ROW > doc.page.height - doc.page.margins.bottom) { doc.addPage(); y = header(); }
      if (shade) doc.rect(left, y, width, ROW).fill('#eef3f2');
      doc.fillColor('#14292b').strokeColor('#14292b').fontSize(9);
      let x = left;
      cells.forEach((t, i) => {
        doc.text(t, x + 3, y + 4, { width: widths[i] - 6, lineBreak: false, ellipsis: true, align: align(r.cols[i].kind), fill: true, stroke: bold, lineWidth: 0.3 } as never);
        x += widths[i];
      });
      doc.moveTo(left, y + ROW).lineTo(left + width, y + ROW).lineWidth(0.3).strokeColor('#d5e0df').stroke();
      y += ROW;
    };

    r.rows.forEach((row, i) => line(r.cols.map((c) => cellText(row[c.key], c.kind)), false, i % 2 === 1));
    if (r.rows.length === 0) line(['ไม่มีข้อมูลในช่วงที่เลือก', ...r.cols.slice(1).map(() => '')]);
    if (r.totals) line(r.cols.map((c, i) => (i === 0 ? 'รวม' : r.totals![c.key] !== undefined ? cellText(r.totals![c.key], c.kind) : '')), true, true);
    doc.end();
  });
}
