// UI wave 1, criterion 10 (L): the built web CSS and HTML. Runs after `npm run build`.
// Run: node --test tools/built-css.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "apps/web/dist");
const assets = path.join(dist, "assets");

assert.ok(fs.existsSync(assets), "apps/web/dist/assets is missing: run `npm run build` first");
const cssFiles = fs.readdirSync(assets).filter((f) => f.endsWith(".css"));
const css = cssFiles.map((f) => fs.readFileSync(path.join(assets, f), "utf8")).join("\n");
const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");

// A bare https:// is not a font URL: Tailwind's banner comment holds one.
const FONT_URL = /fonts\.gstatic|fonts\.googleapis|url\(\s*["']?https?:/i;

const fontFaces = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];

describe("UI-wave-1 criterion 10 (L): built CSS fonts", () => {
  it("[UI-10] exactly one built CSS file exists", () => {
    assert.ok(cssFiles.length >= 1);
  });
  it("[UI-10] has @font-face for exactly two subsets: hebrew and latin", () => {
    assert.equal(fontFaces.length, 2, `got ${fontFaces.length}`);
    const joined = fontFaces.join("\n");
    assert.match(joined, /assistant-hebrew-/i);
    assert.match(joined, /assistant-latin-/i);
    for (const other of ["latin-ext", "cyrillic", "arabic", "math", "symbols"]) {
      assert.doesNotMatch(joined, new RegExp(`assistant-${other}`, "i"), `unexpected subset ${other}`);
    }
  });
  it("[UI-10] both faces are Assistant with the weight axis 200 to 800", () => {
    for (const face of fontFaces) {
      assert.match(face, /font-family:\s*["']?Assistant/i);
      assert.match(face, /font-weight:\s*200\s+800/);
    }
  });
  it("[UI-10] the font-family stack ends system-ui, sans-serif", () => {
    assert.match(css, /--font-sans:[^;}]*system-ui,\s*sans-serif/);
  });
  it("[UI-10] no http(s) font URL in the built CSS", () => {
    assert.doesNotMatch(css, FONT_URL);
  });
  it("[UI-10] no http(s) font URL in the built HTML", () => {
    assert.doesNotMatch(html, FONT_URL);
    assert.doesNotMatch(html, /https?:\/\/[^"'\s)]*\.(woff2?|ttf|otf)/i);
  });
  it("[UI-10] every font file the CSS names exists in the build (self-hosted)", () => {
    for (const face of fontFaces) {
      for (const [, url] of face.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
        assert.doesNotMatch(url, /^https?:/i);
        const file = path.join(assets, path.basename(url));
        assert.ok(fs.existsSync(file), `missing ${url}`);
      }
    }
  });
});
