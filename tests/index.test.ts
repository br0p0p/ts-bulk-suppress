import path from 'path';
import { execSync } from 'child_process';
import { readFileSync, rmSync, existsSync, writeJSONSync } from 'fs-extra';
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

describe('Subcommand: suppress', () => {
  const toolScriptPath = path.resolve(__dirname, '../dist/index.js');
  const appDir = path.resolve(__dirname, 'fixtures', 'node');
  const bulkConfigPath = path.resolve(appDir, '.ts-bulk-suppressions.json');

  afterEach(() => {
    if (existsSync(bulkConfigPath)) rmSync(bulkConfigPath);
  });

  it('generates suppressions via subcommand', () => {
    execSync(`node ${toolScriptPath} init`, { cwd: appDir });
    execSync(`node ${toolScriptPath} suppress`, { cwd: appDir });
    expect(existsSync(bulkConfigPath)).toBe(true);
    const content = JSON.parse(readFileSync(bulkConfigPath, 'utf-8'));
    expect(content.bulkSuppressors.length).toBeGreaterThan(0);
  });

  it('produces same output as deprecated --gen-bulk-suppress', () => {
    execSync(`node ${toolScriptPath} init`, { cwd: appDir });
    execSync(`node ${toolScriptPath} suppress`, { cwd: appDir });
    const subcommandResult = readFileSync(bulkConfigPath, 'utf-8');
    rmSync(bulkConfigPath);
    execSync(`node ${toolScriptPath} --gen-bulk-suppress`, { cwd: appDir });
    const flagResult = readFileSync(bulkConfigPath, 'utf-8');
    expect(subcommandResult).toBe(flagResult);
  });
});

describe('Subcommand: init', () => {
  const toolScriptPath = path.resolve(__dirname, '../dist/index.js');
  const appDir = path.resolve(__dirname, 'fixtures', 'node');
  const bulkConfigPath = path.resolve(appDir, '.ts-bulk-suppressions.json');

  afterEach(() => {
    if (existsSync(bulkConfigPath)) rmSync(bulkConfigPath);
  });

  it('creates default config via subcommand', () => {
    execSync(`node ${toolScriptPath} init`, { cwd: appDir });
    expect(existsSync(bulkConfigPath)).toBe(true);
    const content = JSON.parse(readFileSync(bulkConfigPath, 'utf-8'));
    expect(content.bulkSuppressors).toEqual([]);
    expect(content.patternSuppressors).toEqual([]);
  });
});

describe('Subcommand: check', () => {
  const toolScriptPath = path.resolve(__dirname, '../dist/index.js');
  const appDir = path.resolve(__dirname, 'fixtures', 'node');
  const bulkConfigPath = path.resolve(appDir, '.ts-bulk-suppressions.json');

  afterEach(() => {
    if (existsSync(bulkConfigPath)) rmSync(bulkConfigPath);
  });

  it('exits 0 when suppressions are in sync', () => {
    execSync(`node ${toolScriptPath} init`, { cwd: appDir });
    execSync(`node ${toolScriptPath} suppress`, { cwd: appDir });
    execSync(`node ${toolScriptPath} check --ignore-external-error`, { cwd: appDir });
  });

  it('exits 3 when stale suppressions exist', () => {
    execSync(`node ${toolScriptPath} init`, { cwd: appDir });
    execSync(`node ${toolScriptPath} suppress`, { cwd: appDir });

    const config = JSON.parse(readFileSync(bulkConfigPath, 'utf-8'));
    config.bulkSuppressors.push({
      filename: 'nonexistent.ts',
      scopeId: '.fake',
      code: 9999
    });
    writeJSONSync(bulkConfigPath, config, { spaces: 2 });

    try {
      execSync(`node ${toolScriptPath} check --ignore-external-error`, { cwd: appDir });
      fail('Expected exit code 3');
    } catch (e: unknown) {
      expect((e as { status: number }).status).toBe(3);
    }
  });

  it('exits 2 when unsuppressed errors exist (takes priority)', () => {
    execSync(`node ${toolScriptPath} init`, { cwd: appDir });
    try {
      execSync(`node ${toolScriptPath} check`, { cwd: appDir });
      fail('Expected non-zero exit');
    } catch (e: unknown) {
      expect((e as { status: number }).status).toBe(2);
    }
  });
});

describe('Subcommand: trim', () => {
  const toolScriptPath = path.resolve(__dirname, '../dist/index.js');
  const appDir = path.resolve(__dirname, 'fixtures', 'node');
  const bulkConfigPath = path.resolve(appDir, '.ts-bulk-suppressions.json');

  afterEach(() => {
    if (existsSync(bulkConfigPath)) rmSync(bulkConfigPath);
  });

  it('removes stale suppressors from config file', () => {
    execSync(`node ${toolScriptPath} init`, { cwd: appDir });
    execSync(`node ${toolScriptPath} suppress`, { cwd: appDir });
    const before = JSON.parse(readFileSync(bulkConfigPath, 'utf-8'));
    const originalCount = before.bulkSuppressors.length;

    before.bulkSuppressors.push({
      filename: 'nonexistent.ts',
      scopeId: '.fake',
      code: 9999
    });
    writeJSONSync(bulkConfigPath, before, { spaces: 2 });

    execSync(`node ${toolScriptPath} trim --ignore-external-error`, { cwd: appDir });
    const after = JSON.parse(readFileSync(bulkConfigPath, 'utf-8'));
    expect(after.bulkSuppressors.length).toBe(originalCount);
    expect(
      after.bulkSuppressors.find((s: BulkSuppressor) => s.filename === 'nonexistent.ts')
    ).toBeUndefined();
  });
});

describe('Subcommand: update', () => {
  const toolScriptPath = path.resolve(__dirname, '../dist/index.js');
  const appDir = path.resolve(__dirname, 'fixtures', 'node');
  const bulkConfigPath = path.resolve(appDir, '.ts-bulk-suppressions.json');

  afterEach(() => {
    if (existsSync(bulkConfigPath)) rmSync(bulkConfigPath);
  });

  it('removes stale suppressors while keeping valid ones', () => {
    execSync(`node ${toolScriptPath} init`, { cwd: appDir });
    execSync(`node ${toolScriptPath} suppress`, { cwd: appDir });
    const before = JSON.parse(readFileSync(bulkConfigPath, 'utf-8'));
    const originalCount = before.bulkSuppressors.length;

    before.bulkSuppressors.push({
      filename: 'nonexistent.ts',
      scopeId: '.fake',
      code: 9999
    });
    writeJSONSync(bulkConfigPath, before, { spaces: 2 });

    execSync(`node ${toolScriptPath} update --ignore-external-error`, { cwd: appDir });
    const after = JSON.parse(readFileSync(bulkConfigPath, 'utf-8'));

    expect(after.bulkSuppressors.length).toBe(originalCount);
    expect(
      after.bulkSuppressors.find((s: BulkSuppressor) => s.filename === 'nonexistent.ts')
    ).toBeUndefined();
  });

  it('check passes after update', () => {
    execSync(`node ${toolScriptPath} init`, { cwd: appDir });
    execSync(`node ${toolScriptPath} suppress`, { cwd: appDir });
    execSync(`node ${toolScriptPath} update --ignore-external-error`, { cwd: appDir });
    execSync(`node ${toolScriptPath} check --ignore-external-error`, { cwd: appDir });
  });
});
