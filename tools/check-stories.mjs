// Story coverage gate (UI wave 1, criterion 13). Every component file in
// apps/web/src/components/{ui,shared,layout} has a sibling <name>.stories.tsx, and that file
// exports at least as many stories as the component has states in the spec.
// A new component is added to STATES in the same change that creates it; a file that is in
// neither STATES nor NO_VISUAL fails, so nothing slips in unlisted.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const componentsDir = path.join(root, "apps/web/src/components");
const LAYERS = ["ui", "shared", "layout"];

// <layer>/<file name without .tsx>: minimum number of stories (the states of .work/ui-wave-1/spec.md).
export const STATES = {
  "ui/button": 9, // primary, soft, text, lg, block, icon-only, disabled, pending, as link
  "ui/icons": 1, // the gallery of all icons
  "ui/tooltip": 2, // hover, focus
  "ui/skeleton": 2, // line, card shape
};

// Files with nothing to draw: a provider or a helper.
export const NO_VISUAL = new Set(["ui/direction-provider"]);

const isStory = (name) => name.endsWith(".stories.tsx");
const isComponent = (name) =>
  /.tsx?$/.test(name) && !isStory(name) && !name.endsWith(".d.ts") && !/.(test|spec).tsx?$/.test(name);

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

export async function check() {
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
      const required = STATES[key];
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
  const problems = await check();
  if (problems.length > 0) {
    for (const problem of problems) console.error(`check-stories: ${problem}`);
    process.exit(1);
  }
  console.log("check-stories: every component has stories for all of its states");
}
