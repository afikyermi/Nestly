# notes — D3
**Approach** app.ts error handler now logs `{ status, code, name }` only (no `err` object, so no message/stack/body). Responses unchanged.
**Uncertain** the register route's own handler is separate and untouched. No new tests (TEST ENGINEER). Typecheck, eslint on app.ts, server tests (247) pass.
**Finding 1** app.ts error handler computes the sent status once (4xx as is, else 500) and uses it for both the log and the reply; comment reworded (status, code, name; nothing from the request). Responses unchanged. Typecheck, eslint, `npm test` (252) pass.
