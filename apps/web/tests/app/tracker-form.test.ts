import { describe, expect, it } from 'vitest';
import { decideAccess } from '@/app/access';
import { newForm, formToBody, toInstant } from '@/features/trackers/tracker-form';
import { trackerPageOfPath } from '@/lib/tracker-link';

// I6: the tracker form turns what was typed into the body the server checks again; a tracker page is a protected path.
const CHILD = '3f0c2c7e-8a56-4c1c-9f0e-1c7f6c1d2a11';
const NOW = new Date('2026-10-20T10:00:00Z');

describe('[F6.0-a c6 AC-007 AC-023] the tracker form', () => {
  it('reads an Israeli date and time as an instant (summer time: UTC+3)', () => {
    expect(toInstant({ date: { day: '20', month: '10', year: '2026' }, time: '08:30' })).toBe('2026-10-20T05:30:00.000Z');
    expect(toInstant({ date: { day: '20', month: '10', year: '2026' }, time: '25:00' })).toBeNull();
    expect(toInstant({ date: { day: '31', month: '2', year: '2026' }, time: '08:30' })).toBeNull();
  });

  it('AC-007 builds the body of a bottle with the child and the amount', () => {
    const form = { ...newForm(CHILD, NOW), amountMl: '120' };
    const result = formToBody('bottle', form, true);
    expect(result.ok && result.body).toMatchObject({ kind: 'bottle', childId: CHILD, amountMl: 120 });
  });

  it('AC-023 refuses a breastfeeding whose end is before its start, and sends nothing', () => {
    const base = newForm(CHILD, NOW);
    const form = { ...base, choice: 'left', start: { ...base.start, time: '10:00' }, end: { ...base.end, time: '09:00' } };
    expect(formToBody('breastfeeding', form, true)).toEqual({ ok: false, error: 'זמן הסיום לא יכול להיות מוקדם מזמן ההתחלה.' });
  });

  it('asks for the required fields of a medicine and for one measure of a growth', () => {
    const form = newForm(CHILD, NOW);
    expect(formToBody('medicine', { ...form, name: 'אקמול' }, true).ok).toBe(false);
    expect(formToBody('growth', form, true).ok).toBe(false);
    expect(formToBody('growth', { ...form, weightKg: '4,2' }, true)).toMatchObject({ ok: true, body: { weightKg: 4.2 } });
  });

  it('an edit sends no child', () => {
    const result = formToBody('bath', newForm(CHILD, NOW), false);
    expect(result.ok && 'childId' in result.body).toBe(false);
  });
});

describe('[F6.0-a c7] the tracker pages are protected paths', () => {
  it('knows the nine pages and nothing else', () => {
    expect(trackerPageOfPath('/trackers/bottle')).toBe('bottle');
    expect(trackerPageOfPath('/trackers/cycle')).toBe('cycle');
    expect(trackerPageOfPath('/trackers/nap')).toBeNull();
    expect(trackerPageOfPath('/trackers/bottle/x')).toBeNull();
  });

  it('a signed-in user may open one, a Guest goes to the entry screen', () => {
    expect(decideAccess('signed-in', '/trackers/sleep').kind).toBe('render');
    expect(decideAccess('signed-in', '/trackers/nap').kind).toBe('redirect');
    expect(decideAccess('signed-out', '/trackers/sleep').kind).toBe('redirect');
  });
});
