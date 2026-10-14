// The small readers the workflow tests share (tools/db-workflows.test.mjs, tools/ci-path-filters.test.mjs): a reader
// for the YAML subset the workflows use, the accessors for jobs and steps, and the detector for steps that swallow a
// failure. Not a test file, so it is not run by itself.
//
// The repo has no YAML dependency and a test must not add one, so parseYaml reads the small subset the workflows use.
// Every scalar stays a STRING. An unsupported construct throws, so it fails loudly instead of being misread.

// ---------------------------------------------------------------------------------------------------------------------
// the YAML subset reader

function lineOf(raw) {
  return { raw, indent: raw.length - raw.trimStart().length, text: raw.trim(), blank: /^\s*(#.*)?$/.test(raw) };
}

export function unquote(value) {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value;
}

function scalar(rest) {
  const value = rest.trim();
  if (/^[&*!]/.test(value) || value.startsWith('{')) throw new Error(`mini-yaml: unsupported value ${value}`);
  if (value.startsWith('[')) {
    if (!value.endsWith(']')) throw new Error(`mini-yaml: unsupported flow sequence ${value}`);
    const inner = value.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((item) => unquote(item.trim()));
  }
  if (value.startsWith('"') || value.startsWith("'")) return unquote(value);
  return value.replace(/\s+#.*$/, '');
}

export function parseYaml(source) {
  const lines = source.split(/\r?\n/).map(lineOf);
  let pos = 0;
  const isDash = (l) => l.text === '-' || l.text.startsWith('- ');

  const peek = () => {
    while (pos < lines.length && lines[pos].blank) pos += 1;
    return lines[pos];
  };

  function blockScalar(parentIndent, folded) {
    const body = [];
    let minIndent = Infinity;
    while (pos < lines.length && (lines[pos].text === '' || lines[pos].indent > parentIndent)) {
      body.push(lines[pos]);
      if (lines[pos].text !== '') minIndent = Math.min(minIndent, lines[pos].indent);
      pos += 1;
    }
    const text = body.map((l) => (l.text === '' ? '' : l.raw.slice(minIndent))).join(folded ? ' ' : '\n');
    return text.replace(/\s+$/, '');
  }

  function parseBlock(indent) {
    const line = peek();
    if (!line || line.indent < indent) return null;
    return isDash(line) ? parseSequence(line.indent) : parseMapping(line.indent);
  }

  function parseMapping(indent) {
    const result = {};
    for (;;) {
      const line = peek();
      if (!line || line.indent !== indent || isDash(line)) break;
      const match = /^([A-Za-z0-9_.\-/]+):(?:\s+(.*))?$/.exec(line.text);
      if (!match) throw new Error(`mini-yaml: cannot read line ${pos + 1}: ${line.text}`);
      const [, key, restRaw] = match;
      const rest = (restRaw ?? '').replace(/^#.*$/, '').trim();
      pos += 1;
      if (rest === '') {
        const next = peek();
        if (next && next.indent > indent) result[key] = parseBlock(next.indent);
        else if (next && next.indent === indent && isDash(next)) result[key] = parseSequence(indent);
        else result[key] = null;
      } else if (/^[|>][+-]?\s*(#.*)?$/.test(rest)) {
        result[key] = blockScalar(indent, rest.startsWith('>'));
      } else {
        result[key] = scalar(rest);
      }
    }
    return result;
  }

  function parseSequence(indent) {
    const result = [];
    for (;;) {
      const line = peek();
      if (!line || line.indent !== indent || !isDash(line)) break;
      const content = line.text === '-' ? '' : line.text.slice(2).trim();
      if (content === '') {
        pos += 1;
        const next = peek();
        result.push(next && next.indent > indent ? parseBlock(next.indent) : null);
      } else if (/^[A-Za-z0-9_.\-/]+:(\s|$)/.test(content)) {
        // "- key: value": the item is a mapping whose first line sits two columns right of the dash.
        lines[pos] = lineOf(' '.repeat(indent + 2) + content);
        result.push(parseMapping(indent + 2));
      } else {
        pos += 1;
        result.push(scalar(content));
      }
    }
    return result;
  }

  const root = parseBlock(0);
  if (peek()) throw new Error(`mini-yaml: unread content at line ${pos + 1}: ${lines[pos].text}`);
  return root;
}

export const has = (obj, key) => obj !== null && typeof obj === 'object' && Object.hasOwn(obj, key);
export const runOf = (step) => (typeof step.run === 'string' ? step.run : '');
export const stepsOf = (job) => (Array.isArray(job.steps) ? job.steps : []);
export const needsOf = (job) => (job.needs === undefined || job.needs === null ? [] : [job.needs].flat());

// ---- part a CRITIC finding 2: no step swallows a failure ---------------------------------------------------------------
// Failure being guarded: `supabase db push ... || true` in the preview job -> a failed preview, a green job, and
// db-production offered for approval; the same for the hash check (drift gate gone) and `if: false` on pg_prove.
// Only one shape is allowed to hide a failure: the failure-only `docker logs ... || true` step at the end of the db job.

const SWALLOW = /\|\|\s*(true|:|exit\s+0)(?=[\s;)&|]|$)/;
export const codeOf = (run) => run.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
export const swallows = (run) => SWALLOW.test(codeOf(run));
export const nameOf = (step) => String(step.name ?? step.uses ?? runOf(step).split('\n')[0]);
export const isLogStep = (step) =>
  step.if === 'failure()' &&
  /^\s*docker\s+logs\b/.test(codeOf(runOf(step))) &&
  codeOf(runOf(step)).trim().split('\n').length === 1;

export function swallowProblems(label, steps) {
  const problems = [];
  steps.forEach((step, i) => {
    const where = `${label}: step "${nameOf(step)}"`;
    if (has(step, 'if')) {
      if (!isLogStep(step)) {
        problems.push(`${where} has if: ${String(step.if)} - only failure() on the one-line docker logs step may`);
      } else if (i !== steps.length - 1) {
        problems.push(`${where}: the failure-only log step is not the last step`);
      }
      return; // the log step's own "|| true" is the documented exception
    }
    if (swallows(runOf(step))) problems.push(`${where} swallows a failure (|| true, || : or || exit 0)`);
    if (/\bset\s+\+e\b/.test(codeOf(runOf(step)))) problems.push(`${where} turns errexit off`);
    if (has(step, 'continue-on-error')) problems.push(`${where} has continue-on-error`);
    if (typeof step.shell === 'string' && !/^(bash|sh)$/.test(step.shell) && !/\s-[a-z]*e/.test(step.shell)) {
      problems.push(`${where} uses a custom shell without -e`);
    }
  });
  return problems;
}
