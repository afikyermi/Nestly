/** What the copy-link button needs of the browser: the clipboard. A test passes its own. */
export interface BrowserClipboard {
  /** Writes `text` to the clipboard. False when the browser refuses or has no clipboard. Never rejects. */
  writeText(text: string): Promise<boolean>;
}

// The one place web logic reaches the clipboard (F2.4c2 c26).
export function windowClipboard(): BrowserClipboard {
  return {
    writeText: async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    },
  };
}
