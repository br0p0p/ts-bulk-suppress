import { findStaleSuppressors, trimStaleSuppressors } from '../src/tsc-bulk';
import type { StatisticsItem, BulkConfig } from '../src/types';

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

describe('trimStaleSuppressors', () => {
  const baseConfig: BulkConfig = {
    $schema: 'https://tiktok.github.io/ts-bulk-suppress/ts-bulk-suppress.schema.json',
    project: './tsconfig.json',
    patternSuppressors: [
      { pathRegExp: '.*\\.test\\.ts', codes: [7006] },
      { pathRegExp: '.*\\.spec\\.ts', suppressAll: true }
    ],
    bulkSuppressors: [
      { filename: 'a.ts', scopeId: '.foo', code: 2322 },
      { filename: 'b.ts', scopeId: '.bar', code: 2345 }
    ]
  };

  it('removes stale bulk suppressors', () => {
    const stats: StatisticsItem[] = [
      { type: 'bulk', filename: 'a.ts', scopeId: '.foo', code: 2322, total: 0 },
      { type: 'bulk', filename: 'b.ts', scopeId: '.bar', code: 2345, total: 5 },
      { type: 'pattern', pathRegExp: '.*\\.test\\.ts', code: 7006, total: 2 },
      { type: 'pattern', pathRegExp: '.*\\.spec\\.ts', code: -1, total: 1 }
    ];
    const result = trimStaleSuppressors(baseConfig, stats);
    expect(result.bulkSuppressors).toEqual([{ filename: 'b.ts', scopeId: '.bar', code: 2345 }]);
    expect(result.patternSuppressors).toEqual(baseConfig.patternSuppressors);
  });

  it('removes stale pattern suppressors when all codes are stale', () => {
    const stats: StatisticsItem[] = [
      { type: 'bulk', filename: 'a.ts', scopeId: '.foo', code: 2322, total: 1 },
      { type: 'bulk', filename: 'b.ts', scopeId: '.bar', code: 2345, total: 1 },
      { type: 'pattern', pathRegExp: '.*\\.test\\.ts', code: 7006, total: 0 },
      { type: 'pattern', pathRegExp: '.*\\.spec\\.ts', code: -1, total: 0 }
    ];
    const result = trimStaleSuppressors(baseConfig, stats);
    expect(result.bulkSuppressors).toEqual(baseConfig.bulkSuppressors);
    expect(result.patternSuppressors).toEqual([]);
  });

  it('does not mutate the original config', () => {
    const stats: StatisticsItem[] = [
      { type: 'bulk', filename: 'a.ts', scopeId: '.foo', code: 2322, total: 0 },
      { type: 'bulk', filename: 'b.ts', scopeId: '.bar', code: 2345, total: 1 },
      { type: 'pattern', pathRegExp: '.*\\.test\\.ts', code: 7006, total: 1 },
      { type: 'pattern', pathRegExp: '.*\\.spec\\.ts', code: -1, total: 1 }
    ];
    const originalBulkCount = baseConfig.bulkSuppressors.length;
    trimStaleSuppressors(baseConfig, stats);
    expect(baseConfig.bulkSuppressors.length).toBe(originalBulkCount);
  });
});
