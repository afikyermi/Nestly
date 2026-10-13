// F.14/F.15 (.work/guard-allowlist/bug.md): the whole of guard.test.js and guard-case.test.js
// keeps its result under forced win32, linux and darwin. The force-platform.js preload is
// injected through NODE_OPTIONS, so every guard.js process those files spawn inherits it.
// Run: node --test .claude/hooks/guard-platforms.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');

const PRELOAD = path.join(__dirname, 'force-platform.js');
const FILES = ['guard.test.js', 'guard-case.test.js'];

for (const platform of ['win32', 'linux', 'darwin']) {
  for (const file of FILES) {
    test(`F.14 F.15 ${file} passes in full under forced ${platform}`, () => {
      const r = spawnSync(process.execPath, ['--test', path.join(__dirname, file)], {
        env: {
          ...process.env,
          FORCE_PLATFORM: platform,
          NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${JSON.stringify(PRELOAD)}`.trim(),
        },
        encoding: 'utf8',
      });
      assert.strictEqual(r.status, 0, `${file} failed under ${platform}\n${r.stdout.slice(-3000)}\n${r.stderr.slice(-1000)}`);
    });
  }
}
