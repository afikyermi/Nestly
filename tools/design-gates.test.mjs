// Tests for UI wave 1, part a: criteria 1, 2, 8, 9 (lint and CI gates, generated CSS).
// Derived from .work/ui-wave-1/spec.md and docs/design/tokens.md, not from the implementation.
// Run: node --test tools/design-gates.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The repo's own eslint.config.mjs is used. The only override: the fixtures are
// virtual files that no tsconfig lists, so type-aware parsing is switched off for them.
const eslint = new ESLint({
  cwd: root,
  overrideConfig: [
    {
      files: ["**/*.{ts,tsx}"],
      ...tseslint.configs.disableTypeChecked,
      languageOptions: { parserOptions: { project: false, projectService: false } },
    },
  ],
});

const lint = async (code, filePath) => {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, filePath) });
  const fatal = result.messages.filter((m) => m.fatal);
  assert.deepEqual(fatal.map((m) => m.message), [], `fixture failed to parse: ${filePath}`);
  return result.messages;
};
const rulesOf = async (code, filePath) => (await lint(code, filePath)).map((m) => m.ruleId);
const designRulesOf = async (code, filePath) =>
  (await rulesOf(code, filePath)).filter((id) => typeof id === "string" && id.startsWith("nestly/"));

const WEB = "apps/web/src/components/shared/Fixture.tsx";
const jsx = (cls) => `export const A = () => <div className="${cls}" />;\n`;

describe("UI-wave-1 criterion 1 (L): physical direction classes are rejected", () => {
  for (const cls of ["ml-4", "pr-2", "left-0", "text-right", "border-l", "rounded-tr-lg"]) {
    it(`[UI-1] rejects ${cls} with nestly/no-physical-direction`, async () => {
      assert.ok((await designRulesOf(jsx(cls), WEB)).includes("nestly/no-physical-direction"));
    });
  }
  for (const cls of ["ms-4", "pe-2", "start-0", "text-start", "border-s", "rounded-se-lg", "bg-primary"]) {
    it(`[UI-1] passes the logical/token class ${cls} (no design report)`, async () => {
      assert.deepEqual(await designRulesOf(jsx(cls), WEB), []);
    });
  }
  it("[UI-1] passes all logical examples together", async () => {
    const all = "ms-4 pe-2 start-0 text-start border-s rounded-se-lg bg-primary";
    assert.deepEqual(await designRulesOf(jsx(all), WEB), []);
  });
  // Beyond the literal list: the same class in the places real code puts it.
  it("[UI-1] rejects a physical class among others, behind a variant, negated, and in a template literal", async () => {
    for (const code of [
      jsx("flex items-center ml-4 gap-2"),
      jsx("md:ml-4"),
      jsx("-ml-4"),
      "export const c = `flex ${'x'} pr-2`;\n",
    ]) {
      assert.ok((await designRulesOf(code, WEB)).includes("nestly/no-physical-direction"), code);
    }
  });
});

describe("UI-wave-1 criterion 1 (L): arbitrary values are rejected", () => {
  for (const cls of ["w-[13px]", "bg-[#fff]", "p-[1.5rem]"]) {
    it(`[UI-1] rejects ${cls} with nestly/no-arbitrary-value`, async () => {
      assert.ok((await designRulesOf(jsx(cls), WEB)).includes("nestly/no-arbitrary-value"));
    });
  }
});

describe("UI-wave-1 criterion 1 (L): hex colours are rejected outside the token source", () => {
  const cases = [
    ["ts", "export const c = 'HEX';\n"],
    ["tsx", "export const A = () => <i style={{ color: 'HEX' }} />;\n"],
    ["css", ".a { color: HEX; }\n"],
    ["svg", '<svg xmlns="http://www.w3.org/2000/svg"><path fill="HEX" d="M0 0"/></svg>\n'],
  ];
  for (const base of ["apps/web/src", "packages/shared/src"]) {
    for (const [ext, template] of cases) {
      for (const hex of ["#B5502C", "#fff"]) {
        it(`[UI-1] rejects ${hex} in ${base}/x.${ext} with nestly/no-hex`, async () => {
          const rules = await rulesOf(template.replace("HEX", hex), `${base}/fixtures/x.${ext}`);
          assert.ok(rules.includes("nestly/no-hex"), `got ${JSON.stringify(rules)}`);
        });
      }
    }
  }
  it("[UI-1] allows hex inside packages/shared/src/design-tokens/", async () => {
    assert.deepEqual(await designRulesOf("export const c = '#B5502C';\n", "packages/shared/src/design-tokens/x.ts"), []);
  });
  it("[UI-1] allows hex in a CSS file inside packages/shared/src/design-tokens/", async () => {
    assert.deepEqual(await designRulesOf(".a { color: #B5502C; }\n", "packages/shared/src/design-tokens/x.css"), []);
  });
  it("[UI-1] does not report a non-colour such as a URL fragment or an id as hex", async () => {
    assert.deepEqual(await designRulesOf("export const href = '/page#section';\n", "apps/web/src/lib/x.ts"), []);
  });
});

describe("UI-wave-1 criterion 1 (L): Radix is imported only inside components/ui", () => {
  for (const spec of ["@radix-ui/react-dialog", "radix-ui"]) {
    for (const where of ["apps/web/src/components/shared/X.tsx", "apps/web/src/features/auth/X.tsx"]) {
      it(`[UI-1] rejects import from "${spec}" in ${where}`, async () => {
        const code = `import * as R from "${spec}";\nexport const a = R;\n`;
        assert.ok((await designRulesOf(code, where)).includes("nestly/no-radix-outside-ui"));
      });
    }
    it(`[UI-1] passes import from "${spec}" inside apps/web/src/components/ui`, async () => {
      const code = `import * as R from "${spec}";\nexport const a = R;\n`;
      assert.deepEqual(await designRulesOf(code, "apps/web/src/components/ui/X.tsx"), []);
    });
  }
});

describe("UI-wave-1 criterion 2 (L): lint is part of CI and fails the build", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  it("[UI-2] the lint script has no warnings allowed", () => {
    assert.match(pkg.scripts.lint, /eslint/);
    assert.match(pkg.scripts.lint, /--max-warnings 0/);
  });
  it("[UI-2] the ci script runs lint", () => {
    assert.match(pkg.scripts.ci, /npm run lint/);
  });
  it("[UI-2] design violations are errors, not warnings", async () => {
    const messages = await lint(jsx("ml-4"), WEB);
    const hit = messages.find((m) => m.ruleId === "nestly/no-physical-direction");
    assert.equal(hit?.severity, 2);
  });
});

describe("UI-wave-1 criterion 9 (L): the token source imports no DOM and no Node API", () => {
  const where = "packages/shared/src/design-tokens/x.ts";
  it("[UI-9] a Node built-in import is rejected", async () => {
    assert.ok((await rulesOf("import fs from 'node:fs';\nexport const a = fs;\n", where)).includes("no-restricted-imports"));
  });
  it("[UI-9] a DOM global is rejected", async () => {
    assert.ok((await rulesOf("export const a = document.title;\n", where)).includes("no-restricted-globals"));
  });
  it("[UI-9] react-dom is rejected", async () => {
    assert.ok((await rulesOf("import { createRoot } from 'react-dom/client';\nexport const a = createRoot;\n", where)).length > 0);
  });
});

describe("UI-wave-1 criterion 8 (L): the generated CSS", () => {
  const generated = path.join(root, "apps/web/src/styles/tokens.generated.css");
  const css = fs.readFileSync(generated, "utf8");

  const themeBlock = () => {
    const start = css.search(/@theme\b[^{]*\{/);
    assert.ok(start >= 0, "no @theme block");
    let depth = 0;
    for (let i = css.indexOf("{", start); i < css.length; i++) {
      if (css[i] === "{") depth++;
      if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
    }
    throw new Error("unterminated @theme block");
  };

  it("[UI-8] contains --color-primary: #B5502C inside @theme", () => {
    assert.match(themeBlock(), /--color-primary:\s*#B5502C\s*;/i);
  });
  it("[UI-8] has no .dark block and no dark: variant", () => {
    assert.doesNotMatch(css, /\.dark\b/);
    assert.doesNotMatch(css, /dark:/);
    assert.doesNotMatch(css, /prefers-color-scheme/);
  });
  it("[UI-8] the generator is deterministic: a second run produces identical bytes", () => {
    const before = fs.readFileSync(generated);
    execFileSync(process.execPath, [path.join(root, "tools/build-design-tokens.js")], { cwd: root });
    const middle = fs.readFileSync(generated);
    execFileSync(process.execPath, [path.join(root, "tools/build-design-tokens.js")], { cwd: root });
    const after = fs.readFileSync(generated);
    assert.ok(before.equals(middle), "generated CSS differs from what the generator produces (run npm run tokens)");
    assert.ok(middle.equals(after));
  });
});

const styleFix = (props) => `export const A = () => <div style={{ ${props} }} />;\n`;
const hasRule = async (code, file, rule) => (await designRulesOf(code, file)).includes(rule);
const PHYS = "nestly/no-physical-direction";

describe("UI-wave-1 criterion 1 (widened): physical direction in styles, CSS and more classes", () => {
  const styles = [
    "marginLeft: 4", "paddingRight: 8", "left: 0", "textAlign: 'left'", "float: 'right'", "clear: 'left'",
  ];
  for (const prop of styles) {
    it(`[UI-1] rejects inline style { ${prop} }`, async () => {
      assert.ok(await hasRule(styleFix(prop), WEB, PHYS));
    });
  }
  const cssDecls = ["margin-left: 4px", "padding-right: 8px", "left: 0", "text-align: left", "float: right"];
  for (const decl of cssDecls) {
    for (const base of ["apps/web/src/x.css", "packages/shared/src/x.css"]) {
      it(`[UI-1] rejects CSS ${decl} in ${base}`, async () => {
        assert.ok(await hasRule(`.a { ${decl}; }\n`, base, PHYS));
      });
    }
  }
  for (const prop of ["marginInlineStart: 4", "paddingInlineEnd: 8", "insetInlineStart: 0", "textAlign: 'start'"]) {
    it(`[UI-1] passes logical inline style { ${prop} }`, async () => {
      assert.deepEqual(await designRulesOf(styleFix(prop), WEB), []);
    });
  }
  for (const decl of ["margin-inline-start: 4px", "text-align: start", "padding-inline-end: 8px", "inset-inline-start: 0"]) {
    it(`[UI-1] passes CSS ${decl}`, async () => {
      assert.deepEqual(await designRulesOf(`.a { ${decl}; }\n`, "apps/web/src/x.css"), []);
    });
  }
  it("[UI-1] passes space-x-2", async () => {
    assert.deepEqual(await designRulesOf(jsx("space-x-2"), WEB), []);
  });
  for (const cls of ["float-left", "translate-x-2", "object-left"]) {
    it(`[UI-1] rejects class ${cls}`, async () => {
      assert.ok(await hasRule(jsx(cls), WEB, PHYS));
    });
  }
});

describe("UI-wave-1 criterion 1 (widened): colour functions are rejected outside the token source", () => {
  const fns = ["rgb(181 80 44)", "rgb(181, 80, 44)", "oklch(0.5 0.1 40)"];
  for (const fn of fns) {
    it(`[UI-1] rejects ${fn} in .tsx`, async () => {
      const code = `export const A = () => <i style={{ color: '${fn}' }} />;\n`;
      assert.ok(await hasRule(code, "apps/web/src/components/shared/C.tsx", "nestly/no-hex"));
    });
    it(`[UI-1] rejects ${fn} in .css`, async () => {
      assert.ok(await hasRule(`.a { color: ${fn}; }\n`, "apps/web/src/x.css", "nestly/no-hex"));
    });
    it(`[UI-1] allows ${fn} inside packages/shared/src/design-tokens/`, async () => {
      assert.deepEqual(await designRulesOf(`export const c = '${fn}';\n`, "packages/shared/src/design-tokens/x.ts"), []);
    });
  }
});

describe("UI-wave-1 criterion 1 (widened): [&…] selector variants only inside components/ui", () => {
  const code = jsx("[&_svg]:size-4");
  it("[UI-1] rejects [&_svg]:size-4 outside components/ui", async () => {
    assert.ok((await designRulesOf(code, WEB)).length > 0);
  });
  it("[UI-1] passes [&_svg]:size-4 inside apps/web/src/components/ui", async () => {
    assert.deepEqual(await designRulesOf(code, "apps/web/src/components/ui/B.tsx"), []);
  });
});

describe("UI-wave-1 criterion 8 (L): Tailwind default scales are reset", () => {
  const css = fs.readFileSync(path.join(root, "apps/web/src/styles/tokens.generated.css"), "utf8");
  for (const ns of ["text", "font-weight", "radius", "shadow", "ease", "breakpoint", "font"]) {
    it(`[UI-8] --${ns}-* is set to initial`, () => {
      assert.match(css, new RegExp(`--${ns}-\\*:\\s*initial\\s*;`));
    });
  }
});
