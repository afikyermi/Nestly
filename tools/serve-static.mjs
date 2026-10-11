// Serves a built directory as static files on 127.0.0.1, for the Playwright run against
// the built Storybook. Usage: node tools/serve-static.mjs <dir> <port>
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const [dirArg, portArg] = process.argv.slice(2);
if (!dirArg || !/^\d+$/.test(portArg ?? "")) {
  console.error("Usage: node tools/serve-static.mjs <dir> <port>");
  process.exit(2);
}
const root = path.resolve(dirArg);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    let file = path.resolve(root, "." + decodeURIComponent(pathname));
    // Never leave the served directory.
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = path.join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

server.listen(Number(portArg), "127.0.0.1", () => {
  console.log(`Serving ${root} on http://127.0.0.1:${portArg}`);
});
