// I13 (OP-039): the day's login is one counter a day per account (the database keeps daily_login at 1). GET /api/me runs on every app start
// and session check, so a server instance remembers, for the current Israel day, the accounts whose login it already recorded, and skips the
// write for them. A memory per instance only: another instance, or a restart, writes once more and the database still counts one. Bounded:
// a new day starts empty, and a full set starts over (the cost is one more harmless write per account).

/** The most accounts one instance remembers for a day. */
export const DAILY_LOGIN_MEMO_LIMIT = 10_000;

const ISRAEL_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' });

/** The calendar day in Israel time (YYYY-MM-DD), as the database dates a usage event. */
export function israelDay(at: Date): string {
  return ISRAEL_DAY.format(at);
}

export interface DailyLoginMemo {
  /** Whether this account's login of the day `at` falls in was already recorded by this instance. */
  has(userId: string, at: Date): boolean;
  /** Remember that this account's login of that day was recorded. */
  remember(userId: string, at: Date): void;
  /** How many accounts are remembered (for tests). */
  size(): number;
}

export function createDailyLoginMemo(limit = DAILY_LOGIN_MEMO_LIMIT): DailyLoginMemo {
  let day = '';
  let seen = new Set<string>();
  const sync = (at: Date): void => {
    const current = israelDay(at);
    if (current !== day) {
      day = current;
      seen = new Set();
    }
  };
  return {
    has(userId, at) {
      sync(at);
      return seen.has(userId);
    },
    remember(userId, at) {
      sync(at);
      if (!seen.has(userId) && seen.size >= limit) seen = new Set();
      seen.add(userId);
    },
    size: () => seen.size,
  };
}
