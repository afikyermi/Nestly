// The deployment-URL rule of the `preview-e2e` workflow (.work/preview-e2e/spec.md criterion 3, URL part): pure, no I/O,
// no network, no import.meta, so both the CLI (tools/preview-e2e-url-guard.ts) and e2e-preview/playwright.config.ts load it.
// Refuses anything but the unique deployment URL of the nestly project in Afik's Vercel team: https,
// nestly-<hash>-afikyermis-projects.vercel.app, no port, path, user, query or fragment (same rule as preview-smoke).
// A reason names only what was expected; it never contains the input.

export type UrlCheck = { ok: true; base: string } | { ok: false; reason: string };

// The hash has no hyphen, dot, slash, colon or @, so neither another host nor a team whose slug ends in
// -afikyermis-projects matches. Branch aliases (nestly-git-<branch>-...) are refused.
const DEPLOYMENT_URL = /^https:\/\/nestly-[a-z0-9]+-afikyermis-projects\.vercel\.app\/?$/;

export function checkDeploymentUrl(raw: string | undefined): UrlCheck {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, reason: 'the deployment URL is empty or missing' };
  }
  if (!DEPLOYMENT_URL.test(raw)) {
    return {
      ok: false,
      reason: 'the deployment URL is not https://nestly-<hash>-afikyermis-projects.vercel.app (no path, port, user or alias)',
    };
  }
  return { ok: true, base: raw.replace(/\/$/, '') };
}
