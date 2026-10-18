# CRITIC findings — F3.1b (opus, one round, 19.10.2026) — summary of returned text, saved by ORCHESTRATOR
0 critical/high/medium; 6 low.
1. PostScreen.tsx:806 / FeedPage.tsx:1247 — status texts in history state reappear on Back/reload (c17 "only right after publishing") → clear after reading (replace). BUILDER.
2. PostForm.tsx:704 — counter status region mounted with text at ≤100, first warning silent (WCAG 4.1.3) → always render the region, text only at ≤100. BUILDER.
3. ComposeScreen.tsx:252-258 (+ PostScreen.saveEdit) — after a server 422 the field doesn't re-validate while typing → set validating on refused errors. BUILDER.
4. ComposeScreen.tsx:274-287 — Professional view replaces h1/title "כתיבת פוסט" with "הפעולה אינה זמינה" (screen.md mismatch) → keep h1/title, body text. BUILDER.
5. e2e/posts.spec.ts:1817 — `/S/` filter can never fail; c17 "only right after" untested → assert no "הפוסט פורסם" on direct open and after Back/reload. TEST ENGINEER.
6. posts-composer.test.tsx:1511-1515, 1563-1567 — tests seed a storage key copied from source → produce the key through a real post, then corrupt / switch user. TEST ENGINEER.
Checked, no finding: Professional detection, audience memory, status spoofing, no anonymous control, error handling, a11y/design (ConfirmDialog, 44 px, tokens, RTL), screen texts except 4, symbols/types, double submit, the two older tests (mechanical).
ORCHESTRATOR: all six fixed now (cheap); no re-check needed for lows.
