# CLI architecture

## Layered architecture

```text
┌────────────────────────────────┐
│                                │
│          process.argv          │
│                                │
└────────────────┬───────────────┘
                 │
                 │
                 │
                 │
                 ▼
┌────────────────────────────────┐
│                                │
│                                │
│             bin.ts             │
│      fatal-error boundary      │
│                                │
└────────────────┬───────────────┘
                 │
                 │
                 │
                 │
                 ▼
┌────────────────────────────────┐
│                                │
│                                │
│             cli.ts             │
│   Commander program assembly   │
│                                │
└────────────────┬───────────────┘
                 │
                 │
                 │
                 │
                 ▼
┌────────────────────────────────┐
│                                │
│                                │
│           commands/            │
│         Command layer          │
│                                │
└────────────────┬───────────────┘
                 │
                 │
                 │
                 │
                 ▼
┌────────────────────────────────┐
│                                │
│                                │
│           pipeline/            │
│        Install pipeline        │
│                                │
└────────────────┬───────────────┘
                 │
                 │
                 │
                 │
                 ▼
┌────────────────────────────────┐
│                                │
│                                │
│           registry/            │
│         Remote client          │
│                                │
└────────────────┬───────────────┘
                 │
                 │
                 │
                 │
                 ▼
┌────────────────────────────────┐
│                                │
│                                │
│ rackrc / rack-json / git / pkg │
│       Standalone modules       │
│                                │
└────────────────┬───────────────┘
                 │
                 │
                 │
                 │
                 ▼
┌────────────────────────────────┐
│                                │
│                                │
│             infra/             │
│   fs, http, logger, prompts    │
│                                │
└────────────────┬───────────────┘
                 │
                 │
                 │
                 │
                 ▼
┌────────────────────────────────┐
│                                │
│                                │
│             utils/             │
│        errors, version         │
│                                │
└────────────────────────────────┘
```

Three rules:

- **Commands hold no pipeline logic** — they parse flags, call a pipeline function, hand the result to a `display.ts` module. Each command owns its own display helpers.
- **Pipeline phases are stateless functions** — explicit `(items, targetDir, language, logger)` parameters, no shared context object. They import `registry.*` directly rather than receiving it as a parameter.
- **Standalone modules use namespace exports** — `rackrc.*`, `rackJson.*`, `git.*`, `pkg.*`, `registry.*`. Consumers call `rackrc.load()`, never `new ConfigService()`.

## Module dependency graph

```text
┌──────────┐
│          │
│   bin    │
│          │
└─────┬────┘
      │
      │
      │
      │
      ▼
┌──────────┐
│          │
│   cli    │
│          │
└──────────┘
      │
      │
      ├───────────────┬──────────────┬───────────────┬──────────────┬──────────────┐
      │               │              │               │              │              │
      ▼               ▼              ▼               ▼              ▼              ▼
┌──────────┐     ┌────────┐     ┌─────────┐     ┌────────┐     ┌────────┐     ┌─────────┐
│          │     │        │     │         │     │        │     │        │     │         │
│   init   │     │  add   │     │   list  │     │ config │     │ doctor │     │ version │
│          │     │        │     │         │     │        │     │        │     │         │
└─────┬────┘     └────┬───┘     └────┬────┘     └────┬───┘     └────┬───┘     └─────────┘
      │               │              │               │              │
      │               │              │               │              │
      ├───────┬───────┴──────────────┼───────────────┼──────┬───────┤
      │       │       │              │               │      │       │
      ▼       │       ▼              ▼               ▼      │       ▼
┌──────────┐  │  ┌────────┐     ┌─────────┐     ┌────────┐  │  ┌────────┐
│          │  │  │        │     │         │     │        │  │  │        │
│ pipeline │  │  │ rackrc │     │ pkg/git │     │ infra  │  │  │ checks │
│          │  │  │        │     │         │     │        │  │  │        │
└─────┬────┘  │  └────────┘     └─────────┘     └────────┘  │  └────┬───┘
      │       │                                             │       │
      │       │                                             │       │
      │       │                                             └───────┘
      │       │
      ▼       │
┌──────────┐  │
│          │  │
│ registry │  │
│          │  │
└─────┬────┘  │
      │       │
      │       │
      ├───────┘
      │
      ▼
┌──────────┐
│          │
│  utils   │
│          │
└──────────┘
```

No global singletons except the `HttpClient` instance inside `registry/client.ts`. `Logger` and `Prompter` are instantiated per command in the action callback so tests can inject mocks by mocking the constructor.

## Command lifecycle

Every command's `action` follows the same shape:

```text
┌────────────────────────────────────┐
│                                    │
│                                    │
│             new Logger             │
│            new Prompter            │
│                                    │
└──────────────────┬─────────────────┘
                   │
                   │
                   │
                   │
                   ▼
◇────────────────────────────────────◇
│                                    │
│                try                 │
│                                    │
◇────────────────────────────────────◇
                   │
                   │
                   ├──────────────────────────────────┐
                   │                                  │
                   ▼                                  ▼
┌────────────────────────────────────┐     ┌─────────────────────┐
│                                    │     │                     │
│                                    │     │        catch        │
│           display header           │     │ logger.commandError │
│                                    │     │    process.exit 1   │
│                                    │     │                     │
└──────────────────┬─────────────────┘     └─────────────────────┘
                   │
                   │
                   │
                   │
                   ▼
┌────────────────────────────────────┐
│                                    │
│                                    │
│             pre-checks             │
│       rack.json / namespace        │
│                                    │
└──────────────────┬─────────────────┘
                   │
                   │
                   │
                   │
                   ▼
┌────────────────────────────────────┐
│                                    │
│                                    │
│            withSpinner             │
│            run pipeline            │
│                                    │
└──────────────────┬─────────────────┘
                   │
                   │
                   │
                   │
                   ▼
┌────────────────────────────────────┐
│                                    │
│                                    │
│        persist side-effects        │
│ rack.json / npm install / git init │
│                                    │
└──────────────────┬─────────────────┘
                   │
                   │
                   │
                   │
                   ▼
┌────────────────────────────────────┐
│                                    │
│          display results           │
│                                    │
└────────────────────────────────────┘
```

A single `try` spans the entire action body. Any thrown `AppError` (or plain `Error`) surfaces through `logger.commandError(command, error)`. For `AppError`, output includes the machine-readable code and (when registered in `utils/error-hints.ts`) an actionable hint line:

```text
✗ {Command} command [CODE]: {message}
  Hint: {actionable next step — e.g., "Run 'rk config set ...'"}
```

Plain `Error` falls back to `✗ {Command} command: {message}` with no code/hint block. The `[CODE]` prefix is what AI agents grep for; the `Hint:` line maps each code to a concrete next command.

## Install pipeline

`rk init` and `rk add` share the same phases but enter them differently. `init` uses `commands/init/pipeline.ts` (`initProject`), `add` uses `commands/add/pipeline.ts` (`addRegistry`).

```text
┌────────────────────────────────────┐
│                                    │
│            fetch roots             │
│        init: fetchTemplate         │
│      add: registry.fetchItem       │
│                                    │
└──────────────────┬─────────────────┘
                   │
                   │
                   │
                   │
                   ▼
┌────────────────────────────────────┐
│                                    │
│                                    │
│    resolveRegistryDependencies     │
│        BFS via Map iterator        │
│                                    │
└──────────────────┬─────────────────┘
                   │
                   │
                   │
                   │
                   ▼
┌────────────────────────────────────┐
│                                    │
│                                    │
│        validateNoConflicts         │
│     add: also checks installed     │
│                                    │
└──────────────────┬─────────────────┘
                   │
                   │
                   │
                   │
                   ▼
┌────────────────────────────────────┐
│                                    │
│                                    │
│             sortItems              │
│       topological + priority       │
│                                    │
└──────────────────┬─────────────────┘
                   │
                   │
                   │
                   │
                   ▼
┌────────────────────────────────────┐
│                                    │
│                                    │
│             applyFiles             │
│   fetch + merge + write + chmod    │
│                                    │
└──────────────────┬─────────────────┘
                   │
                   │
                   │
                   │
                   ▼
┌────────────────────────────────────┐
│                                    │
│                                    │
│ resolveDependencies + logConflicts │
│    same / compatible / priority    │
│                                    │
└──────────────────┬─────────────────┘
                   │
                   │
                   │
                   │
                   ▼
┌────────────────────────────────────┐
│                                    │
│                                    │
│             pkg.update             │
│      merge into package.json       │
│                                    │
└──────────────────┬─────────────────┘
                   │
                   │
                   │
                   │
                   ▼
┌────────────────────────────────────┐
│                                    │
│           PipelineResult           │
│                                    │
└────────────────────────────────────┘
```

Each phase is a pure function whose inputs and outputs are immutable records — no shared mutable context. Any throw propagates as `AppError` → command `try/catch` → `exit(1)`. See `src/lib/pipeline/` for each phase's source.

## Registry client

Module-scoped HTTP singleton, namespace-exported API.

```text
┌──────────────────────┐
│                      │
│  registry namespace  │
│                      │
└──────────────────────┘
            │
            │
            ├─────────────────────────────┬─────────────────────────┬─────────────────────┬───────────────────────┐
            │                             │                         │                     │                       │
            ▼                             ▼                         ▼                     ▼                       ▼
┌──────────────────────┐     ┌─────────────────────────┐     ┌─────────────┐     ┌─────────────────┐     ┌────────────────┐
│                      │     │                         │     │             │     │                 │     │                │
│                      │     │                         │     │             │     │                 │     │                │
│      fetchItem       │     │        fetchItems       │     │ fetchPreset │     │ fetchBinaryFile │     │ fetchFile text │
│                      │     │ parallel, skip failures │     │             │     │                 │     │                │
│                      │     │                         │     │             │     │                 │     │                │
└───────────┬──────────┘     └────────────┬────────────┘     └──────┬──────┘     └────────┬────────┘     └────────┬───────┘
            │                             │                         │                     │                       │
            │                             │                         │                     │                       │
            ├─────────────────────────────┴─────────────────────────┴─────────────────────┴───────────────────────┘
            │
            ▼
┌──────────────────────┐
│                      │
│    parseNamespace    │
│  rackrc.getRegistry  │
│ http.get / getBuffer │
│                      │
└──────────────────────┘
```

- `parseNamespace` accepts `@ns/path@version:language`; unprefixed names fall back to `DEFAULT_NAMESPACE`
- `rackrc.getRegistry(ns)` returns a `ResolvedRegistry` with URL + optional Bearer header
- 404 responses are translated to `RegistryNotFoundError` (for items/presets) or `Template file not found` (for files)
- `fetchItem` applies language overrides via `lodash.merge` from `item.languages[lang]`, and fills `registryUrl` with `item.version` when the identifier is unversioned
- `fetchItems` uses `Promise.allSettled` + `logger.warn` so a single missing installed registry doesn't break the `add` flow

Validation of fetched payloads is currently a two-line check (`name && version && type` for items; `Array.isArray(registries)` for presets). Full JSON Schema validation is out of scope.

## Merge engine

```text
┌────────────────────────────────┐
│                                │
│          merge params          │
│                                │
└────────────────┬───────────────┘
                 │
                 │
                 │
                 │
                 ▼
┌────────────────────────────────┐
│                                │
│                                │
│        resolveStrategy         │
│ filename or file.mergeStrategy │
│                                │
└────────────────┬───────────────┘
                 │
                 │
                 │
                 │
                 ▼
◇────────────────────────────────◇
│                                │
│            custom?             ├──────────────┐
│                                │              │
◇────────────────┬───────────────◇             no
                 │                              │
                yes                             │
                 │                              │
                 │                              │
                 ▼                              ▼
┌────────────────────────────────┐     ┌────────────────┐
│                                │     │                │
│         executePlugin          │     │                │
│   download or validate local   │     │  mergeBuiltin  │
│          ESM then CJS          │     │ dispatch table │
│                                │     │                │
└────────────────────────────────┘     └────────────────┘
                                                │
                                                │
                 ┌──────────────────────────────┼───────────────────────────┬─────────────────────────────┐
                 │                              │                           │                             │
                 ▼                              ▼                           ▼                             ▼
┌────────────────────────────────┐     ┌────────────────┐     ┌───────────────────────────┐     ┌──────────────────┐
│                                │     │                │     │                           │     │                  │
│                                │     │                │     │                           │     │                  │
│           jsonMerge            │     │  ignoreMerge   │     │          envMerge         │     │  overwriteMerge  │
│  lodash deepMerge + unionWith  │     │   line dedup   │     │ key-level update + append │     │ verbatim replace │
│                                │     │                │     │                           │     │                  │
└────────────────────────────────┘     └────────────────┘     └───────────────────────────┘     └──────────────────┘
```

Custom plugins are JavaScript files (ESM first, CommonJS fallback) with a `merge(params, helpers)` export. Remote plugins are downloaded into `os.tmpdir()`; local plugins are resolved relative to the registry's root URL and rejected if they escape it via `../`.

## Dependency resolution

Two separate resolution steps, deliberately named to disambiguate:

| Module                    | Question answered                                         |
| ------------------------- | --------------------------------------------------------- |
| `resolve-dependencies.ts` | Which registries are pulled in transitively?              |
| `resolve-versions.ts`     | Which npm version wins when multiple registries disagree? |

### Registry tree (BFS)

```text
┌────────────────────────────────────┐
│                                    │
│  resolved = Map of initial items   │
│                                    │
└──────────────────┬─────────────────┘
                   │
                   │
                   ├────────────────────┐
                   │                    │
                   ▼                    │
┌────────────────────────────────────┐  │
│                                    │  │
│                                    │  │
│    for item of resolved.values     │  │
│ Map iterator auto-sees new entries │  │
│                                    │  │
└──────────────────┬─────────────────┘  │
                   │                    │
                   │                    │
                   │                    │
                   │                    │
                   ▼                    │
◇────────────────────────────────────◇  │
│                                    │  │
│           for each depId           ├──┼─────────────────────┐
│                                    │  │                     │
◇──────────────────┬─────────────────◇  │               not resolved
                   │                    │                     │
             resolved.has               │                     │
                   │                    │                     │
                   │                    │                     │
                   ▼                    │                     ▼
┌────────────────────────────────────┐  │  ┌─────────────────────────────────────┐
│                                    │  │  │                                     │
│              continue              │  │  │ resolved.set depId, await fetchItem │
│                                    │  │  │                                     │
└──────────────────┬─────────────────┘  │  └──────────────────┬──────────────────┘
                   │                    │                     │
                   └────────────────────┴─────────────────────┘
```

No explicit queue or stack: mutating the Map from inside the iterator is the queue.

### Sort

```text
┌──────────────────────────────────────┐
│                                      │
│                                      │
│         computeLevels items          │
│ DFS; throws CircularDependencyError  │
│                                      │
└───────────────────┬──────────────────┘
                    │
                    │
                    │
                    │
                    ▼
┌──────────────────────────────────────┐
│                                      │
│ sort by levelDiff, then priorityDiff │
│     level 0 with no deps at top      │
│  within a level: priority ascending  │
│                                      │
└──────────────────────────────────────┘
```

Priority is carried on each `RegistryItem` (1 runtime → 2 framework → 3 build → 4 feature → 5 testing → 6 quality). Dependency order always wins over priority.

### npm version conflicts

```text
┌───────────────────────────┐
│                           │
│                           │
│      collectVersions      │
│ pkg to VersionEntry array │
│                           │
└─────────────┬─────────────┘
              │
              │
              │
              │
              ▼
◇───────────────────────────◇
│                           │
│         all equal?        ├──────────────────────┐
│                           │                      │
◇─────────────┬─────────────◇                     no
              │                                    │
             yes                                   │
              │                                    │
              │                                    │
              ▼                                    ▼
┌───────────────────────────┐     ┌─────────────────────────────────┐
│                           │     │                                 │
│                           │     │                                 │
│       strategy: same      │     │      findCompatibleVersion      │
│        no conflict        │     │ max-min candidate satisfies all │
│                           │     │                                 │
└───────────────────────────┘     └────────────────┬────────────────┘
                                                   │
                                                   │
                                                   │
                                                   │
                                                   │
◇───────────────────────────◇                      │
│                           │                      │
│           found?          ├◄─────────────────────┤
│                           │                      │
◇─────────────┬─────────────◇                     no
              │                                    │
             yes                                   │
              │                                    │
              │                                    │
              ▼                                    ▼
┌───────────────────────────┐     ┌─────────────────────────────────┐
│                           │     │                                 │
│                           │     │                                 │
│    strategy: compatible   │     │       minBy priority wins       │
│                           │     │        strategy: priority       │
│                           │     │                                 │
└───────────────────────────┘     └─────────────────────────────────┘
```

Conflicts (non-`same` strategy) are logged via `logConflicts()` at warn level + one debug line per package.

## Error model

All errors derive from `AppError` and carry a machine-readable `code`.

```text
┌───────────┐
│           │
│  AppError │
│           │
└───────────┘
      │
      │
      ├───────────────────┬────────────────────────┬─────────────────────────────┬─────────────────────────┬──────────────────────────┬─────────────────────────┬───────────────────┬────────────────────┐
      │                   │                        │                             │                         │                          │                         │                   │                    │
      ▼                   ▼                        ▼                             ▼                         ▼                          ▼                         ▼                   ▼                    ▼
┌───────────┐     ┌──────────────┐     ┌───────────────────────┐     ┌───────────────────────┐     ┌───────────────┐     ┌─────────────────────────┐     ┌────────────┐     ┌───────────────┐     ┌─────────────┐
│           │     │              │     │                       │     │                       │     │               │     │                         │     │            │     │               │     │             │
│ HttpError │     │ TimeoutError │     │ InvalidNamespaceError │     │ RegistryNotFoundError │     │ ConflictError │     │ CircularDependencyError │     │ MergeError │     │ RackJsonError │     │ ConfigError │
│           │     │              │     │                       │     │                       │     │               │     │                         │     │            │     │               │     │             │
└───────────┘     └──────────────┘     └───────────────────────┘     └───────────────────────┘     └───────────────┘     └─────────────────────────┘     └────────────┘     └───────────────┘     └─────────────┘
```

Error hygiene:

- **No `success: boolean` flags in pipeline results** — failure is signalled by thrown `AppError`, not a return-value convention
- **Single catch at the command boundary** — `logger.commandError(command, error)` formats and `process.exit(1)`
- **Wrap internal I/O failures narrowly** — e.g. `rackJson.update` wraps only the `writeJSON` call in try/catch, not the preceding `read()`

## Configuration sources

| Source                         | Contents                                          | How to change                |
| ------------------------------ | ------------------------------------------------- | ---------------------------- |
| Compile-time `constants.ts`    | `DEFAULT_NAMESPACE`, `DEFAULT_REGISTRY_URL`       | Edit and rebuild; fork point |
| Global `~/.rackrc`             | Registry URLs, tokens, custom headers             | `rk config set/remove`       |
| Per-project `rack.json`        | Project name, language, template, installed items | `rk init` / `rk add`         |
| `engines.node` in package.json | Minimum Node.js required (checked by `rk doctor`) | Edit `package.json`          |

No environment variables are read by the CLI itself — all runtime behaviour flows through the three files above.

## Testing

```
tests/
├── bin.test.ts, cli.test.ts, constants.test.ts
├── helpers/                # tmp dir factory + mock logger/prompter/registry item
└── lib/
    ├── infra/              # fs, http, logger, prompts
    ├── utils/              # errors, error-hints, version
    ├── rackrc.test.ts  rack-json.test.ts  git.test.ts  pkg.test.ts
    ├── registry/           # client, identifier
    ├── pipeline/           # apply, conflict, resolve-*, sort
    ├── pipeline/merge/     # index, strategies, plugin-loader
    └── commands/           # add/*, init/*, list/*, config/*, doctor/*, version
                            # + help.test.ts (asserts --help output per command)
```

- **HTTP**: `axios-mock-adapter` wired onto the client's internal axios instance. Retry-path tests use `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()` to avoid real 6 s backoff waits.
- **Filesystem**: real temp dir per test (`makeTmpDir`) plus real `fs/promises`; no fs mocking.
- **Prompter / command constructors**: `vi.hoisted()` + `class { method = mocks.fn }` pattern so `new Prompter()` inside the command returns a stub with persistent references across tests.
- **Coverage gate**: `vitest.config.ts` enforces `src/**/*.ts` at 100 % lines/functions/branches/statements.
