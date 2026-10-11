---
name: security-craft
description: Security probing craft for this stack (React SPA, Fastify, Drizzle, Postgres RLS, Supabase Auth) — how to look for access to another user's data, injection, mass assignment, token and secret mistakes, and enumeration. Use when writing or reviewing server code, authentication, or anything that touches another user's data.
user-invocable: false
paths:
  - "apps/server/**"
---

# security-craft — how to attack this stack before someone else does

**Version:** 1.0 · this skill is **how** to probe. **What** must hold is defined elsewhere, and is not restated
here:
- CRITIC's required checks
- `.claude/knowledge/srs-review-points.md`
- the platform rules in `.claude/knowledge/data-model.md`

The built-in `/security-review` command stays available as an extra pass.

## Probes — run every one the diff touches

**1. Another user's object** (OWASP API1). For each endpoint that takes an ID, ask: does the query run inside
the identity transaction, so RLS filters it? A server-side `where owner = …` added "for safety" means the policy
is missing — the finding is the policy.

```ts
// what to look for — every repository call goes through the identity transaction
await withIdentity(claims, (tx) => tx.select().from(posts).where(eq(posts.id, id)));
```

**2. A function the role should not reach** (API5). A Moderator without the key. An Admin Only action. A
suspended account. The server's own check is an early exit; the test is whether the database refuses.

**3. Fields the client should not set** (API3, mass assignment).
- Request schemas are strict objects: unknown keys are rejected.
- Owner, role, status and ID columns never come from the body.
- A request body is never spread into an insert or update.

**4. Injection.**
- Drizzle's builder and the `sql` template parameterize values. `sql.raw()` with any input is a finding.
- In React: `dangerouslySetInnerHTML`, or a user-supplied URL rendered without checking its scheme
  (`javascript:`), is a finding.

**5. Tokens.**
- The JWT is verified against JWKS: signature, `exp`, `iss` and `aud`.
- The algorithm comes from the key, never from the token — no `none`, and no HS fallback.
- The `role` claim is ignored.

**6. Secrets.**
- Server-only values live in the server's environment.
- Any `VITE_` variable ships in the browser bundle.
- Nothing secret goes into `packages/shared`.

**7. Volume and enumeration** (API4, API6).
- A rate limit per account.
- No list without a query.
- Capped pagination.
- An error message that does not reveal whether something exists.

**8. Leakage.** A raw database error in a response. A token, message body, child data or Tracker data in a log.

**9. Outbound requests** (API7, SSRF). The server never fetches a user-supplied URL without an allowlist.

## Forbidden

1. A server-side permission filter in place of a policy
2. A query outside the identity transaction
3. A request body spread into a write
4. `sql.raw()` or string-built SQL with input
5. `dangerouslySetInnerHTML` without a decision and sanitization
6. Trusting a JWT claim beyond the user ID
7. A secret in a `VITE_` variable or in `packages/shared`
8. An endpoint that lists users without a query
9. A raw error message in a response
10. A token or personal data in a log

## Done when

Every probe the diff touches has a result: a finding with its failure scenario, or "checked — no finding".

## References

[OWASP API Security Top 10 (2023)](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)
· [OWASP Top 10](https://owasp.org/Top10/) · [Vite — env variables](https://vite.dev/guide/env-and-mode)
· [Drizzle — sql operator](https://orm.drizzle.team/docs/sql)

## Changelog
- 1.0 — 2026-10-11 — created (Afik's skills decision). Named security-craft so that the built-in
  /security-review stays available. Provisional until 5 features.
