// Fixture tests for the story coverage gate (UI wave 1, criterion 13). Derived from the spec and
// the check() contract, not from the implementation. Run: node --test tools/check-stories.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { check } from "./check-stories.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nestly-check-stories-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

let n = 0;
// files: { "ui/a.tsx": "source" } relative to the components directory.
const tree = (files) => {
  const dir = path.join(tmp, String(n++));
  for (const layer of ["ui", "shared", "layout"]) fs.mkdirSync(path.join(dir, layer), { recursive: true });
  for (const [rel, source] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), source);
  }
  return dir;
};

const component = "export const X = () => null;\n";
const stories = (count, extra = "") =>
  `import type { Meta, StoryObj } from "@storybook/react-vite";\nexport default {} satisfies Meta;\ntype Story = StoryObj;\n` +
  Array.from({ length: count }, (_, i) => `export const S${i}: Story = {};\n`).join("") +
  extra;

describe("check-stories (criterion 13)", () => {
  it("[13] a correct set returns no problems", async () => {
    const dir = tree({
      "ui/a.tsx": component,
      "ui/a.stories.tsx": stories(2),
      "shared/n/y.tsx": component,
      "shared/n/y.stories.tsx": stories(1),
    });
    assert.deepEqual(await check(dir, { "ui/a": 2, "shared/n/y": 1 }), []);
  });

  it("[13] a .tsx component without stories is a problem", async () => {
    const dir = tree({ "ui/a.tsx": component });
    const problems = await check(dir, { "ui/a": 1 });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /a\.tsx/);
  });

  it("[13] a .ts component without stories is a problem", async () => {
    const dir = tree({ "ui/helper.ts": "export const h = 1;\n" });
    const problems = await check(dir, { "ui/helper": 1 });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /helper\.ts/);
  });

  it("[13] a component nested in a sub-folder without stories is a problem", async () => {
    const dir = tree({ "shared/n/y.tsx": component });
    const problems = await check(dir, { "shared/n/y": 1 });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /n\/y\.tsx/);
  });

  it("[13] a stories file with fewer real stories than states is a problem, a helper export does not count", async () => {
    const dir = tree({
      "ui/b.tsx": component,
      "ui/b.stories.tsx": stories(2, "export const helper = () => 1;\n"), // 3 exports, 2 stories
    });
    const problems = await check(dir, { "ui/b": 3 });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /b/);
  });

  it("[13] control: the same file with 3 real stories passes", async () => {
    const dir = tree({ "ui/b.tsx": component, "ui/b.stories.tsx": stories(3, "export const helper = () => 1;\n") });
    assert.deepEqual(await check(dir, { "ui/b": 3 }), []);
  });

  it("[13] a component missing from the states table is a problem", async () => {
    const dir = tree({ "layout/z.tsx": component, "layout/z.stories.tsx": stories(1) });
    assert.equal((await check(dir, {})).length, 1);
  });

  it("[13] one failing component does not hide another", async () => {
    const dir = tree({ "ui/a.tsx": component, "shared/b.tsx": component });
    assert.equal((await check(dir, { "ui/a": 1, "shared/b": 1 })).length, 2);
  });

  it("[13] test files and stories files are not treated as components", async () => {
    const dir = tree({
      "ui/a.tsx": component,
      "ui/a.stories.tsx": stories(1),
      "ui/a.test.tsx": "export {};\n",
    });
    assert.deepEqual(await check(dir, { "ui/a": 1 }), []);
  });
});
