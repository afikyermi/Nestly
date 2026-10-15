# Findings — debt-before-f15 (CRITIC, opus, 15.10.2026)

**Verdict: Validated.** D1 closes b-1 (a body of `select exists (select 1 from nestly.users)` fails three D1 assertions;
the policy is proven open by positive-count checks; rollback and the transaction guard hold). D2 satisfied. D3: no path
in the app-wide handler logs request content. Side note: Fastify's "incoming request" line logs `req.url` with the query
string once a logger is on; production has no logger today (api/index.ts, main.ts).

## 1 — low · apps/server/src/app.ts:44,46-50
Comment above the handler is stale ("The detail goes to the log"), and the logged `status` is the error's `statusCode`,
not the status sent: a plain Error logs no status; `statusCode: 503` logs 503 while 500 is sent.
Fix: log the status actually sent (4xx as is, else 500), as register.ts:74 does; reword the comment.
→ BUILDER.

## 2 — low · apps/server/src/app.ts:47-50, tests/error-handler-log.test.ts:198-208
A 5xx line now carries no stack, so an unexpected error cannot be located once a logger is on.
Fix (owner's decision): keep as built and record, or log stack frames without the message line for 5xx; never the whole
error object (a Postgres `detail` quotes written values).
→ ORCHESTRATOR decided: as built until C4 (logger with a privacy rule) — production has no logger, and C4 decides what a
5xx line carries. debt.md line.

## Re-check (15.10)
Finding 1: **closed** — status computed once, logged and sent; comment accurate. Verdict: **Validated**.
