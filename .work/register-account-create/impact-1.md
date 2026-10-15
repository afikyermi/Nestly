# impact note 1 — MATERIAL CHANGE, part b (14.10.2026)

**Raised by** BUILDER, at the Gate 1 check on Q6 (spec). **Decision owner** Afik (security model, CLAUDE.md reserved 3).

**What no longer holds.** DR-1 (the server calls Supabase Auth sign-up with the publishable key) assumed Auth's per-IP
limit would brake enumeration under criterion 6 option A. It does not:
- Supabase docs, Auth → Rate Limits → "IP address forwarding": the end-user IP is honoured only via `Sb-Forwarded-For`
  with a **secret** key; publishable / anon / service_role keys are not supported. Source: `supabase/auth`
  `internal/sbff`, `internal/api/middleware.go`.
- `/auth/v1/signup` is limited per IP, 30 per 5 minutes. From our function every user shares the function's egress IP.
- Secret keys are banned (platform rule 1, static scan).

**Effect.** One global bucket of ~30 sign-ups / 5 min for the whole product, and no per-attacker brake: one client can
fill it and block every real registration (a denial-of-service lever). F1.5 login and F1.6 recovery through the server
would inherit the same problem.

**Options**
- **A — the web calls Supabase Auth directly (recommended).** Sign-up (and later login/refresh) from the browser with
  the publishable key, so Auth counts each user's own IP — the platform's intended path. `POST /api/register` then
  takes the new session (Bearer) plus step 1 and consent, and writes the account rows; no email or password reaches our
  server. Changes: DR-1 reversed; F1.2's source-scan ban on supabase-js in the web narrowed to "auth client only, no
  database access" (the Data API stays off, so the web still reaches no product data except through the server).
  Orphan Auth user (DR-2) unchanged.
- **B — keep DR-1 and add our own limiter** in the database, keyed on the request IP, before the Auth call. New table,
  a guest write path (an `anon` policy or an approved SECURITY DEFINER function), its own Gate 2. Still cannot stop many
  IPs filling Auth's one global bucket.
- **C — keep DR-1 and accept the global throttle** with its denial-of-service exposure.

**Independent of the choice, proceeding now:** the strict step-1 schema (F1.3 debt), shared step-2 schema and consent
constants, and the repository/service that writes the account rows under the user's identity.
