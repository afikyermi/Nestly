# findings — F1.8 google-sign-in (CRITIC, opus, 17.10.2026)

Saved verbatim by ORCHESTRATOR: the harness refused CRITIC's own write.

```
verdict: Validated with Concern

Scope: whole F1.8 (P1 guard, P2a/P2b auth, P3 screens), review.diff against main. notes.md not read.

Concern (cost carried, for debt.md):
- S-53 is unchanged, not worse: the new flow file reads no secret (no process.env, no fs; it uses only page/baseURL
  from support/fixtures.ts). But any TEST ENGINEER e2e-preview/<name>.flow.ts can ask for the bypassSecret fixture
  (e2e-preview/support/fixtures.ts:39) and send it anywhere. The guard cannot see this. Every new flow file needs a
  CRITIC check until S-53 is closed.
- The guard treats e2e-preview/*.flow.ts as a TEST ENGINEER test file, but isTestPath (guard.js:88), which bars
  BUILDER, does not include it. So BUILDER can still write flow files, as it could before this change. Nothing was
  widened, but the "BUILDER does not write tests" rule does not cover the new test kind. Retro item (guard frozen).

--- finding ---
severity: low
file:     apps/web/src/services/auth/auth-client.ts:1167-1175 (diff lines; completeGoogleSignIn)
claim:    The profile keys are cleared in user_metadata, but the access token that was already issued still carries the old metadata. That token is stored and sent unchanged.
failure:  A Google return issues a Supabase access token whose user_metadata claim holds full_name, name, picture and
          avatar_url, and whose email claim holds the address. The clear (updateUser({data})) does not reissue the
          token. So for up to the token lifetime (~1 h), on every Google sign-in, nestly-auth in localStorage holds
          Google's name and picture URL in base64. The same token goes to /api/me and /api/register. This makes S-04
          and S-23 (a future logger writing token content) slightly worse. Criterion 13 ("only the one session key ...
          no email") is not met for the token's content, and the c13 test cannot see it: its fake JWT
          (google-return.test.tsx) has no user_metadata or email claim.
fix:      After a clear that succeeds, refresh the session once (refreshSession) before returning the access token,
          so the token that is stored and sent no longer has the keys. Extend the c13 test with a fake JWT whose payload
          has the Google keys. Note in S-04 that the email claim in the token was already there before F1.8.
--- end ---

--- finding ---
severity: low
file:     apps/web/src/features/google-return/GoogleReturn.tsx (effect: no exchange on error/cancel) · apps/web/tests/google/google-return.test.tsx (c15 test, map keys assertion)
claim:    A return that does no exchange leaves the PKCE verifier in localStorage indefinitely. The c15 test expects a key name that comes from the SDK, not from the spec.
failure:  The user presses "המשך עם Google", then cancels consent (?error=access_denied) or gets a provider error. The
          return route makes no exchange, so nestly-auth-code-verifier stays in localStorage until the next start or a
          sign-out. This breaks criterion 13 ("web storage holds only the one session key") on these paths, and the c4
          tests only check the session key. The impact is small: PKCE binding still stops login CSRF, and a code
          exchanged later with a stale verifier fails. Separately, criterion 15 as written ("no storage other than the
          SDK's own session key") cannot be met by any SPA PKCE flow. The test settles this by asserting the SDK's
          <key>-code-verifier name, an expected value that comes from the implementation and not from a criterion.
fix:      On a return that does not exchange (cancelled, error, missing code), remove the fixed verifier key. Assert
          this in the c4 and c3 cases. Send a one-line DECISION REQUEST to correct the c15 wording ("the verifier only
          under the SDK's verifier key, removed after the return"), so the test's expected value traces to the spec.
--- end ---

--- finding ---
severity: low
file:     apps/web/src/features/registration/RegisterGoogleCompletionStep.tsx:113,147 (against spec.md criterion 7)
claim:    The Google completion step disables its submit button, which the design-system forbids (item 9), and it never shows a consent error. Both differ from the sibling steps, and the spec requires the disabled submit.
failure:  On Google completion step 2, the user types a 7-character password, or does not tick the checkbox, and
          presses "יצירת חשבון". Nothing happens and no error appears. The control is a native disabled button, so it
          cannot be focused and screen readers skip it. ConsentField error={false} makes the consent error unreachable,
          and consentErrorId is never used. RegisterConsentStep.tsx:107 and RegisterStepTwo.tsx:167 keep the submit
          enabled and show errors on press. The cause is spec.md c7 ("disabled until password is valid and the checkbox
          ticked"), which conflicts with design-system rule 9 ("a submit button is not disabled; show the errors
          instead"), so this is a defect in the spec.
fix:      DECISION REQUEST (ORCHESTRATOR): align c7 with the design system and the F1.5 pattern. The submit stays
          enabled; pressing it with invalid input shows the password error and the consent error (aria-describedby)
          and makes no call. Then change the step and its c7 tests. If the spec stays as it is, record the exception in
          decisions.md.
--- end ---

Checked, no finding:
- Guard (guard.js:603-607): only TEST ENGINEER's write rule changes. TOOL_CONFIG and the notes and app-impl
  exclusions run first. Both the lexical and the realpath form must match ^e2e-preview/[^/]+\.flow\.ts$. On Windows
  case is folded to the same file, and on POSIX an upper-case name is denied. ".." is normalised away, and an apps/src
  target is denied. Absolute, UNC and device paths are refused by outsideRoot. A symlink or junction is refused by the
  realpath form. x.config.flow.ts is refused by TOOL_CONFIG. A bare ".flow.ts", sub/, .bak, a trailing dot and an 8.3
  name are denied. An NTFS stream name that ends .flow.ts writes only an alternate stream, not the file's content.
  CRITIC and BUILDER gain nothing.
- OAuth: PKCE is on only for the start and the exchange. A missing verifier fails, and the SDK removes the verifier on
  any exchange. The URL is replaced with the bare path before the exchange. redirect_to is origin + /auth/google, and
  leave() accepts https only. error_description is never rendered. A code that comes with error* is not exchanged.
  Signed-in users are redirected by the guard before any exchange. No token, code or verifier is in a log or a URL.
- DR-5: no read of the keys in apps/web/src (scan + manual). Clearing with null deletes the keys in GoTrue. A failed
  clear is ignored.
- Completion: setPassword runs before register, and the register body is step 1 only. same_password counts as
  success. A failed set clears only the password. Provider detection uses getUser(); an error rejects, which leads to
  the hold screen with a retry (fails closed). The email+password orphan path is unchanged. decideAccess holds every
  route for signed-in-no-account.
- Status check: the Google return goes through the same signInThrough/accountState as a password sign-in. A stopped
  account is signed out and shows ERR-037.
- Tests: expected texts and URLs trace to spec criteria (except the c15 key noted above). The source scan is
  spec-mandated (c12/c13). Size: product about 730 lines, tests about 1,250, about 1.7×, inside 2×.
```

## ORCHESTRATOR decisions on the two DECISION REQUESTs (17.10)
- **c7:** aligned with design-system rule 9 and the F1.5 pattern — submit enabled; pressing with invalid input shows the password and consent errors (aria-describedby) and makes no call.
- **c15:** reworded — "the PKCE verifier only under the SDK's verifier key, removed after the return (exchanged or not)".

---

# Re-check — CRITIC, opus, 17.10.2026, commit b3e9b92 (saved verbatim by ORCHESTRATOR)

verdict: Validated with Concern

Findings 1, 2, 3: closed (evidence in the hand-back: auth-client.ts:342-358, GoogleReturn.tsx:40-42, auth-client.ts:361-363,
RegisterGoogleCompletionStep.tsx:769, google-return.test.tsx:169,182,337-347,386-413, google-completion.test.tsx:189-253).
The extra refresh vs F1.5: no defect — TOKEN_REFRESHED fires before apply(), recheck() returns at once (auth-session-source.ts:157,211-213).
Below the line: a refused renewal right after the exchange leaves refreshRefused true; a SIGNED_OUT from another tab then shows "expired".

```
--- finding ---
severity: low
file:     apps/web/tests/google/google-return.test.tsx:26-33,402
claim:    The c13 test checks that the stored access token has no email claim, but the fake refreshed token is simply built without one. A real Supabase token always carries the email, as security-privacy-open.md S-04 records.
failure:  The test passes against the fake, while a real Google sign-in stores a token whose claims hold the email. A reader of the c13 test would conclude something false about production, and if the email claim later starts to matter (S-23, a logger writing token content), the test is evidence it does not exist.
fix:      Have the fake refreshed token carry the email, as Supabase's does, and drop the `not.toHaveProperty('email')` assertion. Keep the Google-key assertions. Correct c13's wording ("tokens, no email" means no email outside the token) when the SRS is updated at I1 close.
--- end ---
```

Concern (debt.md): c13 says the stored session holds "tokens, no email", which is not true of the token's content; S-04 accepts it; the wording is corrected with the I1 SRS update.
