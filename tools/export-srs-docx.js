// Exports the full, current SRS (docs/srs/*.md, the master) as one Word document.
//
// Usage:  node tools/export-srs-docx.js [output.docx]
//         default output: exports/Nestly_SRS_v<version>.docx   (exports/ is git-ignored)
//
// Order = docs/srs/INDEX.md order: the files table, with the 05-functional domain files at §5.
// Rendering mirrors the original Word SRS: A4, Arial 11, right-to-left paragraphs, runs and tables.
// Never edit the exported file — fix the markdown and export again.
'use strict';
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  HeadingLevel, AlignmentType, LevelFormat, Footer, PageNumber,
} = require('docx');

const ROOT = path.resolve(__dirname, '..');
const SRS = path.join(ROOT, 'docs', 'srs');
const FONT = 'Arial';
const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 1134; // A4, 2 cm margins
const CONTENT_W = PAGE_W - 2 * MARGIN;

// ---------- file order from INDEX.md ----------
const index = fs.readFileSync(path.join(SRS, 'INDEX.md'), 'utf8').split(/\r?\n/);
const linkOf = (line) => { const m = line.match(/\]\(([^)]+\.md)\)/); return m ? m[1] : null; };
const sectionOf = (h) => index.slice(index.findIndex((l) => l.startsWith(h)) + 1);
const takeTable = (lines) => { const out = []; let started = false; for (const l of lines) { if (l.startsWith('|')) { started = true; out.push(l); } else if (started) break; } return out; };
const domainFiles = takeTable(sectionOf('### 05-functional')).map(linkOf).filter(Boolean);
const order = [];
for (const row of takeTable(sectionOf('## קבצים'))) {
  if (row.includes('](05-functional/)')) { order.push(...domainFiles); continue; }
  const f = linkOf(row); if (f) order.push(f);
}
if (!order.length || !domainFiles.length) throw new Error('could not read file order from INDEX.md — run tools/build-srs-index.js');

const info = fs.readFileSync(path.join(SRS, '00-document-info.md'), 'utf8');
const version = (info.match(/^\| גרסה \| ([^|]+) \|/m) || [])[1]?.trim() || 'x';
const outPath = path.resolve(process.argv[2] || path.join(ROOT, 'exports', `Nestly_SRS_v${version}.docx`));

// ---------- inline markdown -> runs ----------
const clean = (s) => s.replace(/\\\|/g, '|').replace(/`([^`]*)`/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
function runs(text, extra = {}) {
  const parts = clean(text).split(/(\*\*[^*]+\*\*)/).filter((p) => p !== '');
  return parts.map((p) => {
    const bold = p.startsWith('**') && p.endsWith('**');
    const t = bold ? p.slice(2, -2) : p;
    return new TextRun({ text: t, bold: bold || extra.bold, boldComplexScript: bold || extra.bold, rightToLeft: true, size: extra.size, sizeComplexScript: extra.size });
  });
}
const para = (text, opts = {}) => new Paragraph({ bidirectional: true, children: runs(text, opts.run), ...opts.p });

// ---------- tables ----------
function table(rows) {
  const cells = rows.map((r) => r.replace(/^\|\s?/, '').replace(/\s?\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim()));
  const n = Math.max(...cells.map((r) => r.length));
  // column widths proportional to average text length, each at least 12%
  const avg = Array.from({ length: n }, (_, i) => cells.reduce((a, r) => a + clean(r[i] || '').length, 0) / cells.length + 4);
  let raw = avg.map((a) => a / avg.reduce((x, y) => x + y, 0));
  raw = raw.map((w) => Math.max(w, 0.12)); const sum = raw.reduce((x, y) => x + y, 0);
  const widths = raw.map((w) => Math.floor((w / sum) * CONTENT_W));
  widths[widths.length - 1] += CONTENT_W - widths.reduce((x, y) => x + y, 0);
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'A6A6A6' };
  return new Table({
    visuallyRightToLeft: true,
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: cells.map((r, ri) => new TableRow({
      tableHeader: ri === 0,
      children: Array.from({ length: n }, (_, ci) => new TableCell({
        width: { size: widths[ci], type: WidthType.DXA },
        borders: { top: border, bottom: border, left: border, right: border },
        shading: ri === 0 ? { fill: 'E7E6E6', type: ShadingType.CLEAR, color: 'auto' } : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: (r[ci] || '').split(/\s*<br>\s*/).map((t) => para(t, { run: { bold: ri === 0 }, p: { spacing: { after: 40, line: 264 } } })),
      })),
    })),
  });
}

// ---------- blocks ----------
const children = [];
let functionalHeaderDone = false;
const H = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 };
const heading = (level, text) => children.push(new Paragraph({ bidirectional: true, heading: H[level], children: runs(text) }));

for (const rel of order) {
  const lines = fs.readFileSync(path.join(SRS, rel), 'utf8').split(/\r?\n/);
  const functional = rel.startsWith('05-functional/');
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.trim() === '' || /^\[← /.test(l)) { i++; continue; }
    if (rel.startsWith('00-') && l === '# פרטי המסמך') { i++; continue; }      // generated heading, not SRS text
    let m;
    if (functional && (m = l.match(/^# 5\. (דרישות פונקציונליות) · (.+)$/))) {
      if (!functionalHeaderDone) { heading(1, '5. ' + m[1]); functionalHeaderDone = true; }
      heading(2, m[2]); i++; continue;
    }
    if ((m = l.match(/^(#{1,3}) (.+)$/))) { heading(functional ? m[1].length + 1 : m[1].length, m[2]); i++; continue; }
    if (l.startsWith('|')) {
      const rows = []; while (i < lines.length && lines[i].startsWith('|')) { if (!/^\|[-|: ]+\|$/.test(lines[i])) rows.push(lines[i]); i++; }
      children.push(table(rows)); children.push(new Paragraph({ bidirectional: true, children: [] })); continue;
    }
    if (l.startsWith('>')) {
      while (i < lines.length && lines[i].startsWith('>')) {
        const t = lines[i].replace(/^>\s?/, '');
        if (t) children.push(para(t, { p: { shading: { fill: 'F2F2F2', type: ShadingType.CLEAR, color: 'auto' }, border: { right: { style: BorderStyle.SINGLE, size: 18, color: '7F7F7F', space: 8 } }, indent: { start: 200 }, spacing: { after: 120 } } }));
        i++;
      }
      continue;
    }
    if ((m = l.match(/^(\s*)- (.+)$/))) {
      children.push(new Paragraph({ bidirectional: true, numbering: { reference: 'bullets', level: Math.min(Math.floor(m[1].length / 2), 2) }, children: runs(m[2]) }));
      i++; continue;
    }
    if (/^\*\*[^*]+\*\*$/.test(l) && rel.startsWith('00-')) {                  // cover title lines
      children.push(new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: runs(l, { size: 36 }) }));
      i++; continue;
    }
    children.push(para(l)); i++;
  }
}

// ---------- document ----------
const doc = new Document({
  creator: 'Nestly', title: `Nestly SRS v${version}`, description: 'Exported from docs/srs (markdown master)',
  styles: {
    default: {
      document: { run: { font: FONT, size: 22, sizeComplexScript: 22, rightToLeft: true }, paragraph: { spacing: { after: 160, line: 276 } } },
      heading1: { run: { font: FONT, size: 32, sizeComplexScript: 32, bold: true, boldComplexScript: true, color: '1F3864' }, paragraph: { spacing: { before: 360, after: 160 }, keepNext: true } },
      heading2: { run: { font: FONT, size: 28, sizeComplexScript: 28, bold: true, boldComplexScript: true, color: '2F5496' }, paragraph: { spacing: { before: 280, after: 120 }, keepNext: true } },
      heading3: { run: { font: FONT, size: 24, sizeComplexScript: 24, bold: true, boldComplexScript: true, color: '2F5496' }, paragraph: { spacing: { before: 220, after: 100 }, keepNext: true } },
    },
  },
  numbering: {
    config: [{
      reference: 'bullets',
      levels: [0, 1, 2].map((lvl) => ({ level: lvl, format: LevelFormat.BULLET, text: ['•', '◦', '▪'][lvl], alignment: AlignmentType.START, style: { paragraph: { indent: { start: 360 + lvl * 360, hanging: 260 } } } })),
    }],
  },
  sections: [{
    properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
    footers: { default: new Footer({ children: [new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER, children: [new TextRun({ children: [`Nestly SRS v${version} · עמוד `, PageNumber.CURRENT], rightToLeft: true, size: 18, sizeComplexScript: 18, color: '7F7F7F' })] })] }) },
    children,
  }],
});

fs.mkdirSync(path.dirname(outPath), { recursive: true });
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log(`exported ${order.length} files, ${children.length} blocks → ${path.relative(ROOT, outPath)} (${Math.round(buf.length / 1024)} KB)`);
});
