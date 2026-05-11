/**
 * `rk init` command — initialize a new project from a template.
 *
 * Prompts for project name, validates the target directory, runs the
 * init pipeline inside a spinner, writes rack.json, then best-effort
 * installs dependencies and initializes git. Install/git failures
 * surface as warnings rather than fatal errors. All presentation
 * lives in {@link ./display.ts}.
 */

import path from 'node:path'
import { git } from '../../git.js'
import { pkg } from '../../pkg.js'
import { Command } from 'commander'
import { initHelpText } from './help.js'
import { initProject } from './pipeline.js'
import { rackJson } from '../../rack-json.js'
import { Logger } from '../../infra/logger.js'
import { Prompter } from '../../infra/prompts.js'
import { writeJSON, pathExists } from '../../infra/fs.js'
import { AppError, getErrorMessage } from '../../utils/errors.js'
import { isPreset, parseNamespace } from '../../registry/identifier.js'
import {
  displayCIMode,
  displayResults,
  displayProjectInfo,
  displayManifestGenerated
} from './display.js'

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Options passed to the init command action.
 */
interface InitCommandOptions {
  /** CI mode (non-interactive). */
  ci?: boolean
  /** Project name. */
  name?: string
  /**
   * Allow init into an existing target directory. The directory is **not**
   * cleaned — pre-existing files survive untouched unless a registry
   * file declares the same `target` and a merge strategy rewrites it.
   */
  force?: boolean
  /** Template to use (e.g., '@presets/tutorial-project'). */
  template: string
  /** Skip git repository initialization. */
  skipGit?: boolean
  /** Skip dependency installation. */
  skipInstall?: boolean
}

// ─── Command ────────────────────────────────────────────────────────────────

/**
 * Register the init command with Commander.js.
 *
 * @param program - Commander program instance
 */
export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize a new project with a preset template')
    .requiredOption('-t, --template <template>', 'Template to use')
    .option('-n, --name <name>', 'Project name')
    .option('--ci', 'Run in CI mode (non-interactive)', false)
    .option(
      '-f, --force',
      'Allow init into an existing target directory (no cleanup; pre-existing files are preserved unless a registry rewrites them)',
      false
    )
    .option('--skip-install', 'Skip dependency installation', false)
    .option('--skip-git', 'Skip git repository initialization', false)
    .addHelpText('after', initHelpText)
    .action(async (options: InitCommandOptions) => {
      const logger = new Logger()
      const prompter = new Prompter()

      try {
        const { template, ci, force = false, skipInstall, skipGit } = options
        const cwd = process.cwd()

        if (ci) displayCIMode(logger)

        // CI mode is non-interactive, so we cannot prompt for the project
        // name. Failing fast here prevents CI scripts from silently falling
        // back to `my-project` when `-n` is forgotten.
        if (ci && !options.name) {
          throw new AppError(
            'VALIDATION_ERROR',
            'CI mode requires --name <project-name>; prompts are disabled with --ci.'
          )
        }

        const projectName = options.name ?? (await promptProjectName(prompter))
        const targetDir = path.resolve(cwd, projectName)

        displayProjectInfo({ projectName, template, targetDir }, logger)

        await validateTargetDir(targetDir, cwd, force)

        // The `:js`/`:ts` suffix on a single-registry template is the
        // user's explicit project-language choice — capture it here so
        // (a) the pipeline propagates it to transitive deps and (b)
        // it's persisted to rack.json so subsequent `rk add` inherits.
        // Presets reject suffixes (see registry/client.ts fetchPreset),
        // so for preset templates this stays undefined; opting in for
        // presets is a separate schema change.
        const templateLanguage = isPreset(template)
          ? undefined
          : parseNamespace(template).language

        const pipelineResult = await prompter.withSpinner(
          logger,
          'Running initialization pipeline...',
          () => initProject({ template, targetDir }, templateLanguage, logger)
        )

        const manifest = rackJson.generate({
          template,
          language: templateLanguage,
          items: pipelineResult.appliedRegistries,
          name: projectName || path.basename(targetDir)
        })
        await writeJSON(path.join(targetDir, 'rack.json'), manifest)

        displayManifestGenerated(logger)

        const warnings: string[] = []
        if (!ci && !skipInstall) await tryInstall(targetDir, warnings)
        if (!ci && !skipGit) await tryGitInit(targetDir, warnings)

        displayResults({ pipelineResult, warnings }, logger)
      } catch (error) {
        logger.commandError('Init', error)
        process.exit(1)
      }
    })
}

// ─── Internal ───────────────────────────────────────────────────────────────

/**
 * Prompt the user for a project name, falling back to `my-project`
 * if the prompt is cancelled.
 *
 * @param prompter - Prompter instance
 * @returns Project name (never empty)
 */
async function promptProjectName(prompter: Prompter): Promise<string> {
  const fallback = 'my-project'
  return (
    (await prompter.text({ message: 'Project name:', initial: fallback })) ??
    fallback
  )
}

/**
 * Reject pre-existing target directories unless `force` is set.
 *
 * `--force` only *allows* init into an existing directory — it does not
 * clean it. Pre-existing files survive untouched; conflicts are resolved
 * per-file by the registry's merge strategy (overwrite, json-merge, etc.)
 * during the apply phase.
 *
 * Skips the check when `targetDir === cwd` (init in current directory).
 *
 * @param targetDir - Resolved absolute target directory
 * @param cwd - Current working directory
 * @param force - Whether to allow merging into an existing directory
 * @throws {AppError} With code `VALIDATION_ERROR` if the directory exists and `force` is false
 */
async function validateTargetDir(
  targetDir: string,
  cwd: string,
  force: boolean
): Promise<void> {
  if (targetDir === cwd) return
  if ((await pathExists(targetDir)) && !force) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Target directory already exists: ${targetDir}. Use --force to merge into it (pre-existing files are preserved unless a registry rewrites them).`
    )
  }
}

/**
 * Best-effort `npm install`; failures become warnings instead of throwing.
 *
 * @param targetDir - Project directory
 * @param warnings - Collector for warning messages
 */
async function tryInstall(
  targetDir: string,
  warnings: string[]
): Promise<void> {
  try {
    await pkg.install(targetDir)
  } catch (error) {
    warnings.push(
      `Failed to install dependencies: ${getErrorMessage(error)}. Run 'npm install' manually.`
    )
  }
}

/**
 * Best-effort `git init`; failures become warnings instead of throwing.
 *
 * @param targetDir - Project directory
 * @param warnings - Collector for warning messages
 */
async function tryGitInit(
  targetDir: string,
  warnings: string[]
): Promise<void> {
  try {
    await git.init(targetDir)
  } catch (error) {
    warnings.push(
      `Failed to initialize git: ${getErrorMessage(error)}. Run 'git init' manually.`
    )
  }
}
