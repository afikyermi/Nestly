// A status line handed to the next screen ("הפוסט נמחק"). It lives in memory only and is taken once by the screen
// it names: not in the history entry, so Back and a reload never say it again.
let pending: { path: string; status: string } | null = null;

export function handOverStatus(path: string, status: string): void {
  pending = { path, status };
}

/** The status handed to `path`, once; '' when nothing was handed over or it was for another screen. */
export function takeStatus(path: string, accepted: string): string {
  const handed = pending;
  pending = null;
  return handed !== null && handed.path === path && handed.status === accepted ? accepted : '';
}
