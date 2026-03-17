import { findStaleSuppressors } from '../src/tsc-bulk';
import type { StatisticsItem } from '../src/types';

describe('findStaleSuppressors', () => {
  it('returns items with total === 0', () => {
    const items: StatisticsItem[] = [
      { type: 'bulk', filename: 'a.ts', scopeId: '.foo', code: 2322, total: 0 },
      { type: 'bulk', filename: 'b.ts', scopeId: '.bar', code: 2345, total: 3 },
      { type: 'pattern', pathRegExp: '.*\\.test\\.ts', code: 7006, total: 0 }
    ];
    const stale = findStaleSuppressors(items);
    expect(stale).toEqual([items[0], items[2]]);
  });

  it('returns empty array when no stale items', () => {
    const items: StatisticsItem[] = [
      { type: 'bulk', filename: 'a.ts', scopeId: '.foo', code: 2322, total: 1 }
    ];
    expect(findStaleSuppressors(items)).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(findStaleSuppressors([])).toEqual([]);
  });
});
