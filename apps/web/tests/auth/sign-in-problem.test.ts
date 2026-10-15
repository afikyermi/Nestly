// F1.5 part b criteria 5 and 6 (unit): the classification of an Auth sign-in failure, from interface.md "sign-in-problem.ts".
// The Hebrew texts of each problem are asserted with the login screen (part c).
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { classifySignInFailure } from '../../src/services/auth/sign-in-problem';

type Failure = Parameters<typeof classifySignInFailure>[0];
const f = (over: Partial<Failure>): Failure => ({ status: undefined, code: undefined, name: undefined, ...over });

describe('[F1.5 c5][ERR-001] one problem for every credential failure, so the screen cannot tell a wrong password from an unknown email', () => {
  it.each(['invalid_credentials', 'user_not_found', 'email_not_confirmed', 'user_banned'])('code %s (at any status) -> invalid_credentials', (code) => {
    for (const status of [400, 401, 422, undefined]) expect(classifySignInFailure(f({ code, status }))).toBe('invalid_credentials');
  });
});

describe('[F1.5 c6][ERR-001] the other failures', () => {
  it('status 429 -> rate_limited, whatever the code', () => {
    expect(classifySignInFailure(f({ status: 429 }))).toBe('rate_limited');
    expect(classifySignInFailure(f({ status: 429, code: 'something_else' }))).toBe('rate_limited');
  });
  it('code over_request_rate_limit -> rate_limited, whatever the status', () => {
    expect(classifySignInFailure(f({ code: 'over_request_rate_limit', status: 400 }))).toBe('rate_limited');
    expect(classifySignInFailure(f({ code: 'over_request_rate_limit' }))).toBe('rate_limited');
  });
  it.each([500, 502, 503, 599])('status %i -> unavailable', (status) => {
    expect(classifySignInFailure(f({ status }))).toBe('unavailable');
  });
  it('status 0 (a network error), the retryable-fetch name and AuthNotConfigured -> unavailable', () => {
    expect(classifySignInFailure(f({ status: 0 }))).toBe('unavailable');
    expect(classifySignInFailure(f({ name: 'AuthRetryableFetchError' }))).toBe('unavailable');
    expect(classifySignInFailure(f({ name: 'AuthNotConfigured' }))).toBe('unavailable');
  });
  it.each([
    [f({ status: 400, code: 'something_new' })],
    [f({ status: 422, code: 'weak_password' })],
    [f({ status: 499 })],
    [f({ status: 418, name: 'AuthApiError' })],
    [f({})],
  ])('anything else -> unknown (%j)', (failure) => {
    expect(classifySignInFailure(failure)).toBe('unknown');
  });
  it('the result is only one of the four problems and never carries the Auth text', () => {
    const out = classifySignInFailure(f({ code: 'SECRET_RAW_AUTH_MESSAGE', status: 400, name: 'SECRET_NAME' }));
    expect(['invalid_credentials', 'rate_limited', 'unavailable', 'unknown']).toContain(out);
  });
});
