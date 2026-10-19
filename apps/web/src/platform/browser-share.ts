/** What the device share option needs of the browser (F3.6 c4, c5). A test passes its own. */
export interface DeviceShare {
  /** Whether the browser has its own share sheet (navigator.share; a secure context, not Firefox desktop). */
  available(): boolean;
  /** Opens it with the title and the link only. `cancelled`: the person closed it (AbortError). Never rejects. */
  share(data: { title: string; url: string }): Promise<'shared' | 'cancelled' | 'failed'>;
}

// The one place web logic reaches the device share sheet (F3.6).
export function windowDeviceShare(): DeviceShare {
  return {
    available: () => typeof navigator !== 'undefined' && typeof navigator.share === 'function',
    share: async (data) => {
      try {
        await navigator.share({ title: data.title, url: data.url });
        return 'shared';
      } catch (error) {
        return error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'failed';
      }
    },
  };
}
