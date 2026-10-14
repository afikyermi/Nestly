# findings — preview-access, CRITIC (opus), 14.10.2026 — fresh cold review (critic-diff, 5 files)

(An earlier CRITIC was given a hand-made diff that contained notes.md and refused a verdict — incidents.md 14.10. Its
provisional findings went to BUILDER: host rule tightened to unique deployments, route handler made testable — 607d77b.)

verdict: Validated with Concern

Cost: the secret is hidden from agents only for code that behaves; 1–3 are the paths a careless or misbehaving agent
could use, two of them resting on unverified Vercel behaviour.

1 (medium) tools/preview-shot.mjs exports `readSecret()` whose default is the real local file — one `node -e` import
  prints the secret without naming the file, and a test calling it without the override would leak it into a diff.
  Fix: no exported reader with a default; export `parseSecret` and a reader that requires an explicit path; resolve
  the default only inside `main()`; check the tests use temp files only.
2 (medium, unverified Vercel behaviour) the secret is sent to whatever code is deployed at the target, and the tool
  returns a screenshot — a branch whose server reflects the header turns the PNG into a channel; the workflow has the
  same exposure on /api/health and /api/anything. Fix: check whether Vercel strips `x-vercel-protection-bypass` before
  the function (record in knowledge); if not, the server drops the header in its first hook, with a test that it is
  never reflected or logged; record the rest as accepted debt.
3 (medium, unverified Vercel behaviour) the host allowlist holds only if Vercel reserves `*-afikyermis-projects.vercel.app`
  aliases for the team. Fix: confirm and record; if not reserved, the tool accepts only a URL listed in this repo's
  Vercel deployment statuses (gh api …/deployments) or a fixed owned alias.
4 (medium) tools/preview-shot.test.mjs never runs `shoot()`/`main` — broken variants pass: extraHTTPHeaders instead of
  the route, service workers not blocked, DEBUG not cleared, unscrubbed e.message, `status >= 400` loosened, `left`
  check dropped. Fix: inject the browser launcher (or a local https server) and assert each, with mutants.
5 (low) the repository secret plus deployment_status (workflow from the deployed commit) lets any deployed branch
  bring its own workflow and print an encoded secret (masking covers the exact value only). Fix: debt.md; keep Vercel
  Git Fork Protection on; DECISION REQUEST to Afik if agents must never reach the secret through CI (Environment-scoped
  secret with a protected-branch policy).
6 (low) the job requires exactly `environment == 'Preview'` and `vercel[bot]`; a different environment string skips it
  silently. Fix: after the first push, confirm a preview-smoke run appears and record the observed environment value.

Checked, no finding: secret not in argv (printf → curl -H @-; route.fetch in Node); one step's env, Chromium never
inherits it; no -L, --proto =https, maxRedirects 0; exact-origin comparison, continue() without arguments elsewhere;
DEBUG/PWDEBUG cleared before Playwright loads; errors scrubbed to the first line; no trace/HAR; stdout only status and
path; bypass query parameter refused; userinfo, port, http, trailing dot, punycode look-alikes, newline refused;
vercel[bot] only, URL through env; set -euo pipefail, status and body checked; workflow tests carry strong mutants;
tests read no app source, no notes.md, never the real secret file.

**Next session:** BUILDER fixes 1 (and 4's seam), TEST ENGINEER covers 4; 2, 3 need a Vercel check (header stripping,
alias reservation) — Afik or documentation; 5 → debt + DECISION REQUEST; 6 after the first push. Then one push, PR,
CI, merge; then the F1.2 branch-Preview tooling is usable.
