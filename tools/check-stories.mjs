// Story coverage gate (UI wave 1, criterion 13). Every component file in
// apps/web/src/components/{ui,shared,layout} has a sibling <name>.stories.tsx, and that file
// exports at least as many stories as the component has states in the spec.
// A new component is added to STATES in the same change that creates it; a file that is in
// neither STATES nor NO_VISUAL fails, so nothing slips in unlisted.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoComponentsDir = path.join(root, "apps/web/src/components");
const LAYERS = ["ui", "shared", "layout"];

// <layer>/<file name without .tsx>: minimum number of stories (the states of .work/ui-wave-1/spec.md).
export const STATES = {
  "ui/button": 9, // primary, soft, text, lg, block, icon-only, disabled, pending, as link
  "ui/icons": 1, // the gallery of all icons
  "ui/tooltip": 2, // hover, focus
  "ui/skeleton": 2, // line, card shape
  "ui/text-input": 5, // empty, filled, error, disabled, email (ltr)
  "shared/form-field": 4, // basic, hint, error, optional
  "shared/password-input": 5, // empty, filled, rules, error, disabled
  "ui/select-input": 4, // placeholder, selected, error, disabled
  "shared/date-input": 4, // empty, filled, error, disabled
  "shared/choice-card-group": 4, // unselected, selected, interactive (focus), error
  "shared/step-indicator": 2, // 1 of 2, 2 of 2
  "ui/checkbox": 4, // unchecked, checked, error, required
  "shared/inline-alert": 1, // error
  "shared/google-button": 3, // default, busy, failed
  "shared/field-message": 2, // hint, error
  "shared/logo": 4, // link default, link big, static default, static big
  "shared/illustrations": 2, // welcome, registration
  "layout/auth-layout": 3, // welcome, login, registration step
  "ui/avatar": 5, // initials, single word, no name, beside a name (decorative), small
  "shared/menu-item": 4, // link, button, disabled, without icon
  "shared/top-bar": 2, // default, with actions
  "shared/bottom-navigation": 2, // three items, five items
  "shared/side-drawer": 2, // closed, open
  "shared/confirm-dialog": 4, // open, title only, pending, failed
  "layout/app-shell": 2, // with content, short content
};

// Files with nothing to draw on their own: a provider, or a part drawn only inside its parent's stories
// (the logo wordmark, the single replacement point of OP-022; the dialog layer, drawn inside SideDrawer's stories).
export const NO_VISUAL = new Set(["ui/direction-provider", "shared/logo-wordmark", "ui/dialog"]);

const isStory = (name) => name.endsWith(".stories.tsx");
const isComponent = (name) =>
  /\.tsx?$/.test(name) && !isStory(name) && !name.endsWith(".d.ts") && !/\.(test|spec)\.tsx?$/.test(name);

// Every file of a layer, nested folders included, as a path relative to the layer.
async function walk(dir, prefix = "") {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const rel = prefix + entry.name;
    if (entry.isDirectory()) files.push(...(await walk(path.join(dir, entry.name), rel + "/")));
    else if (entry.isFile()) files.push(rel);
  }
  return files;
}

export async function exportedStories(file) {
  const source = await readFile(file, "utf8");
  // Only story exports count: `export const Name: Story` (or StoryObj), not the meta or a helper.
  return [...source.matchAll(/^export const (\w+)\s*:\s*(?:Story|StoryObj)\b/gm)].map((m) => m[1]);
}

// componentsDir holds the layer folders (ui, shared, layout); states maps "<layer>/<file>" to its minimum story count.
export async function check(componentsDir, states) {
  const problems = [];
  for (const layer of LAYERS) {
    for (const file of await walk(path.join(componentsDir, layer))) {
      if (!isComponent(file)) continue;
      const key = `${layer}/${file.replace(/\.tsx?$/, "")}`;
      if (NO_VISUAL.has(key)) continue;
      const storyFile = path.join(componentsDir, `${key}.stories.tsx`);
      const stories = await exportedStories(storyFile).catch(() => null);
      if (stories === null) {
        problems.push(`${file} in ${layer} has no sibling ${path.basename(storyFile)}`);
        continue;
      }
      const required = states[key];
      if (required === undefined) {
        problems.push(`${key} is not in STATES (tools/check-stories.mjs): add its state count`);
      } else if (stories.length < required) {
        problems.push(`${key}.stories.tsx exports ${stories.length} stories, the spec lists ${required} states`);
      }
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = await check(repoComponentsDir, STATES);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`check-stories: ${problem}`);
    process.exit(1);
  }
  console.log("check-stories: every component has stories for all of its states");
}
