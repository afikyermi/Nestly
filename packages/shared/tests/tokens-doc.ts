// Parses docs/design/tokens.md (the approved spec). Test helper, not a test.
import tokensMd from '../../../docs/design/tokens.md?raw';

export const doc: string = tokensMd;

const cells = (line: string): string[] =>
  line
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());

const section = (heading: string): string[] => {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith('## ') && l.includes(heading));
  if (start < 0) throw new Error(`tokens.md has no section "${heading}"`);
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return lines.slice(start + 1, end < 0 ? undefined : end);
};

const tableRows = (lines: string[]): string[][] =>
  lines.filter((l) => l.startsWith('|')).map(cells).filter((r) => !r.every((c) => /^-+$/.test(c))).slice(1);

const ticks = (text: string): string[] => [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? '');

// token name -> hex, from the colour table. "a · b" in both columns pairs them in order;
// one value for several names shares it.
export const documentedColors = (): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const row of tableRows(section('צבע'))) {
    const names = ticks(row[0] ?? '');
    const values = ticks(row[1] ?? '');
    names.forEach((name, i) => {
      const value = values.length === 1 ? values[0] : values[i];
      if (value === undefined) throw new Error(`no value for ${name}`);
      out[name] = value.toUpperCase();
    });
  }
  return out;
};

export interface DocumentedPair {
  foreground: string;
  background: string;
  ratio: number;
  threshold: number | null;
}

export const documentedPairs = (): DocumentedPair[] =>
  tableRows(section('ניגודיות'))
    .filter((r) => r.length >= 5)
    .map((r) => {
      const threshold = Number.parseFloat(r[3] ?? '');
      return {
        foreground: (r[0] ?? '').replace(/\(.*\)/, '').trim(),
        background: (r[1] ?? '').replace(/\(.*\)/, '').trim(),
        ratio: Number.parseFloat(r[2] ?? ''),
        threshold: Number.isNaN(threshold) ? null : threshold,
      };
    });

export const typographyRows = (): Record<string, { size: number; line: number; weight: number }> => {
  const out: Record<string, { size: number; line: number; weight: number }> = {};
  for (const row of tableRows(section('טיפוגרפיה'))) {
    const name = ticks(row[0] ?? '')[0];
    const m = /(\d+)\s*\/\s*(\d+)/.exec((row[1] ?? '').replaceAll('*', ''));
    if (name === undefined || m === null) continue;
    out[name] = { size: Number(m[1]), line: Number(m[2]), weight: Number(row[2]) };
  }
  return out;
};

// A row of the "ריווח, פינות וצללים" or "מצבים, מגע ותנועה" tables, found by its first cell.
const rowStartingWith = (heading: string, label: string): string => {
  const row = tableRows(section(heading)).find((r) => (r[0] ?? '').includes(label));
  if (row === undefined) throw new Error(`tokens.md has no row "${label}"`);
  return row[1] ?? '';
};

export const numbersByName = (heading: string, label: string, unit = ''): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const m of rowStartingWith(heading, label).matchAll(new RegExp('`([a-z]+)`\\s*(\\d+)' + unit, 'g'))) {
    out[m[1] ?? ''] = Number(m[2]);
  }
  return out;
};

export const documentedShadows = (): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const row of tableRows(section('ריווח, פינות וצללים'))) {
    const label = /^צל\s+`([a-z]+)`/.exec(row[0] ?? '');
    const value = ticks(row[1] ?? '')[0];
    if (label?.[1] !== undefined && value !== undefined) out[label[1]] = value;
  }
  return out;
};

export const documentedEasing = (): string => {
  const m = /cubic-bezier\([^)]*\)/.exec(rowStartingWith('מצבים, מגע ותנועה', 'תנועה'));
  if (m === null) throw new Error('no easing');
  return m[0];
};

export const documentedSpacing = (): { base: number; rhythm: number[] } => {
  const text = rowStartingWith('ריווח, פינות וצללים', 'ריווח');
  const base = Number(/בסיס של (\d+)px/.exec(text)?.[1]);
  // "16 במובייל ו-20 בדסקטופ · בין כרטיסים 12 · בין אזורים 24 עד 32 · שוליים בצדי המסך 16"
  const rhythm = [16, 20, 12, 24, 32, 16];
  for (const n of rhythm) if (!new RegExp(`\\b${n}\\b`).test(text)) throw new Error(`rhythm ${n} not in tokens.md`);
  return { base, rhythm };
};
