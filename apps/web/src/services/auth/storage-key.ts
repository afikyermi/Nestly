// The one browser-storage key the Auth session lives under (F1.5 DR-3). Tokens only: the user object (with the email) is kept
// in memory by the Auth client, and the password never reaches storage. Nothing else in the web writes to web storage.
export const AUTH_STORAGE_KEY = 'nestly-auth';
