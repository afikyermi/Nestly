// A status line handed to the next screen in the navigation state ("הפוסט פורסם", "הפוסט נמחק"). Only a text the receiving screen
// names is accepted, so nothing else in the history state can reach the page.
export function flashStatus(state: unknown, accepted: string): string {
  const text: unknown = typeof state === 'object' && state !== null ? Reflect.get(state, 'status') : undefined;
  return text === accepted ? accepted : '';
}
