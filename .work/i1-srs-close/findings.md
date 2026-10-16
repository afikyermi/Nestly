# findings — I1-close SRS update v2.19 (CRITIC, sonnet, 16.10.2026) — saved verbatim by ORCHESTRATOR (harness refused the write)

verdict: Validated

--- finding ---
severity: low
file:     docs/srs/15-acceptance.md:AC-113
claim:    AC-113 says "הכישלון ה-11 מאותה כתובת IP בתוך 15 דקות נועל אותה", but the 10th IP failure is the one that locks; the 11th attempt is the first one refused.
failure:  NFR-SEC-010 in the same diff says "10 כישלונות ב-15 דקות נועלים". In `apps/server/src/repositories/recovery-repository.ts` the lock is set when `short_next >= limit`, with limit 10. A test engineer who traces an expected value to AC-113 could assert "10 failures leave the IP unlocked, the 11th failure locks". That fails against the correct code.
fix:      Reword to "אחרי 10 כישלונות מאותה כתובת IP בתוך 15 דקות, הניסיון ה-11 מקבל ERR-043 לכל אימייל".
--- end ---

Checked: NFR-SEC-010 limits vs RECOVERY_LIMITS; VAL-045 normalisation and scrypt params; audit kinds vs RECOVERY_EVENT_KINDS; VAL-005/043/044 vs constants/registration.ts; recovery questions and texts; §12 secret-key exception (auth-admin.ts only); Google scopes, metadata clear, PKCE handling; S-01, S-16, DR-5 stated truthfully; IDs continue, OP-029 closure backed, open items stay open, version row complete.
Not verified: F1.2 DR-1 text against its spec; IPv6 /64 grouping and keyed IP hash; INDEX build not re-run (no shell).

## ORCHESTRATOR
Finding fixed with CRITIC's wording (AC-113); INDEX rebuilt and passing.
