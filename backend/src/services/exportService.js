// Data export to CSV (hand-written, RFC 4180 quoting) and PDF (pdfkit).
const PDFDocument = require('pdfkit');

function formatCell(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().replace('T', ' ').slice(0, 16);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

const prettyHeader = (col) => col.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function toCsv(rows, columns = rows.length ? Object.keys(rows[0]) : []) {
  const escape = (v) => {
    let s = formatCell(v);
    // Neutralise spreadsheet formula injection (=, +, -, @ at the start of text).
    if (/^[=+\-@]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(escape).join(',')];
  for (const row of rows) lines.push(columns.map((c) => escape(row[c])).join(','));
  return `﻿${lines.join('\r\n')}\r\n`; // BOM so Excel opens UTF-8 correctly
}

// Streams a PDF table to `stream` (usually the HTTP response).
function writePdf(stream, { title, subtitle, rows, columns = rows.length ? Object.keys(rows[0]) : [] }) {
  const landscape = columns.length > 6;
  const doc = new PDFDocument({ size: 'LETTER', layout: landscape ? 'landscape' : 'portrait', margin: 36 });
  doc.pipe(stream);

  const left = doc.page.margins.left;
  const usable = doc.page.width - left - doc.page.margins.right;
  const fontSize = columns.length > 9 ? 7 : 8.5;

  // Column widths proportional to the longest content (capped), then scaled to fit.
  const weights = columns.map((c) => {
    const longest = Math.max(prettyHeader(c).length, ...rows.slice(0, 200).map((r) => formatCell(r[c]).length));
    return Math.min(Math.max(longest, 4), 40);
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  const widths = weights.map((w) => (w / totalWeight) * usable);

  doc.font('Helvetica-Bold').fontSize(16).fillColor('#1f5130').text(title, { align: 'left' });
  doc.font('Helvetica').fontSize(9).fillColor('#555')
    .text(`${subtitle ? `${subtitle} - ` : ''}Generated ${new Date().toLocaleString()} - ${rows.length} row(s)`);
  doc.moveDown(0.8);

  const drawRow = (cells, { header = false, shade = false } = {}) => {
    doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
    const heights = cells.map((text, i) => doc.heightOfString(text, { width: widths[i] - 6 }));
    const h = Math.max(...heights, fontSize) + 6;
    if (doc.y + h > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      if (!header) drawRow(columns.map(prettyHeader), { header: true });
    }
    const y = doc.y;
    if (header || shade) doc.rect(left, y, usable, h).fill(header ? '#2e7d4f' : '#f1f6f2');
    let x = left;
    cells.forEach((text, i) => {
      doc.fillColor(header ? '#fff' : '#222').text(text, x + 3, y + 3, { width: widths[i] - 6 });
      x += widths[i];
    });
    doc.y = y + h;
    doc.x = left;
  };

  if (!rows.length) {
    doc.font('Helvetica-Oblique').fontSize(11).fillColor('#555').text('No rows to display.');
  } else {
    drawRow(columns.map(prettyHeader), { header: true });
    rows.forEach((r, idx) => drawRow(columns.map((c) => formatCell(r[c])), { shade: idx % 2 === 1 }));
  }
  doc.end();
}

module.exports = { toCsv, writePdf, formatCell };
