import path from 'path';
import { execSync } from 'child_process';
import { rmSync, existsSync, readJsonSync, writeJsonSync } from 'fs-extra';
import { deduplicateSuppressors } from '../src/tsc-bulk';

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
  it('removes duplicates', () => {
    const input = [
      { filename: 'a.ts', scopeId: 'fn1', code: 1001 },
      { filename: 'a.ts', scopeId: 'fn1', code: 1001 },
      { filename: 'b.ts', scopeId: 'fn2', code: 1002 }
    ];
    const result = deduplicateSuppressors(input);
    expect(result).toHaveLength(2);
  });

  it('sorts output by filename, scopeId, then code', () => {
    const input = [
      { filename: 'c.ts', scopeId: 'fn1', code: 2000 },
      { filename: 'a.ts', scopeId: 'fn2', code: 1000 },
      { filename: 'a.ts', scopeId: 'fn1', code: 3000 },
      { filename: 'b.ts', scopeId: 'fn1', code: 1000 },
      { filename: 'a.ts', scopeId: 'fn1', code: 1000 }
    ];
    const result = deduplicateSuppressors(input);
    expect(result).toEqual([
      { filename: 'a.ts', scopeId: 'fn1', code: 1000 },
      { filename: 'a.ts', scopeId: 'fn1', code: 3000 },
      { filename: 'a.ts', scopeId: 'fn2', code: 1000 },
      { filename: 'b.ts', scopeId: 'fn1', code: 1000 },
      { filename: 'c.ts', scopeId: 'fn1', code: 2000 }
    ]);
  });

  it('produces identical output regardless of input order', () => {
    const items = [
      { filename: 'z.ts', scopeId: 'a', code: 100 },
      { filename: 'a.ts', scopeId: 'z', code: 200 },
      { filename: 'a.ts', scopeId: 'a', code: 300 },
      { filename: 'm.ts', scopeId: 'm', code: 150 }
    ];
    const reversed = [...items].reverse();
    const shuffled = [items[2], items[0], items[3], items[1]];

    const result1 = deduplicateSuppressors(items);
    const result2 = deduplicateSuppressors(reversed);
    const result3 = deduplicateSuppressors(shuffled);

    expect(result1).toEqual(result2);
    expect(result2).toEqual(result3);
  });
});

describe('Deterministic suppression output', () => {
  const toolScriptPath = path.resolve(__dirname, '../dist/index.js');
  const appDir = path.resolve(__dirname, 'fixtures', 'node');
  const bulkConfigPath = path.resolve(appDir, '.ts-bulk-suppressions.json');

  afterAll(() => {
    if (existsSync(bulkConfigPath)) rmSync(bulkConfigPath);
  });

  it('generates identical output across two runs', () => {
    if (existsSync(bulkConfigPath)) rmSync(bulkConfigPath);
    execSync(`node ${toolScriptPath} --gen-bulk-suppress`, { cwd: appDir });
    const first = readJsonSync(bulkConfigPath);

    rmSync(bulkConfigPath);
    execSync(`node ${toolScriptPath} --gen-bulk-suppress`, { cwd: appDir });
    const second = readJsonSync(bulkConfigPath);

    expect(first).toEqual(second);
  });
});

describe('--check-stale flag', () => {
  const toolScriptPath = path.resolve(__dirname, '../dist/index.js');
  const appDir = path.resolve(__dirname, 'fixtures', 'node');
  const bulkConfigPath = path.resolve(appDir, '.ts-bulk-suppressions.json');

  afterEach(() => {
    if (existsSync(bulkConfigPath)) rmSync(bulkConfigPath);
  });

  it('exits 0 when no stale suppressors exist', () => {
    execSync(`node ${toolScriptPath} --gen-bulk-suppress`, { cwd: appDir });
    expect(() =>
      execSync(`node ${toolScriptPath} --check-stale --ignore-external-error`, { cwd: appDir })
    ).not.toThrow();
  });

  it('exits non-zero when stale suppressors exist', () => {
    execSync(`node ${toolScriptPath} --gen-bulk-suppress`, { cwd: appDir });
    const config = readJsonSync(bulkConfigPath);
    config.bulkSuppressors.push({
      filename: 'nonexistent.ts',
      scopeId: '.fake',
      code: 9999
    });
    writeJsonSync(bulkConfigPath, config, { spaces: 2 });

    expect(() =>
      execSync(`node ${toolScriptPath} --check-stale --ignore-external-error`, { cwd: appDir })
    ).toThrow();
  });

  it('output lists stale suppressor details', () => {
    execSync(`node ${toolScriptPath} --gen-bulk-suppress`, { cwd: appDir });
    const config = readJsonSync(bulkConfigPath);
    config.bulkSuppressors.push({
      filename: 'nonexistent.ts',
      scopeId: '.fake',
      code: 9999
    });
    writeJsonSync(bulkConfigPath, config, { spaces: 2 });

    try {
      execSync(`node ${toolScriptPath} --check-stale --ignore-external-error`, {
        cwd: appDir,
        encoding: 'utf-8'
      });
      fail('Expected command to throw');
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string };
      const output = (err.stdout || '') + (err.stderr || '');
      expect(output).toContain('nonexistent.ts');
      expect(output).toContain('9999');
      expect(output).toContain('stale');
    }
  });

  it('skips stale check in partial file mode', () => {
    execSync(`node ${toolScriptPath} --gen-bulk-suppress`, { cwd: appDir });
    const config = readJsonSync(bulkConfigPath);
    config.bulkSuppressors.push({
      filename: 'nonexistent.ts',
      scopeId: '.fake',
      code: 9999
    });
    writeJsonSync(bulkConfigPath, config, { spaces: 2 });

    expect(() =>
      execSync(`node ${toolScriptPath} --check-stale --ignore-external-error index.ts`, { cwd: appDir })
    ).not.toThrow();
  });
});
