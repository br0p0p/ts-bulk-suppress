import path from 'path';
import { execSync } from 'child_process';
import { readFileSync, rmSync, existsSync } from 'fs-extra';
import { deduplicateSuppressors } from '../src/tsc-bulk';
import type { BulkSuppressor } from '../src/types';

describe('App pass test', () => {
  const toolScriptPath = path.resolve(__dirname, '../dist/index.js');
  const appDir = path.resolve(__dirname, 'fixtures', 'node');
  const bulkConfigPath = path.resolve(appDir, '.ts-bulk-suppressions.json');

  it(`won't pass without any .ts-bulk-suppressions.json`, () => {
    if (existsSync(bulkConfigPath)) rmSync(bulkConfigPath);
    expect(() => {
      execSync(`node ${toolScriptPath}`, { cwd: appDir });
    }).toThrow();
  });

  it(`generates .ts-bulk-suppressions.json`, () => {
    execSync(`node ${toolScriptPath} --gen-bulk-suppress `, { cwd: appDir });
    expect(existsSync(bulkConfigPath)).toBe(true);
  });

  it(`won't pass because of externalError`, () => {
    expect(() => {
      execSync(`node ${toolScriptPath}  `, { cwd: appDir });
    }).toThrow();
  });

  it(`pass because filtered ignoreExternalError`, () => {
    expect(() => execSync(`node ${toolScriptPath} --ignore-external-error`, { cwd: appDir })).not.toThrow();
    if (existsSync(bulkConfigPath)) rmSync(bulkConfigPath);
  });
});

describe('deduplicateSuppressors', () => {
  it('removes duplicate suppressors', () => {
    const input: BulkSuppressor[] = [
      { filename: 'a.ts', scopeId: 'fn1', code: 1001 },
      { filename: 'a.ts', scopeId: 'fn1', code: 1001 },
      { filename: 'b.ts', scopeId: 'fn2', code: 1002 }
    ];
    const result = deduplicateSuppressors(input);
    expect(result).toHaveLength(2);
  });

  it('sorts output by filename, then scopeId, then code', () => {
    const input: BulkSuppressor[] = [
      { filename: 'c.ts', scopeId: 'fn1', code: 1001 },
      { filename: 'a.ts', scopeId: 'fn2', code: 1002 },
      { filename: 'a.ts', scopeId: 'fn1', code: 1003 },
      { filename: 'b.ts', scopeId: 'fn1', code: 1001 },
      { filename: 'a.ts', scopeId: 'fn1', code: 1001 }
    ];
    const result = deduplicateSuppressors(input);
    expect(result).toEqual([
      { filename: 'a.ts', scopeId: 'fn1', code: 1001 },
      { filename: 'a.ts', scopeId: 'fn1', code: 1003 },
      { filename: 'a.ts', scopeId: 'fn2', code: 1002 },
      { filename: 'b.ts', scopeId: 'fn1', code: 1001 },
      { filename: 'c.ts', scopeId: 'fn1', code: 1001 }
    ]);
  });

  it('produces deterministic output regardless of input order', () => {
    const items: BulkSuppressor[] = [
      { filename: 'z.ts', scopeId: 'a', code: 3 },
      { filename: 'a.ts', scopeId: 'z', code: 1 },
      { filename: 'a.ts', scopeId: 'a', code: 2 }
    ];
    const reversed = [...items].reverse();
    expect(deduplicateSuppressors(items)).toEqual(deduplicateSuppressors(reversed));
  });
});

describe('Suppression output idempotency', () => {
  const toolScriptPath = path.resolve(__dirname, '../dist/index.js');
  const appDir = path.resolve(__dirname, 'fixtures', 'node');
  const bulkConfigPath = path.resolve(appDir, '.ts-bulk-suppressions.json');

  afterAll(() => {
    if (existsSync(bulkConfigPath)) rmSync(bulkConfigPath);
  });

  it('produces identical output on consecutive runs', () => {
    if (existsSync(bulkConfigPath)) rmSync(bulkConfigPath);

    execSync(`node ${toolScriptPath} --gen-bulk-suppress`, { cwd: appDir });
    const firstRun = readFileSync(bulkConfigPath, 'utf-8');

    execSync(`node ${toolScriptPath} --gen-bulk-suppress`, { cwd: appDir });
    const secondRun = readFileSync(bulkConfigPath, 'utf-8');

    expect(firstRun).toBe(secondRun);
  });
});
