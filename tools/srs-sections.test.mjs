// The generated SRS outline and index must be current. Run: node --test tools/srs-sections.test.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build, headings, SRS_DIR } from './build-srs-sections.mjs';

const tools = path.dirname(fileURLToPath(import.meta.url));
const check = (script) => execFileSync(process.execPath, [path.join(tools, script), '--check'], { encoding: 'utf8', stdio: 'pipe' });

describe('SRS sections', () => {
  it('SECTIONS.md is current (node tools/build-srs-sections.mjs)', () => { check('build-srs-sections.mjs'); });
  it('INDEX.md and SECTIONS.md are current (node tools/build-srs-index.js)', () => { check('build-srs-index.js'); });
  it('outlines ## and ### headings and skips fenced code', () => {
    assert.deepEqual(headings('# T\n## A\n```\n## no\n```\n### B ###\n#### deep\n'), [{ level: 2, title: 'A' }, { level: 3, title: 'B' }]);
  });
  it('covers 05-functional, leaves out archive and the generated files, has no line numbers', () => {
    const text = build(SRS_DIR);
    assert.match(text, /05-functional\/feed\.md/);
    assert.doesNotMatch(text, /archive|\[SECTIONS\.md\]|\[INDEX\.md\]/);
    assert.doesNotMatch(text, /:\d+\b|line \d+/i);
  });
  it('INDEX.md header points at SECTIONS.md', () => {
    assert.match(execFileSync(process.execPath, ['-e', "process.stdout.write(require('fs').readFileSync(process.argv[1],'utf8'))", path.join(SRS_DIR, 'INDEX.md')], { encoding: 'utf8' }), /\(SECTIONS\.md\)/);
  });
});
