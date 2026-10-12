// Type-level tests for UI wave 1 part b, criterion 19: an icon-only control requires an
// accessible name, enforced by the compiler. Repo rules ban ts-comments, so the negative
// fixtures are real compiles that must fail: each fixture is written to a scratch folder
// inside the repo (so module resolution finds node_modules), compiled with the web app's own
// tsconfig, and the diagnostics are read.
// Run: node --test tools/ui-types.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webTsconfig = path.join(root, "apps/web/tsconfig.json");
const tsc = path.join(root, "node_modules/typescript/bin/tsc");
const scratchParent = path.join(root, "node_modules", ".cache");
fs.mkdirSync(scratchParent, { recursive: true });
const scratch = fs.mkdtempSync(path.join(scratchParent, "nestly-ui-types-"));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

let counter = 0;
const compile = (source) => {
  const dir = path.join(scratch, String(counter++));
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "fixture.tsx"), source);
  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify({
      extends: webTsconfig,
      compilerOptions: { noEmit: true, incremental: false, tsBuildInfoFile: null },
      include: [path.join(dir, "fixture.tsx")],
    }),
  );
  const result = spawnSync(process.execPath, [tsc, "-p", path.join(dir, "tsconfig.json"), "--pretty", "false"], {
    cwd: root,
    encoding: "utf8",
  });
  return { ok: result.status === 0, output: `${result.stdout}${result.stderr}` };
};

const header = `import { Button } from "@/components/ui/button";\nimport { MenuIcon } from "@/components/ui/icons";\n`;

describe("criterion 19: icon-only controls require an accessible name (type level)", () => {
  it("[19] control: an icon-only Button WITH a label compiles (the harness is sound)", () => {
    const { ok, output } = compile(
      `${header}export const A = () => <Button iconOnly label="פתיחת התפריט"><MenuIcon /></Button>;\n` +
        `export const B = () => <Button>המשך</Button>;\n`,
    );
    assert.equal(ok, true, output);
  });

  it("[19] an icon-only Button without a label fails tsc", () => {
    const { ok, output } = compile(`${header}export const A = () => <Button iconOnly><MenuIcon /></Button>;\n`);
    assert.equal(ok, false, "omitting the accessible name must not compile");
    assert.match(output, /label/);
  });

  it("[19] an icon-only Button with label undefined fails tsc", () => {
    const { ok } = compile(
      `${header}export const A = (p: { n?: string }) => <Button iconOnly label={p.n}><MenuIcon /></Button>;\n`,
    );
    assert.equal(ok, false, "an optional name must not satisfy the requirement");
  });

  it("[19] an icon-only Button given only aria-hidden children and no label fails tsc", () => {
    const { ok } = compile(
      `${header}export const A = () => <Button iconOnly variant="soft" size="lg"><MenuIcon aria-hidden="true" /></Button>;\n`,
    );
    assert.equal(ok, false);
  });

  it("[19] an icon-only Button with a variant fails tsc (icon-only has one look)", () => {
    const { ok, output } = compile(
      `${header}export const A = () => <Button iconOnly label="x" variant="soft"><MenuIcon /></Button>;
`,
    );
    assert.equal(ok, false, output);
  });
});

const fields = `import { TextInput } from "@/components/ui/text-input";
import { PasswordInput } from "@/components/shared/password-input";
import { SelectInput } from "@/components/ui/select-input";
`;

describe("part c addendum: the form controls accept exactly their documented props (type level)", () => {
  it("control: the documented props compile (the harness is sound)", () => {
    const { ok, output } = compile(
      `${fields}export const A = () => <TextInput aria-label="x" type="email" dir="ltr" error aria-invalid aria-describedby="d" />;\n` +
        `export const B = () => <PasswordInput toggleLabel="הצגה" aria-label="סיסמה" />;\n` +
        `export const C = () => <SelectInput options={[]} placeholder="בחירה" aria-label="מין" />;\n`,
    );
    assert.equal(ok, true, output);
  });

  for (const [name, element] of [
    ["TextInput", `<TextInput aria-label="x" className="w-1/2" />`],
    ["PasswordInput", `<PasswordInput toggleLabel="הצגה" aria-label="סיסמה" className="w-1/2" />`],
    ["SelectInput", `<SelectInput options={[]} placeholder="בחירה" aria-label="מין" className="w-1/2" />`],
  ]) {
    it(`[exact props] className on ${name} fails tsc`, () => {
      const { ok, output } = compile(`${fields}export const A = () => ${element};\n`);
      assert.equal(ok, false, "className must not compile");
      assert.match(output, /className/);
    });
  }

  it("[exact props] placeholder on TextInput fails tsc", () => {
    const { ok, output } = compile(`${fields}export const A = () => <TextInput aria-label="x" placeholder="שם" />;\n`);
    assert.equal(ok, false, "a placeholder on TextInput must not compile");
    assert.match(output, /placeholder/);
  });

  it("[exact props] another native input prop (maxLength) on TextInput fails tsc", () => {
    const { ok } = compile(`${fields}export const A = () => <TextInput aria-label="x" maxLength={5} />;\n`);
    assert.equal(ok, false);
  });
});

const partE = `import { MenuItem } from "@/components/shared/menu-item";
import { Logo } from "@/components/shared/logo";
import { WelcomeIllustration } from "@/components/shared/illustrations";
`;

describe("part e (criteria 34, 37): MenuItem is a link or a button, never both (type level)", () => {
  it("[37] control: href alone, onClick alone, disabled, Logo and an illustration compile (the harness is sound)", () => {
    const { ok, output } = compile(
      `${partE}export const A = () => <MenuItem href="/x">א</MenuItem>;\n` +
        `export const B = () => <MenuItem onClick={() => undefined}>ב</MenuItem>;\n` +
        `export const C = () => <MenuItem href="/x" disabled>ג</MenuItem>;\n` +
        `export const D = () => <Logo href="/" size="big" />;\n` +
        `export const E = () => <WelcomeIllustration className="x" />;\n`,
    );
    assert.equal(ok, true, output);
  });

  it("[37] href together with onClick fails tsc (mutually exclusive, API Part e)", () => {
    const { ok, output } = compile(
      `${partE}export const A = () => <MenuItem href="/x" onClick={() => undefined}>א</MenuItem>;\n`,
    );
    assert.equal(ok, false, "a MenuItem with both a link target and an action must not compile");
    assert.match(output, /href|onClick/);
  });

  it("[37] href together with onClick fails tsc also when the action is disabled", () => {
    const { ok } = compile(
      `${partE}export const A = () => <MenuItem href="/x" onClick={() => undefined} disabled>א</MenuItem>;\n`,
    );
    assert.equal(ok, false);
  });

  it("[37] a MenuItem without children fails tsc (the label is required)", () => {
    const { ok } = compile(`${partE}export const A = () => <MenuItem href="/x" />;\n`);
    assert.equal(ok, false);
  });

  it("[34] Logo has a fixed name (API: no prop): an aria-label prop fails tsc", () => {
    assert.equal(compile(`${partE}export const A = () => <Logo aria-label="x" />;
`).ok, false);
  });

  it("[34] Logo size accepts only default and big: an unknown size fails tsc", () => {
    assert.equal(compile(`${partE}export const A = () => <Logo size="huge" />;
`).ok, false);
  });

  it("[34] an illustration takes className only: an aria-label fails tsc", () => {
    const { ok } = compile(`${partE}export const A = () => <WelcomeIllustration aria-label="x" />;\n`);
    assert.equal(ok, false);
  });
});

describe("part e addenda: MenuItem takes exactly one of href or onClick (type level)", () => {
  it("[37] neither href nor onClick fails tsc", () => {
    const { ok, output } = compile(`${partE}export const A = () => <MenuItem>א</MenuItem>;\n`);
    assert.equal(ok, false, "a MenuItem with no link target and no action must not compile");
    assert.match(output, /href|onClick/);
  });

  it("[37] neither fails also with disabled and an icon", () => {
    const { ok } = compile(`${partE}export const A = () => <MenuItem disabled icon={<svg />}>א</MenuItem>;\n`);
    assert.equal(ok, false);
  });

  it("[36] control: Avatar accepts size sm and md, and rejects another size", () => {
    const avatar = `import { Avatar } from "@/components/ui/avatar";\n`;
    assert.equal(compile(`${avatar}export const A = () => <><Avatar size="sm" /><Avatar size="md" name="x" decorative /></>;\n`).ok, true);
    assert.equal(compile(`${avatar}export const A = () => <Avatar size="lg" />;\n`).ok, false);
  });
});

const partF = `import { TopBar } from "@/components/shared/top-bar";
import { BottomNavigation } from "@/components/shared/bottom-navigation";
import { SideDrawer } from "@/components/shared/side-drawer";
import { AppShell } from "@/components/layout/app-shell";
`;
const shellParts = {
  navItems: `navItems={[{ key: "a", label: "א", href: "/a", icon: <svg /> }]}`,
  navLabel: 'navLabel="n"',
  menuLabel: 'menuLabel="m"',
  drawerTitle: 'drawerTitle="t"',
  drawerCloseLabel: 'drawerCloseLabel="c"',
  skipLinkLabel: 'skipLinkLabel="s"',
  menu: "menu={null}",
};
const shellProps = Object.values(shellParts).join(" ");

describe("part f (criteria 19, 38-41): required copy props are required (type level)", () => {
  it("[38][39][40][41] control: every component compiles with its documented props (the harness is sound)", () => {
    const { ok, output } = compile(
      `${partF}export const A = () => <>
        <TopBar onMenuClick={() => undefined} menuLabel="m" />
        <TopBar onMenuClick={() => undefined} menuLabel="m" actions={<a href="/x">x</a>} className="ms-2" />
        <BottomNavigation items={[{ key: "a", label: "א", href: "/a", icon: <svg />, current: true }]} label="n" />
        <SideDrawer open={false} onOpenChange={(open: boolean) => void open} title="t" closeLabel="c">x</SideDrawer>
        <AppShell ${shellProps}>x</AppShell>
      </>;\n`,
    );
    assert.equal(ok, true, output);
  });

  it("[38][19] a TopBar without menuLabel fails tsc (the Hamburger is icon-only and needs its name)", () => {
    const { ok, output } = compile(`${partF}export const A = () => <TopBar onMenuClick={() => undefined} />;\n`);
    assert.equal(ok, false);
    assert.match(output, /menuLabel/);
  });

  it("[38][19] a TopBar with menuLabel undefined fails tsc (an optional name does not satisfy it)", () => {
    const { ok } = compile(
      `${partF}export const A = (p: { n?: string }) => <TopBar onMenuClick={() => undefined} menuLabel={p.n} />;\n`,
    );
    assert.equal(ok, false);
  });

  it("[38] a TopBar without onMenuClick fails tsc", () => {
    const { ok, output } = compile(`${partF}export const A = () => <TopBar menuLabel="m" />;\n`);
    assert.equal(ok, false);
    assert.match(output, /onMenuClick/);
  });

  it("[39] a BottomNavigation without label fails tsc (the nav must be named)", () => {
    const { ok, output } = compile(`${partF}export const A = () => <BottomNavigation items={[]} />;\n`);
    assert.equal(ok, false);
    assert.match(output, /label/);
  });

  it("[39] a BottomNavigation item without a label, an href or a key fails tsc", () => {
    for (const bad of [`{ key: "a", href: "/a", icon: <svg /> }`, `{ key: "a", label: "x", icon: <svg /> }`, `{ label: "x", href: "/a", icon: <svg /> }`]) {
      const { ok } = compile(`${partF}export const A = () => <BottomNavigation label="n" items={[${bad}]} />;\n`);
      assert.equal(ok, false, bad);
    }
  });

  it("[39] a BottomNavigation item with a non-boolean current fails tsc", () => {
    const { ok } = compile(
      `${partF}export const A = () => <BottomNavigation label="n" items={[{ key: "a", label: "x", href: "/a", icon: <svg />, current: "page" }]} />;\n`,
    );
    assert.equal(ok, false);
  });

  it("[40][19] a SideDrawer without closeLabel or title fails tsc (the close control is icon-only; the dialog needs a name)", () => {
    const a = compile(`${partF}export const A = () => <SideDrawer open onOpenChange={() => undefined} title="t">x</SideDrawer>;\n`);
    assert.equal(a.ok, false);
    assert.match(a.output, /closeLabel/);
    const b = compile(`${partF}export const A = () => <SideDrawer open onOpenChange={() => undefined} closeLabel="c">x</SideDrawer>;\n`);
    assert.equal(b.ok, false);
    assert.match(b.output, /title/);
  });

  it("[40] a SideDrawer is controlled: without open or onOpenChange it fails tsc", () => {
    assert.equal(compile(`${partF}export const A = () => <SideDrawer onOpenChange={() => undefined} title="t" closeLabel="c">x</SideDrawer>;\n`).ok, false);
    assert.equal(compile(`${partF}export const A = () => <SideDrawer open title="t" closeLabel="c">x</SideDrawer>;\n`).ok, false);
  });

  it("[41] an AppShell missing any one of its copy props or menu fails tsc", () => {
    for (const prop of Object.keys(shellParts)) {
      const without = Object.entries(shellParts).filter(([k]) => k !== prop).map(([, v]) => v).join(" ");
      const { ok, output } = compile(`${partF}export const A = () => <AppShell ${without}>x</AppShell>;\n`);
      assert.equal(ok, false, `${prop} must be required`);
      assert.match(output, new RegExp(prop));
    }
  });

  it("[41] className (placement, part-e review addendum) is accepted by TopBar, BottomNavigation and AppShell", () => {
    for (const tag of ["TopBar onMenuClick={() => undefined} menuLabel=\"m\"", "BottomNavigation items={[]} label=\"n\""]) {
      const { ok, output } = compile(`${partF}export const A = () => <${tag} className="ms-2" />;
`);
      assert.equal(ok, true, output);
    }
    const { ok, output } = compile(`${partF}export const A = () => <AppShell ${shellProps} className="ms-2">x</AppShell>;
`);
    assert.equal(ok, true, "every component accepts className?: string (API); AppShell does not: " + output);
  });

  it("[41] an AppShell without children fails tsc", () => {
    assert.equal(compile(`${partF}export const A = () => <AppShell ${shellProps} />;\n`).ok, false);
  });
});
