verdict: Validated

Criteria 1-12 checked against code and tests. All met. Criterion 12 checked by hand: every alwaysRead file is under budget (CLAUDE.md 331/380, workflow 288/330, data-model 228/260, and so on), no tracked code file other than guard.js (835, excepted at 900) is over 400, and the largest test file (guard-readers.test.js, 754) is under 800. CI: the step sits in the `lint` job, which runs on every pull_request and push to main. `npm run ci` and `test:tools` are both wired. Counting, glob (`apps/*/src/**` becomes `^apps/[^/]*/src/.*$`), `git ls-files -z` (cwd=root, NUL-split, "/" separators, Windows-safe through path.join), and fail-closed on missing, invalid or incomplete config are correct. The tests spawn the CLI against throwaway git repos. They do not read app source or notes.md by fs or import. The one repo-wide run is criterion 12 itself.

--- finding ---
severity: low
file:     tools/check-budgets.mjs:74
claim:    Config values are not type-checked beyond code.max, so a non-numeric budget silently disables its check.
failure:  "alwaysRead": {"CLAUDE.md": "abc"}, "testMax": "x" or an exception "max": "n/a" make `lines > budget` evaluate to false (NaN comparison). The check passes with exit 0 and the file is never limited. This is fail-open on bad config, though only by a maintainer typo.
fix:      In validateConfig, require Number.isInteger for every alwaysRead value, for testMax if present, and for each exception max. Require exclude to be an array of strings. Add a test.
--- end ---

--- finding ---
severity: low
file:     tools/check-budgets.mjs:122
claim:    parseArgs ignores unknown flags and a flag with no value, so the defaults are used silently.
failure:  `node tools/check-budgets.mjs --confg other.json` or a trailing `--config` runs against the default config and reports ok. A caller who believes they checked a different config gets a false pass. Pairs are also read two at a time, so one stray token shifts every later flag.
fix:      Fail with exit 1 on an unknown flag or a missing value.
--- end ---

--- finding ---
severity: low
file:     tools/check-budgets.mjs:98
claim:    The exception handling has two edge gaps. (a) An exception for a tracked file that was deleted in the working tree crashes with an uncaught ENOENT stack instead of a "stale exception" line. (b) An exception for an excluded path, or for a file with a non-code extension, is never enforced and is never reported stale.
failure:  (a) Locally, after `rm tools/x.js` without staging, the output is a raw stack trace (exit is still 1). (b) A leftover exception for `apps/web/src/foo.ts` or `x.md` lives in the config indefinitely, which defeats the stale detection the spec wants.
fix:      Check existsSync before lineCount in the stale loop and report it as stale. Report an exception as stale when its file is excluded or has a non-checked extension.
--- end ---

--- finding ---
severity: low
file:     package.json:30
claim:    The unrelated line `"check:stories":"node tools/check-stories.mjs"` lost its space after the colon.
failure:  No runtime effect. Diff noise on a line outside the spec, and inconsistent formatting.
fix:      Restore `"check:stories": "node ..."`.
--- end ---
