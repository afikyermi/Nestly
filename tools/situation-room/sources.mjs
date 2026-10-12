// Situation room — the readers: the per-day log files, incidents.md and local git. Read only.
// Nothing here takes a path from a request.
import { execFile } from "node:child_process";
import { readFile, readdir, stat, open } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { GIT_LOG_FORMAT, parseGitLog, parseLogLine, createStepper } from "./derive.mjs";

const run = promisify(execFile);
const DAY_FILE = /^events-\d{4}-\d{2}-\d{2}\.jsonl$/;

// Follows every `events-YYYY-MM-DD.jsonl` in `logDir`: each file has its own byte offset, a new
// day's file is picked up as it appears, so a day rollover loses no line. Every line goes through the
// allowlist and the stepper before anyone sees it. `poll()` returns the events found since the last
// call, in file then line order; the first call returns the whole retained history. `errors` holds what
// went wrong in the last poll (a file that could not be read), empty when all is well. A file that
// shrinks is read again from its start; lines at or before its last seen time are not returned twice.
export function createTail(logDir) {
  const files = new Map(); // name -> { offset, partial: Buffer }
  const stepper = createStepper();
  const tail = {
    errors: [],
    async poll() {
      tail.errors = [];
      let names;
      try {
        names = (await readdir(logDir)).filter(n => DAY_FILE.test(n)).sort();
      } catch (err) {
        if (err?.code !== "ENOENT") tail.errors.push(`${logDir}: ${err?.message}`);
        return []; // no .live yet
      }
      const fresh = [];
      for (const name of names) {
        try {
          const file = path.join(logDir, name);
          const size = (await stat(file)).size;
          let f = files.get(name);
          if (!f) { f = { offset: 0, partial: Buffer.alloc(0), maxT: -Infinity, replay: false }; files.set(name, f); }
          if (size < f.offset) { f.offset = 0; f.partial = Buffer.alloc(0); f.replay = true; } // truncated: start over
          if (size === f.offset) continue;
          const fh = await open(file, "r");
          let chunk;
          try {
            chunk = Buffer.alloc(size - f.offset);
            const { bytesRead } = await fh.read(chunk, 0, chunk.length, f.offset);
            chunk = chunk.subarray(0, bytesRead);
          } finally {
            await fh.close();
          }
          f.offset += chunk.length;
          const data = Buffer.concat([f.partial, chunk]);
          const end = data.lastIndexOf(10);
          f.partial = end < 0 ? data : data.subarray(end + 1);
          if (end < 0) continue;
          for (const line of data.subarray(0, end).toString("utf8").split("\n")) {
            const ev = line.trim() ? parseLogLine(line) : null;
            if (!ev) continue;
            if (f.replay && ev.t <= f.maxT) continue; // seen before the truncation
            f.replay = false;
            f.maxT = Math.max(f.maxT, ev.t);
            fresh.push(stepper.annotate(ev));
          }
        } catch (err) {
          // A file just pruned is not an error; anything else is reported in `errors`.
          if (err?.code !== "ENOENT") tail.errors.push(`${name}: ${err?.message}`);
        }
      }
      return fresh;
    },
  };
  return tail;
}

// The text of incidents.md, or "" when there is none.
export async function readIncidents(root) {
  try {
    return await readFile(path.join(root, "incidents.md"), "utf8");
  } catch {
    return "";
  }
}

// First-parent commits of main from local git, newest first. `git` runs without a shell and with
// fixed arguments only. `main` when it exists, else the current HEAD. Not a repository, or git
// missing: [].
export async function readCommits(dir, limit = 300) {
  const git = args => run("git", ["-C", dir, ...args], { timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  try {
    let ref = "HEAD";
    try {
      await git(["rev-parse", "--verify", "--quiet", "refs/heads/main"]);
      ref = "main";
    } catch {
      // No local main: the checked-out history is the best there is.
    }
    const { stdout } = await git(["log", "--first-parent", `--format=${GIT_LOG_FORMAT}`, "-n", String(limit), ref, "--"]);
    return parseGitLog(stdout);
  } catch {
    return [];
  }
}
