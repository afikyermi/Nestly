// A child's age as Hebrew web copy (FR-PRIV-001, DR-3 Afik 17.10.2026; spec profile-privacy c17, Q3-Q6). The database returns
// completed years and months (profile_view, c14); this turns them into one phrase. No sex marker (the read carries no sex),
// no "גיל" label (the caller's copy). One and two are word forms; 3 and up are digits with the plural, joined by "ו-".

function yearsPhrase(years: number): string {
  if (years === 1) return 'שנה';
  if (years === 2) return 'שנתיים';
  return `${years} שנים`;
}

function monthsPhrase(months: number): string {
  if (months === 1) return 'חודש';
  if (months === 2) return 'חודשיים';
  return `${months} חודשים`;
}

/** The "and N months" tail after a number of years: "וחודש", "וחודשיים", "ו-3 חודשים". */
function andMonthsPhrase(months: number): string {
  if (months === 1) return 'וחודש';
  if (months === 2) return 'וחודשיים';
  return `ו-${months} חודשים`;
}

/**
 * The age phrase for completed years (an integer, 0 or more) and months (an integer, 0 to 11): (0,0) "פחות מחודש",
 * (0,4) "4 חודשים", (1,0) "שנה", (1,3) "שנה ו-3 חודשים", (2,2) "שנתיים וחודשיים". Anything else throws a RangeError.
 */
export function formatChildAge(years: number, months: number): string {
  if (!Number.isInteger(years) || years < 0) throw new RangeError('years must be a non-negative integer');
  if (!Number.isInteger(months) || months < 0 || months > 11) throw new RangeError('months must be an integer from 0 to 11');
  if (years === 0) return months === 0 ? 'פחות מחודש' : monthsPhrase(months);
  if (months === 0) return yearsPhrase(years);
  return `${yearsPhrase(years)} ${andMonthsPhrase(months)}`;
}
