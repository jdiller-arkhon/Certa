/**
 * Renders an inspector packet as a PDF (US Letter). Text only, standard Helvetica, so it
 * prints anywhere and stays small. Every page carries the seal: the SHA-256 of the packet's
 * canonical JSON, which the share link's web view also shows, so a printed copy can be
 * compared with the live record.
 */
import type { InspectorPacket } from '@certa/core';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

const W = 612;
const H = 792;
const M = 48;
const INK = rgb(0.07, 0.07, 0.08);
const MUTED = rgb(0.42, 0.42, 0.45);
const RULE = rgb(0.86, 0.86, 0.88);
const LEVEL = { green: rgb(0.11, 0.5, 0.3), amber: rgb(0.7, 0.45, 0.05), red: rgb(0.72, 0.13, 0.15) } as const;

/** Standard fonts are WinAnsi-only; replace anything else so rendering never throws. */
const WIN_ANSI_EXTRA = new Set('—–·’‘“”•…€'.split(''));
export function pdfSafe(s: string): string {
  return [...s].map((c) => (c.charCodeAt(0) < 256 || WIN_ANSI_EXTRA.has(c) ? c : '?')).join('').replace(/[\u0000-\u001f]/g, ' ');
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = pdfSafe(text).split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fit(text: string, font: PDFFont, size: number, width: number): string {
  let t = pdfSafe(text);
  if (font.widthOfTextAtSize(t, size) <= width) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > width) t = t.slice(0, -1);
  return `${t}…`;
}

export async function renderPacketPdf(p: InspectorPacket, opts: { seal: string; expiresAt: string; viewUrl: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`Inspector packet — ${p.subject.name}`));
  doc.setAuthor(pdfSafe(p.organization));
  doc.setCreator('Certa by Arkhon Industries');
  doc.setProducer('Certa');
  doc.setSubject(`Seal ${opts.seal}`);
  doc.setCreationDate(new Date(p.generatedAt));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const pages: PDFPage[] = [page];
  const text = (s: string, x: number, yy: number, size: number, f = font, color = INK) => page.drawText(pdfSafe(s), { x, y: yy, size, font: f, color });
  const ensure = (needed: number) => {
    if (y - needed > M + 56) return;
    page = doc.addPage([W, H]);
    pages.push(page);
    y = H - M;
  };

  // Header
  text('INSPECTOR PACKET', M, y, 8, bold, MUTED);
  text(p.organization, W - M - font.widthOfTextAtSize(pdfSafe(p.organization), 9), y, 9, font, MUTED);
  y -= 30;
  text(fit(p.subject.name, bold, 24, W - 2 * M - 170), M, y, 24, bold);
  // Status pill
  const label = pdfSafe(p.status.label);
  const pw = bold.widthOfTextAtSize(label, 9) + 20;
  page.drawRectangle({ x: W - M - pw, y: y - 4, width: pw, height: 20, color: LEVEL[p.status.level], opacity: 0.12, borderColor: LEVEL[p.status.level], borderWidth: 0.8 });
  text(label, W - M - pw + 10, y + 2, 9, bold, LEVEL[p.status.level]);
  y -= 18;
  text(`${p.subject.type === 'pilot' ? 'Pilot' : 'Aircraft'} · as of ${p.asOf} · ${p.ruleSet}`, M, y, 9, font, MUTED);
  y -= 26;

  // Facts
  const colW = (W - 2 * M) / 2;
  p.subject.facts.forEach(([k, v], i) => {
    const x = M + (i % 2) * colW;
    if (i % 2 === 0 && i > 0) y -= 30;
    text(k.toUpperCase(), x, y, 7, bold, MUTED);
    text(fit(v, font, 11, colW - 12), x, y - 13, 11);
  });
  y -= 44;

  const heading = (s: string) => {
    ensure(40);
    text(s, M, y, 11, bold);
    y -= 8;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: RULE });
    y -= 16;
  };

  // Records
  heading('Records');
  const cols = [M, M + 222, M + 330, M + 405];
  ['ITEM', 'STATUS', 'DUE', 'DETAIL'].forEach((h, i) => text(h, cols[i]!, y, 7, bold, MUTED));
  y -= 14;
  if (!p.records.length) {
    text('No records on file.', M, y, 10, font, MUTED);
    y -= 16;
  }
  for (const r of p.records) {
    const detail = wrap(r.detail || '—', font, 9, W - M - cols[3]!);
    ensure(14 * detail.length + 6);
    page.drawCircle({ x: M + 3, y: y + 3, size: 2.6, color: LEVEL[r.level] });
    text(fit(r.label, font, 10, 204), M + 10, y, 10);
    text(fit(r.status, bold, 9, 104), cols[1]!, y, 9, bold, LEVEL[r.level]);
    text(r.due ?? '—', cols[2]!, y, 9, font, r.due ? INK : MUTED);
    detail.forEach((l, i) => text(l, cols[3]!, y - i * 12, 9, font, MUTED));
    y -= Math.max(18, detail.length * 12 + 6);
  }
  y -= 10;

  // Activity
  heading('Flight activity');
  const stats: [string, string][] = [
    ['Total flights', String(p.activity.flights)],
    ['Total flight time', p.activity.flightTime],
    ['Flights, last 90 days', String(p.activity.last90Flights)],
    ['Flight time, last 90 days', p.activity.last90FlightTime],
  ];
  stats.forEach(([k, v], i) => {
    const x = M + i * ((W - 2 * M) / 4);
    text(k.toUpperCase(), x, y, 6.5, bold, MUTED);
    text(v, x, y - 15, 13, bold);
  });
  y -= 40;

  if (p.recentFlights.length) {
    heading('Recent flights');
    const fc = [M, M + 80, M + 150, M + 330];
    ['DATE (UTC)', 'DURATION', p.subject.type === 'pilot' ? 'AIRCRAFT' : 'PILOT', 'LOCATION'].forEach((h, i) => text(h, fc[i]!, y, 7, bold, MUTED));
    y -= 14;
    for (const f of p.recentFlights) {
      ensure(16);
      text(f.date, fc[0]!, y, 9);
      text(f.duration, fc[1]!, y, 9);
      text(fit(f.with, font, 9, 170), fc[2]!, y, 9);
      text(fit(f.location ?? '—', font, 9, W - M - fc[3]!), fc[3]!, y, 9, font, f.location ? INK : MUTED);
      y -= 15;
    }
  }

  // Footer on every page: seal, validity, disclaimer, page number.
  pages.forEach((pg, i) => {
    page = pg;
    page.drawLine({ start: { x: M, y: M + 46 }, end: { x: W - M, y: M + 46 }, thickness: 0.6, color: RULE });
    text('SEAL (SHA-256)', M, M + 34, 6.5, bold, MUTED);
    page.drawText(opts.seal, { x: M + 62, y: M + 34, size: 7, font: mono, color: INK });
    text(`Page ${i + 1} of ${pages.length}`, W - M - 50, M + 34, 7, font, MUTED);
    text(fit(`Generated ${p.generatedAt.replace('T', ' ').slice(0, 16)} UTC · live record at ${opts.viewUrl} until ${opts.expiresAt.slice(0, 10)}`, font, 7, W - 2 * M), M, M + 22, 7, font, MUTED);
    wrap(p.disclaimer, font, 6.5, W - 2 * M).forEach((l, j) => text(l, M, M + 10 - j * 8, 6.5, font, MUTED));
  });

  return doc.save();
}
