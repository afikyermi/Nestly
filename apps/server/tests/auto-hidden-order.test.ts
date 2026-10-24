import type { QueueItem } from '@nestly/shared';
import { describe, expect, it } from 'vitest';
import { autoHiddenFirst } from '../src/services/admin-service.js';

// The report queue's order after ten identical reports (I14 completion B, BR-074, OP-063 built per its default): child safety first, then
// the items hidden from everyone, then the rest; each part keeps the queue's own order.
const item = (n: number, priority: number, autoHidden = false): QueueItem => ({
  targetKind: 'post',
  targetId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  reportCount: 1,
  priority,
  topReasonLabel: 'x',
  isRising: false,
  firstReportedAt: '2026-10-21T10:00:00.000Z',
  autoHidden,
});

describe('[F14.3-b BR-074 AC-160 OP-063] the queue puts an auto-hidden item right after child safety', () => {
  it('child safety, then the auto-hidden items, then the rest, each in the queue\'s order', () => {
    const queue = [item(1, 3), item(2, 2, true), item(3, 1), item(4, 3, true), item(5, 1, true), item(6, 2)];
    expect(autoHiddenFirst(queue).map((row) => Number(row.targetId.slice(-2)))).toEqual([3, 5, 2, 4, 1, 6]);
  });

  it('changes nothing when no item is hidden (child safety already leads the queue)', () => {
    const queue = [item(1, 1), item(2, 3), item(3, 2)];
    expect(autoHiddenFirst(queue)).toEqual(queue);
  });
});
