# findings — gateway-publishable-key (CRITIC, opus, 17.10.2026; saved by ORCHESTRATOR)

--- bug ---
severity: low
file:     apps/server/src/recovery/dependencies.ts:52 (with routes/password.ts:46, auth-admin.ts:106-107)
claim:    the password routes (forced new password, change, first password) gate on isAdminConfigured, which now also needs the
          publishable key, though they only make the admin set (secret key).
failure:  an environment with the secret key and issuer but no SUPABASE_PUBLISHABLE_KEY → those routes answer "unavailable"; fail closed,
          nothing exposed; the variable exists in Vercel (Gate 1), so only a misconfigured env is affected.
fix:      per-flow readiness on AuthAccountPort (password routes: secret+issuer; S-01 identity link and reset: both); a route-level test.
status:   accepted → debt.md (ORCHESTRATOR, 17.10: low, fail-closed, no exposure; not widened in this part)
