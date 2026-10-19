// I3 F3.6 criterion 7 (B+I) [AC-083, BR-067, NFR-PRIV-007]: the static HTML a link-preview crawler gets for /posts/<uuid> and for /.
// Derived from .work/share-link/spec.md (c7, Critical external assumptions E1-E3) and screen.md ("Preview texts") only. Runs after `npm run build`,
// on apps/web/dist and vercel.json: the rewrite list is applied as Vercel applies it (first match wins, /api/* before the page rewrite), and the
// file it names is read from dist. No cookie, no JavaScript, no User-Agent can change a static file, so byte equality across ids is the promise.
// Run: node --test tools/share-preview.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "apps/web/dist");
assert.ok(fs.existsSync(path.join(dist, "index.html")), "apps/web/dist/index.html is missing: run `npm run build` first");
const config = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const rewrites = Array.isArray(config.rewrites) ? config.rewrites : [];

// vercel.json `source` is path-to-regexp: `:name*` many segments, `:name` one segment, `(...)` a raw group.
const matcher = (source) => new RegExp(`^${source.replace(/:\w+\*/g, ".*").replace(/:\w+/g, "[^/]+")}$`);

/** What Vercel serves for `urlPath`: a static file of dist, else the first matching rewrite's destination. */
function resolve(urlPath) {
  const direct = path.join(dist, urlPath);
  if (urlPath !== "/" && fs.existsSync(direct) && fs.statSync(direct).isFile()) return { kind: "file", file: direct };
  for (const { source, destination } of rewrites) {
    if (!matcher(source).test(urlPath)) continue;
    if (destination.startsWith("/api/")) return { kind: "function", destination };
    const file = path.join(dist, destination);
    const withHtml = fs.existsSync(file) ? file : `${file}.html`;
    return { kind: "file", file: withHtml };
  }
  if (urlPath === "/") return { kind: "file", file: path.join(dist, "index.html") };
  return { kind: "none" };
}
const served = (urlPath) => {
  const r = resolve(urlPath);
  assert.equal(r.kind, "file", `${urlPath} is not served from a static file: ${JSON.stringify(r)}`);
  assert.ok(fs.existsSync(r.file), `${urlPath} -> ${r.file} does not exist in dist`);
  return fs.readFileSync(r.file);
};

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
/** The content of the first <meta> whose name or property is `key`, in either attribute order; null when absent. */
function meta(html, key) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = /\b(?:property|name)\s*=\s*"([^"]*)"/i.exec(tag)?.[1];
    if (name !== key) continue;
    const content = /\bcontent\s*=\s*"([^"]*)"/i.exec(tag)?.[1];
    return content === undefined ? "" : decode(content);
  }
  return null;
}
const metaKeys = (html) => (html.match(/<meta\b[^>]*>/gi) ?? []).map((t) => /\b(?:property|name)\s*=\s*"([^"]*)"/i.exec(t)?.[1]).filter(Boolean);

const UUIDS = [
  "e0000000-0000-4000-8000-000000000001", // an everyone post
  "e0000000-0000-4000-8000-000000000002", // a friends post
  "e0000000-0000-4000-8000-000000000003", // an anonymous post
  "99999999-9999-4999-8999-999999999999", // an unknown id
];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe("[F3.6 c7] /posts/<uuid> serves one fixed preview", () => {
  const bytes = UUIDS.map((id) => served(`/posts/${id}`));
  const html = bytes[0].toString("utf8");

  it("[F3.6 c7] the HTML is byte-identical for an everyone post, a friends post, an anonymous post and an unknown uuid", () => {
    for (const other of bytes.slice(1)) assert.ok(other.equals(bytes[0]));
  });

  it('[F3.6 c7] og:title is "פוסט ב-Nestly", og:type is website, robots is noindex', () => {
    assert.equal(meta(html, "og:title"), "פוסט ב-Nestly");
    assert.equal(meta(html, "og:type"), "website");
    assert.match(meta(html, "robots") ?? "", /noindex/i);
  });

  it('[F3.6 c7] og:description is the fixed text "כדי לקרוא את הפוסט צריך להתחבר ל-Nestly"', () => {
    assert.equal(meta(html, "og:description"), "כדי לקרוא את הפוסט צריך להתחבר ל-Nestly");
  });

  it("[F3.6 c7] nothing is seeded: no id, no body/name/tag/date field, no JSON-LD, no <time>, no og:url or published time", () => {
    assert.doesNotMatch(html, UUID);
    assert.doesNotMatch(html, /application\/ld\+json/i);
    assert.doesNotMatch(html, /<time\b/i);
    assert.doesNotMatch(html, /"(?:body|author|authorName|stageTag|createdAt|sharerText)"\s*:/);
    const keys = metaKeys(html);
    for (const forbidden of ["og:url", "article:published_time", "article:author", "og:image"]) assert.ok(!keys.includes(forbidden), `${forbidden} must not be set`);
  });

  it("[F3.6 c7] the page still starts the app for a person (the root element and the module script)", () => {
    assert.match(html, /<div id="root"><\/div>/);
    assert.match(html, /<script\b[^>]*type="module"[^>]*src="[^"]+"/);
  });

  it("[F3.6 c7] any id under /posts/ gets the same preview (\"/posts/*\")", () => {
    assert.ok(served("/posts/not-a-uuid").equals(bytes[0]));
  });
});

describe("[F3.6 c7] / serves the site preview", () => {
  const html = served("/").toString("utf8");
  it('[F3.6 c7] og:title is "Nestly" and og:description is "קהילה להורים ולהורים לעתיד"', () => {
    assert.equal(meta(html, "og:title"), "Nestly");
    assert.equal(meta(html, "og:description"), "קהילה להורים ולהורים לעתיד");
    assert.equal(meta(html, "og:type"), "website");
  });
  it("[F3.6 c7] the site preview differs from the post preview, and holds no post text", () => {
    assert.notEqual(meta(html, "og:title"), meta(served(`/posts/${UUIDS[0]}`).toString("utf8"), "og:title"));
    assert.doesNotMatch(html, UUID);
  });
});

describe("[F3.6 c7][E2] routing keeps the rest of the app and the API intact", () => {
  it("[F3.6 c7] /api/* still goes to the function, whichever page rewrite comes after (including /api/posts/<uuid>)", () => {
    for (const p of ["/api/feed", `/api/posts/${UUIDS[0]}`, `/api/posts/${UUIDS[0]}/shares`, "/api/me"]) {
      assert.deepEqual(resolve(p), { kind: "function", destination: "/api/index" }, p);
    }
  });
  it("[F3.6 c7] the other app paths still get the app's page (the SPA fallback)", () => {
    for (const p of ["/feed", "/login", `/u/${UUIDS[0]}`, "/settings"]) {
      const html = served(p).toString("utf8");
      assert.match(html, /<div id="root"><\/div>/, p);
    }
  });
});
