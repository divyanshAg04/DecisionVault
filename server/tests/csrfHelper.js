// Shared CSRF test token — used in all integration tests
// In the double-submit-cookie pattern, the cookie and header must match.
export const TEST_CSRF_TOKEN = 'test-csrf-token-for-integration-tests';

/**
 * Build a cookie string that includes both the JWT auth token and the CSRF token.
 */
export function makeTestCookies(authCookie) {
  return `${authCookie}; csrfToken=${TEST_CSRF_TOKEN}`;
}
