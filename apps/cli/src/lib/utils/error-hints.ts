/**
 * Maps {@link AppError} codes to actionable next-step hints.
 *
 * Hints are appended to user-facing error output so both humans
 * and AI agents know which command or file to touch next.
 *
 * Keep hints:
 *   - imperative (start with a verb)
 *   - concrete (name the command or file)
 *   - short (one or two lines)
 */

export const ERROR_HINTS: Record<string, string> = {
  REGISTRY_NOT_FOUND:
    "Run 'rk config set <namespace> --url <url>' to configure the namespace, " +
    'or check the identifier spelling.',
  INVALID_NAMESPACE:
    "See 'rk --help' for the identifier syntax " +
    '(@<namespace>/<path>[@<version>]).',
  CONFLICT:
    'Inspect rack.json to see installed registries; ' +
    'remove the conflicting entry before retrying.',
  CIRCULAR_DEPENDENCY:
    'A registry depends on itself transitively. ' +
    'Fix registryDependencies in the offending registry.json.',
  RACK_JSON_ERROR:
    "If missing: run 'rk init' first. " +
    "If corrupt: inspect rack.json or delete and re-run 'rk init'.",
  CONFIG_ERROR:
    "Run 'rk config list' to inspect, or delete ~/.rackrc to reset.",
  HTTP_ERROR: "Run 'rk doctor --json' to check registry connectivity.",
  TIMEOUT:
    "Run 'rk doctor --json' to check registry connectivity; " +
    'retry if transient.',
  MERGE_FAILED:
    'Inspect the target file for syntax errors, ' +
    'or remove it and re-run to regenerate.',
  PATH_TRAVERSAL:
    'Check files[].target in the registry — it must be a relative path ' +
    'within the project directory (no ".." or absolute paths).',
  PACKAGE_JSON_INVALID:
    'Open package.json and fix the JSON syntax (or remove the file ' +
    'so a fresh one will be created), then re-run.',
  FILE_FETCH_FAILED:
    "Run 'rk doctor --json' to confirm the registry is reachable, " +
    'then retry. The pipeline aborted before any project files were ' +
    'written to keep your project consistent.',
  VALIDATION_ERROR: "See 'rk <command> --help' for valid options.",
  VERSION_MISMATCH:
    'Rack does not yet support upgrading installed registries to a ' +
    'different version. To switch versions, remove the existing entry ' +
    'from rack.json.items (and clean up the files it scaffolded), then ' +
    "re-run 'rk add' with the desired version."
}

/**
 * Look up the hint for an error code.
 *
 * @param code - Error code from {@link AppError.code}
 * @returns Hint string, or `undefined` if no hint is registered
 */
export function getErrorHint(code: string): string | undefined {
  return ERROR_HINTS[code]
}
