import { program } from 'commander';
import type { ProgramOptions, DiagnosticTsc, ProjectStat, BulkConfig } from './types';
import {
  assertDiagnostics,
  createDefaultIgnore,
  createTsBulkSuppress,
  categorizeDiagnostics,
  deduplicateSuppressors,
  getBulkConfig,
  initStatItem,
  getChangedFiles,
  findStaleSuppressors,
  trimStaleSuppressors
} from './tsc-bulk';
import log from 'loglevel';

import ts from 'typescript';

import path from 'path';

import { writeJSONSync, readFileSync } from 'fs-extra';

type CompilerResult = {
  mergedConfig: BulkConfig & ProgramOptions;
  configFromFile: BulkConfig;
  projectRoot: string;
  compilerHost: ts.CompilerHost;
  configRelatedErrors: DiagnosticTsc[];
  projectErrors: DiagnosticTsc[];
  externalErrors: DiagnosticTsc[];
};

function runCompiler(options: ProgramOptions): CompilerResult {
  const { mergedConfig, configFromFile } = getBulkConfig(options);
  //NOTE: Let's assume projectRoot is tsconfig's dir
  const projectRoot = path.dirname(mergedConfig.project);

  let totalDiagnostic: DiagnosticTsc[] = [];

  const configObject = ts.parseConfigFileTextToJson(
    mergedConfig.project,
    readFileSync(mergedConfig.project).toString()
  );

  totalDiagnostic = totalDiagnostic.concat(configObject.error ?? []);

  const configParseResult = ts.parseJsonConfigFileContent(
    configObject.config,
    ts.sys,
    projectRoot,
    undefined,
    mergedConfig.project
  );

  totalDiagnostic = totalDiagnostic.concat(configParseResult.errors);

  const compilerOption: ts.CompilerOptions = {
    ...configParseResult.options,
    noEmit: true,
    emitDeclarationOnly: false
  };

  const compilerHost = ts.createCompilerHost(compilerOption);
  const programOptions = {
    rootNames: configParseResult.fileNames,
    options: compilerOption,
    projectReferences: configParseResult.projectReferences,
    host: compilerHost,
    configFileParsingDiagnostics: ts.getConfigFileParsingDiagnostics(configParseResult)
  };
  const tscProgram = ts.createProgram(programOptions);

  if (mergedConfig.changed) {
    const changedFiles = getChangedFiles(true, true);

    // const targetSources = project.getSourceFiles().filter((source) => changedFiles.includes(source.getFilePath()));
    const targetSources = tscProgram
      .getSourceFiles()
      .filter((source) => changedFiles.includes(source.fileName));
    const diagnostics = targetSources.flatMap((source) => ts.getPreEmitDiagnostics(tscProgram, source));
    totalDiagnostic = totalDiagnostic.concat(diagnostics);
  } else if (mergedConfig.files?.length) {
    const absoluteFilePaths = mergedConfig.files.map((file) => path.resolve(file));
    const targetSources = tscProgram
      .getSourceFiles()
      .filter((source) => absoluteFilePaths.includes(source.fileName));
    const diagnostics = targetSources.flatMap((source) => ts.getPreEmitDiagnostics(tscProgram, source));

    totalDiagnostic = totalDiagnostic.concat(diagnostics);
  } else {
    totalDiagnostic = totalDiagnostic.concat(ts.getPreEmitDiagnostics(tscProgram));
  }

  log.debug(totalDiagnostic);

  const { configRelatedErrors, projectErrors, externalErrors } = categorizeDiagnostics(
    totalDiagnostic,
    projectRoot
  );

  return {
    mergedConfig,
    configFromFile,
    projectRoot,
    compilerHost,
    configRelatedErrors,
    projectErrors,
    externalErrors
  };
}

function main(options: ProgramOptions): void {
  log.setLevel('INFO');
  if (options.verbose) {
    log.setLevel('DEBUG');
  }
  log.debug(process.cwd());
  log.debug(options);

  log.info(`Using TypeScript compiler version ${ts.version}`);

  // Handle deprecated flags
  if (options.createDefault && !options.subcommand) {
    log.warn('Warning: --create-default is deprecated. Use "ts-bulk-suppress init" instead.');
    options.subcommand = 'init';
  }
  if (options.genBulkSuppress && !options.subcommand) {
    log.warn('Warning: --gen-bulk-suppress is deprecated. Use "ts-bulk-suppress suppress" instead.');
    options.subcommand = 'suppress';
  }

  // init does not need compiler
  if (options.subcommand === 'init') {
    log.info(`Create default .ts-bulk-suppressions.json at ${process.cwd()}`);
    createDefaultIgnore();
    return;
  }

  const { mergedConfig, configFromFile, compilerHost, configRelatedErrors, projectErrors, externalErrors } =
    runCompiler(options);

  // suppress: generate suppressors and write
  if (options.subcommand === 'suppress' || options.subcommand === 'update') {
    const suppressors = createTsBulkSuppress(projectErrors, mergedConfig);
    configFromFile.bulkSuppressors = deduplicateSuppressors([
      ...suppressors,
      ...mergedConfig.bulkSuppressors
    ]);
  }

  if (options.subcommand === 'suppress') {
    writeJSONSync(mergedConfig.config || '.ts-bulk-suppressions.json', configFromFile, { spaces: 2 });
    log.info('Project patched with bulk-suppressor');
    process.exit(0);
  }

  // trim, update, check, and default all need assertDiagnostics
  const projectStat: ProjectStat = {
    projectErrors: [],
    configRelatedErrors: [],
    externalErrors: [],
    statItems: initStatItem(configFromFile),
    raw: ''
  };

  const assertExitCode = assertDiagnostics(
    configRelatedErrors,
    projectErrors,
    externalErrors,
    compilerHost,
    mergedConfig,
    projectStat
  );

  // trim / update: remove stale suppressors and write
  if (options.subcommand === 'trim' || options.subcommand === 'update') {
    const stale = findStaleSuppressors(projectStat.statItems);
    if (stale.length) {
      stale.forEach((s) => {
        if (s.type === 'bulk') {
          log.info(`Removing stale bulk suppressor: ${s.filename} ${s.scopeId} TS${s.code}`);
        } else {
          log.info(`Removing stale pattern suppressor: ${s.pathRegExp} [code: ${s.code}]`);
        }
      });
    }
    const trimmedConfig = trimStaleSuppressors(configFromFile, projectStat.statItems);
    writeJSONSync(mergedConfig.config || '.ts-bulk-suppressions.json', trimmedConfig, { spaces: 2 });
    log.info(options.subcommand === 'update' ? 'Suppressions updated' : 'Stale suppressions removed');
    return;
  }

  // check: verify file is in sync
  if (options.subcommand === 'check') {
    if (assertExitCode !== 0) {
      process.exitCode = assertExitCode;
      return;
    }
    const stale = findStaleSuppressors(projectStat.statItems);
    if (stale.length) {
      stale.forEach((s) => {
        if (s.type === 'bulk') {
          log.info(`Stale bulk suppressor: ${s.filename} ${s.scopeId} TS${s.code}`);
        } else {
          log.info(`Stale pattern suppressor: ${s.pathRegExp} [code: ${s.code}]`);
        }
      });
      log.info(`Found ${stale.length} stale suppression(s). Run "ts-bulk-suppress trim" to remove them.`);
      process.exitCode = 3;
    }
    return;
  }

  // Default mode (no subcommand)
  process.exitCode = assertExitCode;

  if (mergedConfig.stat) {
    writeJSONSync(mergedConfig.stat, projectStat, { spaces: 2 });
  }
}

program
  .option('-v, --verbose', 'Display verbose log')
  .option('--config <path>', 'Path to suppressConfig')
  .option('--stat <path>', 'Display suppress stat')
  .option('--strict-scope', 'Error scopeId would be as deep as possible')
  .option('--changed', 'Only check changed files compared with target_branch')
  .option('--create-default', '[deprecated] Use "init" subcommand')
  .option('--gen-bulk-suppress', '[deprecated] Use "suppress" subcommand')
  .option('--ignore-config-error', 'Ignore config-related errors')
  .option('--ignore-external-error', 'Ignore external errors')
  .argument('[files...]', 'Target files');

program
  .command('init')
  .description('Create a default .ts-bulk-suppressions.json file')
  .action(() => {
    const options: ProgramOptions = { ...program.opts(), subcommand: 'init' as const };
    main(options);
  });

program
  .command('suppress')
  .description('Add suppressions for all current TypeScript errors')
  .argument('[files...]', 'Target files')
  .action((files: string[]) => {
    const options: ProgramOptions = { ...program.opts(), subcommand: 'suppress' as const };
    if (files.length) options.files = files;
    main(options);
  });

program
  .command('trim')
  .description('Remove stale suppressions that no longer match any errors')
  .argument('[files...]', 'Target files')
  .action((files: string[]) => {
    const options: ProgramOptions = { ...program.opts(), subcommand: 'trim' as const };
    if (files.length) options.files = files;
    main(options);
  });

program
  .command('update')
  .description('Suppress current errors and remove stale suppressions')
  .argument('[files...]', 'Target files')
  .action((files: string[]) => {
    const options: ProgramOptions = { ...program.opts(), subcommand: 'update' as const };
    if (files.length) options.files = files;
    main(options);
  });

program
  .command('check')
  .description('Verify suppressions file is in sync (exit 3 if stale suppressions exist)')
  .argument('[files...]', 'Target files')
  .action((files: string[]) => {
    const options: ProgramOptions = { ...program.opts(), subcommand: 'check' as const };
    if (files.length) options.files = files;
    main(options);
  });

// Default action (no subcommand)
program.action((files: string[]) => {
  const options: ProgramOptions = program.opts();
  if (files.length) options.files = files;
  main(options);
});

program.parse();
