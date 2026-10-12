// Test preload: makes process.platform report FORCE_PLATFORM, so guard.js can be exercised as on
// win32, linux or darwin from any host. Used only by guard-case.test.js (node --require).
'use strict';
if (process.env.FORCE_PLATFORM) {
  Object.defineProperty(process, 'platform', { value: process.env.FORCE_PLATFORM });
}
