# findings — F2.3b profile-privacy, profile_view (CRITIC, 17.10.2026, one round)

--- bug ---
severity: low
file:     supabase/migrations/20261017150000_profile_view.sql:483; supabase/tests/53_profile_view.sql; spec.md c8, c14
claim:    spec says ages "in slot order"; function and test return (created_at, slot) order — schema.md's "= slot order today"
          stopped holding when F2.2b2 allowed seat reuse.
fix:      spec amended (Change control block in spec.md): display order (created_at, slot). Code unchanged.
--- end ---
No critical, high or medium bug. CRITIC validates the data-model.md approved-exceptions entry for `profile_view` against the
as-built SQL (promotion validated).
