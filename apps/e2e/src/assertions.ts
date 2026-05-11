import path from 'node:path'
import { access, readFile } from 'node:fs/promises'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Optional per-material smoke test contract.
 *
 * Lives at `{material-dir}/smoke.json`. All fields are optional — callers
 * run only the sub-checks that are declared.
 */
export interface Smoke {
  files?: {
    /** Project-relative paths that must exist on disk. */
    exist?: string[]
    /** Project-relative paths that must NOT exist on disk. */
    absent?: string[]
  }
  /** Per-file JSON invariants keyed by the JSON file's project-relative path. */
  json?: Record<string, Record<string, SmokeMatcher>>
  /** Per-file plain-text invariants for non-JSON files (shell, config, source). */
  text?: Record<string, SmokeTextChecks>
}

/**
 * Plain-text assertions applied against a file's UTF-8 content.
 *
 * - `contains` — each entry must appear as a substring
 * - `matches` — each entry (compiled as RegExp) must match at least once
 */
export interface SmokeTextChecks {
  contains?: string[]
  matches?: string[]
}

/**
 * Value matcher for smoke assertions.
 *
 * - Primitive / array / plain object → deep-equal check
 * - `{ exists: true }` → the dot-path resolves to a non-undefined value
 * - `{ contains: string }` → string-includes (strings) or array-includes (arrays)
 * - `{ matches: string }` → regex test against a string value
 */
export type SmokeMatcher =
  | { exists: true }
  | { contains: string }
  | { matches: string }
  | string
  | number
  | boolean
  | null
  | unknown[]
  | Record<string, unknown>

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Load an optional `smoke.json` next to a registry's manifest.
 *
 * @param smokeJsonPath - Absolute path to the candidate smoke.json
 * @returns Parsed smoke contract, or `null` if the file is absent
 */
export async function loadSmoke(smokeJsonPath: string): Promise<Smoke | null> {
  if (!(await exists(smokeJsonPath))) return null
  const raw = await readFile(smokeJsonPath, 'utf8')
  return JSON.parse(raw) as Smoke
}

/**
 * Apply a smoke contract against a project directory.
 *
 * Runs four sections in order; aborts on the first failing check so callers
 * see the earliest violation:
 *
 *   1. `files.exist`  — each path must exist
 *   2. `files.absent` — each path must NOT exist
 *   3. `json`         — each JSON file, dot-path → matcher
 *   4. `text`         — each file, substring / regex checks
 *
 * Missing sections are skipped; a smoke with only `json` runs only step 3.
 *
 * @param smoke      - Parsed smoke contract
 * @param projectDir - Absolute path to the installed project root
 * @param label      - Short label used in error messages (usually registry id)
 * @throws {Error} On the first failing assertion, with a message that
 *   identifies the material, file, and (for JSON) dot-path.
 *
 * @example
 * ```ts
 * const smoke = await loadSmoke('/.../@rack/build/typescript/1.0.0/smoke.json')
 * if (smoke) await applySmoke(smoke, '/tmp/work', '@rack/build/typescript')
 * ```
 */
export async function applySmoke(
  smoke: Smoke,
  projectDir: string,
  label: string
): Promise<void> {
  for (const rel of smoke.files?.exist ?? []) {
    if (!(await exists(path.join(projectDir, rel)))) {
      throw new Error(`[${label}] expected file to exist: ${rel}`)
    }
  }

  for (const rel of smoke.files?.absent ?? []) {
    if (await exists(path.join(projectDir, rel))) {
      throw new Error(`[${label}] expected file to be absent: ${rel}`)
    }
  }

  for (const [file, checks] of Object.entries(smoke.json ?? {})) {
    const raw = await readFile(path.join(projectDir, file), 'utf8')
    const parsed = JSON.parse(raw) as unknown

    for (const [dotPath, matcher] of Object.entries(checks)) {
      const actual = resolvePath(parsed, dotPath)
      assertMatcher(matcher, actual, `${label} ${file}:${dotPath}`)
    }
  }

  for (const [file, checks] of Object.entries(smoke.text ?? {})) {
    const content = await readFile(path.join(projectDir, file), 'utf8')

    for (const needle of checks.contains ?? []) {
      if (!content.includes(needle)) {
        throw new Error(
          `[${label} ${file}] expected content to contain ${JSON.stringify(needle)}`
        )
      }
    }

    for (const pattern of checks.matches ?? []) {
      if (!new RegExp(pattern).test(content)) {
        throw new Error(
          `[${label} ${file}] expected content to match /${pattern}/`
        )
      }
    }
  }
}

// ─── Internal ────────────────────────────────────────────────────────────────

function assertMatcher(
  matcher: SmokeMatcher,
  actual: unknown,
  location: string
): void {
  if (isMatcherObject(matcher, 'exists')) {
    if (actual === undefined) {
      throw new Error(`[${location}] expected path to resolve, got undefined`)
    }
    return
  }

  if (isMatcherObject(matcher, 'contains')) {
    const needle = (matcher as { contains: string }).contains
    if (typeof actual === 'string' && actual.includes(needle)) return
    if (Array.isArray(actual) && actual.includes(needle)) return
    throw new Error(
      `[${location}] expected ${JSON.stringify(actual)} to contain ${JSON.stringify(needle)}`
    )
  }

  if (isMatcherObject(matcher, 'matches')) {
    const pattern = (matcher as { matches: string }).matches
    if (typeof actual === 'string' && new RegExp(pattern).test(actual)) return
    throw new Error(
      `[${location}] expected ${JSON.stringify(actual)} to match /${pattern}/`
    )
  }

  if (!deepEqual(matcher, actual)) {
    throw new Error(
      `[${location}] expected ${JSON.stringify(actual)} to deep-equal ${JSON.stringify(matcher)}`
    )
  }
}

function isMatcherObject(
  matcher: SmokeMatcher,
  key: 'exists' | 'contains' | 'matches'
): boolean {
  return (
    typeof matcher === 'object' &&
    matcher !== null &&
    !Array.isArray(matcher) &&
    key in matcher
  )
}

function resolvePath(root: unknown, dotPath: string): unknown {
  return dotPath
    .split('.')
    .reduce<unknown>((acc, key) => (isRecord(acc) ? acc[key] : undefined), root)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]))
  }
  if (isRecord(a) && isRecord(b)) {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    return (
      keysA.length === keysB.length && keysA.every((k) => deepEqual(a[k], b[k]))
    )
  }
  return false
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}
