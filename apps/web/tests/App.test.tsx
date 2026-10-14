// F1.2 criterion 1 replaces the 7.0 skeleton test (a heading exactly "Nestly"): the app at / is Welcome.
// Derived from .work/app-shell-guard/spec.md only. In the test environment the session source is the production
// one (criterion 13: always signed-out), so a Guest sees Welcome.
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { actionNamed, h1, mountAt } from './app/util';

describe('App at /', () => {
  it('[F1.2 c1][FR-AUTH-001][AC-001] a Guest at / sees the Welcome h1 "הצטרפות ל-Nestly", not the 7.0 skeleton heading', async () => {
    await mountAt('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'הצטרפות ל-Nestly' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Nestly' })).not.toBeInTheDocument();
  });

  it('[F1.2 c1][FR-AUTH-001][AC-001] Welcome shows one h1, the lead text, and the three actions in this order', async () => {
    const { container } = await mountAt('/');
    await screen.findByRole('heading', { level: 1, name: 'הצטרפות ל-Nestly' });
    expect(screen.getByText('קהילה חמה להורים ולהורים לעתיד, במקום אחד.')).toBeInTheDocument();
    const els = ['יצירת חשבון חדש', 'המשך עם Google', 'כבר יש לי חשבון'].map(actionNamed);
    for (let i = 1; i < els.length; i += 1) {
      const prev = els[i - 1];
      const next = els[i];
      if (prev === undefined || next === undefined) throw new Error('action missing');
      expect(prev.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(h1()).toHaveTextContent('הצטרפות ל-Nestly');
  });
});
