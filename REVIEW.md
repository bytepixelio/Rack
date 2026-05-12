# Rack 代码审查报告

审查范围：根 `README.md`、各 app 的 `README.md`、`apps/docs/zh` 下中文 Markdown、CLI / registry-server / registry-worker / e2e / shared packages 的 TypeScript 实现、`packages/storage` 示例 registry 与 preset。

验证命令：

- `pnpm test`：通过，7 个任务全部成功。
- `pnpm exec tsc --noEmit --noUnusedLocals --noUnusedParameters`：通过，但根 `tsconfig.json` 的 `include` 为空；追加 `--listFiles` 后无任何源码输出，实际没有检查项目源码。
- `pnpm lint`：通过，但当前实际执行的是各包 `tsc --noEmit`，不是 ESLint。
- `pnpm --filter @rack/docs docs:build`：通过，但根 CI 当前不会执行它。
- `pnpm build`：通过，但当前只实际构建 CLI 和 registry-server，不等于“所有 app 都 build”。

## 背景理解

Rack 是 registry 架构的项目脚手架工具。核心路径是：

1. CLI 通过 `rk init` / `rk add` 拉取 JSON registry 或 preset。
2. CLI 解析 registry 依赖、冲突、优先级、语言变体和文件合并策略。
3. Registry Server 负责读取本地/R2 存储、上传 tar.gz、校验 schema/auth、生成 `versions.json`。
4. Registry Worker 在 Cloudflare R2 上镜像 Server 的只读 API。
5. `packages/registry-core` 和 `packages/auth-core` 承担 Server/Worker 必须保持一致的 URL/storage key/auth 逻辑。

整体结构清晰，Server/Worker 之间已经抽出了不少共享核心；测试覆盖率也很高。下面列的是仍然存在的实现不一致、风险点和可优化处。

## 1. CLI 安装语义

### 1.1 已安装依赖 registry 会被再次应用 ✅ 已解决（commit 90be73e）

位置：

- `apps/cli/src/lib/commands/add/pipeline.ts:76-93`
- `apps/cli/src/lib/pipeline/resolve-dependencies.ts:44-60`

`rk add` 会读取 `installedRegistries`，但只用于冲突检查；解析依赖时没有把已安装项作为“已满足依赖”传入 `resolveRegistryDependencies`。结果是：如果项目已安装 A，再添加依赖 A 的 B，A 仍会被重新 fetch、排序并进入 `applyFiles`。

影响：

- 文档说已安装 registry 会被跳过/幂等，但依赖项层面没有跳过。
- 对 `.gitignore` 这类合并文件影响较小；对 overwrite 策略的代码/配置文件，可能覆盖用户后续手改。
- `rack.json` 最终会去重，所以 manifest 看起来正常，但磁盘内容可能已经被重复应用。

建议：

- 在 `resolveRegistryDependencies` 增加 `satisfiedIdentifiers` 参数，已安装依赖只参与排序/冲突判断，不再进入本次 apply。
- 或者把 installed items fetch 后放入图中标记为 `installed=true`，排序时用于依赖层级，apply 时过滤。

**修复**：走方案 1（`installed` 参数 + canonical 命中跳过）。Conflict 检查不动 —— 仍走独立的 `fetchItems(installedRegistries)`，所以反向冲突仍能被捕获。版本敏感性由 1.3 兜住。

### 1.2 `:js` / `:ts` 显式语言没有传播到依赖解析和项目语言 ✅ 已解决（commit 55db008）

位置：

- `apps/cli/src/lib/commands/add/pipeline.ts:72-77`
- `apps/cli/src/lib/pipeline/resolve-dependencies.ts:52-56`
- `apps/cli/src/lib/commands/init/index.ts:84-95`
- `apps/cli/src/lib/rack-json.ts:90-100`

`registry.fetchItem('@rack/foo:js')` 会让 root registry 使用 JS 变体，但依赖解析仍使用 `rack.json.language` 传入的 `language`。如果项目未设置语言，依赖会走各自 `defaultLanguage`，通常回退到 TS。

`rk init -t some-registry:js` 也只把 `some-registry:js` 写进 `items`，不会写入 `rack.json.language = "js"`。后续 `rk add foo` 会继续按项目语言缺失处理，而不是继承初始项目的 JS 选择。

影响：

- 文档写明优先级为“命令行 `:language` 后缀 > `rack.json.language` > `defaultLanguage` > ts”。对 root item 成立，对 transitive dependencies 和后续 add 不完全成立。
- JS 项目可能混入 TS 依赖/文件。

建议：

- `fetchItem` 返回实际选择的 `resolvedLanguage`，pipeline 将 root 显式语言传给依赖解析。
- `rk init` 如果 template/registry 使用显式 `:js`/`:ts`，或 preset 成员都一致，可考虑写入 `rack.json.language`。
- 如果有意只让后缀作用于单个 registry，需要在中文文档里明确“不会传播到依赖和项目级语言”。

**修复**：`fetchItem` 返回 `resolvedLanguage`（优先级 suffix > options > defaultLanguage > 'ts'），`resolveRegistryDependencies` 用 parent 的 `resolvedLanguage` 拉每个 dep，`applyFiles` 按 item 把 `resolvedLanguage` 透给 merge plugin context。`rk init` 从单 registry template 里抽 `:language` 串到 pipeline，并写入 `rack.json.language`，让后续 `rk add` 自动继承。Preset templates 暂不动 —— `preset.json` 现没有 `language` 字段，需要时单独加 schema。

### 1.3 精确版本与已安装判断只有 namespace/path 维度 ✅ 已解决（commit cb4b964）

位置：

- `apps/cli/src/lib/rack-json.ts:68-78`
- `apps/cli/src/lib/commands/add/index.ts:51-56`

`canonicalizeIdentifier` 会去掉 `@version` 和 `:language`。因此项目已安装 `@rack/foo@1.0.0` 后，用户执行 `rk add @rack/foo@2.0.0` 会被当成已安装而直接跳过。

影响：

- Schema 和文档允许 `items` / `preset.registries` 指定精确版本，但 CLI 没有升级/并存/报错语义。
- 用户以为安装了指定版本，实际命令可能无操作。

建议：

- 明确产品语义：同一 registry 是否允许升级。
- 若不支持升级，遇到同路径不同版本时给出明确错误或提示，而不是显示”already installed”。
- 若支持升级，需要把版本纳入 manifest diff，并定义文件覆盖与依赖重算策略。

**修复**：走”不支持升级”分支 —— `rk add` 早退判定和 `resolveRegistryDependencies` 都加上版本比对，命中 canonical 但版本不同时抛 `VERSION_MISMATCH`（带 hint 指向手动 remove + 重跑）。两端版本都缺省或两端 pin 同一版本时保留原 skip 行为。

**产品决策**：Rack 不支持升级语义。registry 文件 scaffold 进用户源码树后即归用户所有；自动 upgrade 会面临”用户改过的代码如何处理”的根本难题（参考 copier 的 3-way merge 复杂度），与”轻量脚手架”定位不符。需要换版本时由用户手动 remove 旧条目 + 重跑 add。

### 1.4 远程 custom merge 插件实际只支持单文件入口 ✅ 已解决（commit `fa62e0c`）

位置：

- `apps/cli/src/lib/pipeline/merge/plugin-loader.ts:134-147`
- `apps/cli/src/lib/pipeline/merge/plugin-loader.ts:177-190`
- `apps/docs/zh/guide/file-merge.md:415-424`

文档说远程 Registry 的 custom merge 插件会下载到临时目录执行，并支持 ESM/CommonJS。实现只会通过 `registry.fetchFile(registryUrl, scriptPath)` 下载入口脚本，然后写成临时目录里的 `plugin.js` / `plugin.cjs` / `plugin.mjs`。如果远程插件使用相对 import，例如 `import { mergeJson } from './utils.js'`，CLI 不会下载 `utils.js`，模块加载会失败。

另一个小问题是临时目录没有清理；大量安装或失败重试时会持续在系统临时目录留下 `rack-plugin-*` 文件夹。

影响：

- 文档给人的能力边界接近“一个插件模块”，但远程场景实际只能稳定支持“单文件、无相对依赖”的插件。
- 本地 Registry 和远程 Registry 的插件可用性不一致：本地插件可以引用旁边文件，远程插件不行。

建议：

- 如果只想支持单文件插件，文档明确限制：“远程 custom 插件必须是自包含单文件，不能相对 import 其他 Registry 文件”。
- 如果想支持多文件插件，需要定义插件包下载策略，例如下载插件目录、tarball，或把远程插件文件作为 registry files 的一部分并递归解析依赖。
- 执行完成后用 `rm(tempDir, { recursive: true, force: true })` 清理临时目录。

**修复**：走"收文档 + 加清理"分支，不扩多文件插件支持。

- `plugin-loader.ts`：用 `mkdtemp` 替代 `mkdir + Date.now()`，消除时间戳碰撞；`executePlugin` 改成嵌套 `try { try { ... } finally { rm(tempDir) } } catch { wrap }`，无论插件成功或抛错，临时目录都会被清理（嵌套结构避开 catch-always-throws 导致 "catch→finally" 这条不可达分支的覆盖率漏点）。下载 helper 从 `resolveRemotePlugin` 改名为 `downloadRemotePlugin` 并接收 caller-owned tempDir，所有权清晰。
- 文档：zh/en `file-merge.md` 的"插件路径"段把远程场景写明确——**必须是自包含单文件**，CLI 不递归下载相对 import 的依赖（举 `import './utils.js'` 失败的例子），需要共用工具就 inline 进同一脚本；并补一句"临时目录在执行完成后（成功或失败）自动清理"。本地 Registry 不受限制单独说明。
- 测试：新增两条 case 覆盖"成功执行后清理"和"插件抛错后清理"——通过 `readdir(tmpdir())` snapshot `rack-plugin-*` 目录在调用前后做差，验证没有残留。CLI 100% line/branch/function/statement 覆盖率保持。

产品决策：不实现多文件插件支持。registry 已经有 `files[]` 作为多文件分发载体，custom merge 插件保持"单文件、零依赖"约束，避免引入"插件包"这第二种分发形态。

### 1.5 `package.json` 跨多次 add 时可能留下同包双字段依赖 ✅ 已解决（commit `09f3623`）

位置：

- `apps/cli/src/lib/pipeline/resolve-versions.ts:80-108`
- `apps/cli/src/lib/pkg.ts:62-69`

`resolveDependencies` 已经把本次 pipeline 内的 `dependencies` 和 `devDependencies` 合到同一个 per-package map，避免同一个包在同一次安装里同时写入两个字段；但 `pkg.update` 合并到已有 `package.json` 时只是分别 spread：

```ts
current.dependencies = { ...current.dependencies, ...dependencies }
current.devDependencies = { ...current.devDependencies, ...devDependencies }
```

如果项目已有：

```json
{
  "devDependencies": {
    "foo": "^1.0.0"
  }
}
```

后续 `rk add` 的 registry 把 `foo` 解析为 runtime dependency，`pkg.update` 会新增 `dependencies.foo`，但不会删除旧的 `devDependencies.foo`。最终 `package.json` 同包双字段，和 `resolve-versions.ts` 里“最终写入单一字段”的设计目标不一致。

影响：

- 多次增量安装后的 `package.json` 可能和一次性 preset 初始化结果不同。
- 包管理器通常会容忍重复字段，但依赖归类、审计、diff 和后续解析都会变脏。

建议：

- 合并 `dependencies` 前，从 `current.devDependencies` 删除同名包。
- 合并 `devDependencies` 前，如果 `current.dependencies` 已有同名包，默认保留 runtime placement，或至少按同一套“runtime wins”规则处理。
- 增加一个 `pkg.update` 单测覆盖 dev → runtime 和 runtime → dev 的跨调用场景。

**修复**：把"runtime wins"跨字段规则下沉到 `pkg.update` 的写回前一步（落盘前的单一收敛点，唯一同时持有 _current_ 和 _incoming_ 视图的地方；不污染 `resolveDependencies` 的单批次视角）。两段规则：① 合并 incoming `dependencies` 前，把同名包从 `current.devDependencies` 删除（dev → runtime 升级）；② 合并 incoming `devDependencies` 时，如果 `current.dependencies` 已有同名包，把该包的版本写到 `current.dependencies` 而不是回退到 dev（runtime placement 不被 dev 声明降级，同时尊重最新的 conflict-resolution 版本）。两段处理完后清理空对象，避免落盘出现 `"devDependencies": {}`。`apps/cli/tests/lib/pkg.test.ts` 新增 2 条 case 覆盖 dev→runtime 升级和 runtime 保留两条新分支；既有 4 条 case 顺带覆盖空对象清理路径。`pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿，CLI 100% 覆盖率保持。

### 1.6 自动安装依赖固定使用 `npm install` ✅ 已解决（commit 796258c）

位置：

- `apps/cli/src/lib/pkg.ts:79-85`
- `apps/cli/src/lib/commands/init/index.ts:157-166`
- `apps/docs/zh/guide/registry.md:109-112`

`rk init` 在非 CI 且未 `--skip-install` 时会调用 `pkg.install`，实现固定执行 `npm install`。中文文档的安装流程写的是“执行 `npm install` 或 `pnpm install`”，但 CLI 没有检测用户机器/模板/现有 lockfile/packageManager，也没有选项切换包管理器。

影响：

- 如果用户期望 pnpm 项目，初始化会生成 `package-lock.json`，而不是 `pnpm-lock.yaml`。
- 仓库自身和部署文档都以 pnpm 为主，CLI 生成项目却默认 npm，容易造成工具链认知不一致。

建议：

- 明确产品选择：如果 Rack 生成项目只支持 npm，文档改为只写 `npm install`。
- 如果希望支持 pnpm/yarn/bun，增加 `--package-manager` 选项，或按 `packageManager` / lockfile / Corepack 环境检测。
- 失败提示里也应跟随实际选择，而不是固定提示 “Run 'npm install' manually.”

**修复**：走"改文档"分支 —— zh/en `registry.md` 的 Registry 生命周期步骤 5 都改成只写 `npm install`，删掉 "或 `pnpm install`" / "or `pnpm install`"。CLI 实现不动，保持 `pkg.install` 固定执行 `npm install` 的语义。产品决策：Rack 生成项目默认 npm，不做 packageManager / lockfile 检测；未来若要支持 pnpm/yarn 再开 `--package-manager` 选项。

### 1.7 npm 版本兼容解析会返回过宽 range ✅ 已解决（commit `322da6a`）

位置：

- `apps/cli/src/lib/pipeline/resolve-versions.ts:191-232`
- `apps/docs/zh/guide/dependency.md:102-132`

`findCompatibleVersion` 会找所有 range 的最大 `minVersion`，验证这个最小版本满足所有 range 后，直接返回该候选所属的原始 range：

```ts
return ranges.every((r) => semver.satisfies(best.min, r)) ? best.range : null
```

这不能代表 range 交集。例如：

```json
// registry A
{ "dependencies": { "foo": "^1.0.0" } }

// registry B
{ "dependencies": { "foo": "<1.5.0" } }
```

`1.0.0` 同时满足两个 range，所以当前逻辑会认为兼容；但如果最终返回 `^1.0.0`，包管理器仍可能安装 `1.9.0`，违反 registry B 的 `<1.5.0` 约束。

影响：

- 冲突被误判为 compatible，最终写入的 `package.json` range 可能不满足所有 registry 的真实约束。
- 文档里的“版本兼容 → 使用较新版本”语义没有说明会丢失上限约束。

建议：

- 不要返回原始 range；要么计算 range 交集，要么写入一个满足所有约束的更窄版本/range。
- 如果不想实现完整 range intersection，保守策略是：只在一个原始 range 被其它所有 range 完全包含时返回它；否则走 priority 并告警。
- 增加 `^1.0.0` + `<1.5.0`、`>=1.0.0` + `<2.0.0` 这类单测。

**修复**：走"subset + AND-join"组合分支 —— `findCompatibleVersion` 在 max-min 通过兼容性检测之后，先用 `semver.subset` 找一个被所有其它 range 包含的最窄 range（覆盖 `^3.4.0 + ^3.3.0` 这种 caret 子集场景，输出 `^3.4.0`）；找不到时用 `unique.join(' ')` 把所有 unique range 按 npm 的 AND 语法拼接（`^1.0.0 + <1.5.0` → `^1.0.0 <1.5.0`），让包管理器同时强制每条约束，根治"返回单一来源 range 导致上限丢失"。zh/en `dependency.md` 的"版本兼容"段重写为"保留所有约束的交集"，并补"npm range AND 语法"的解释 tip。`resolve-versions.test.ts` 新增 6 条 case 覆盖：`^X + <Y` AND-join、`>=X + <Y` AND-join、三 range 全无包含关系的 AND-join、subset 命中、exact version 作为最窄 range；既有 caret 子集场景（`^1.2.0 + ^1.5.0 → ^1.5.0`）仍然通过 subset 分支保留可读输出。CLI 100% line/branch/function/statement 覆盖率保持。

### 1.8 Pipeline 原子性没有覆盖 `package.json` / `rack.json` 🟡 部分缓解（PR #91 / `f6edecd`）

位置：

- `apps/cli/src/lib/commands/add/pipeline.ts:91-106`
- `apps/cli/src/lib/commands/add/index.ts:72-83`
- `apps/cli/src/lib/commands/init/pipeline.ts:77-92`
- `apps/cli/src/lib/pkg.ts:45-55`

`applyFiles` 自身做了 plan/commit/rollback，但 pipeline 顺序是先 `applyFiles`，再 `pkg.update`。如果目标项目已有不可解析的 `package.json`，`pkg.update` 会抛 `PACKAGE_JSON_INVALID`，但此时 registry 文件已经写入磁盘。`rk add` 还有类似问题：pipeline 成功后才 `rackJson.update`，如果写 `rack.json` 失败，文件和 `package.json` 已经变更，但 manifest 没记录本次 registry。

影响：

- 用户看到命令失败，但工作区可能已经被部分修改。
- 下一次重试可能重复应用文件，或者因为 `rack.json` 没记录而无法判断已安装状态。
- 这和 apply 阶段注释里的“no bytes have hit disk / rollback”预期容易混淆；当前原子性只覆盖 registry files，不覆盖整个 install transaction。

**修复**：走"预检前置"分支。`pkg.ts` 抽出 `pkg.read(projectDir)` 公共 API —— 文件缺失返回 `null`，存在但解析失败抛 `PackageJsonInvalidError`，`pkg.update` 自身改用它去重读路径。新增 `apps/cli/src/lib/pipeline/preflight.ts`，公开 `preflight(targetDir)`，目前职责只一项：调用 `pkg.read` 把"package.json 坏掉"的最常见失败路径前置到 `applyFiles` 之前。`add/pipeline.ts` 与 `init/pipeline.ts` 都在 plan 之后、`applyFiles` 之前插入 `await preflight(targetDir)`，于是损坏的 `package.json` 现在在任何 registry 文件落盘**前**就抛错。`rack.json` 不需要预检：`rk add` 路径中 `rackJson.readOrCreate` 已在 pipeline 之前跑，`rk init` 的 `rack.json` 还不存在。产品决策：不引入完整 install transaction（plan/rollback 覆盖三者）—— 那是 §5.1 后续可继续推进的方向；这里只兜住最常见的真实故障。新增 6 条单测（`tests/lib/pipeline/preflight.test.ts` 3 条 + `pkg.test.ts` 3 条 `pkg.read` + `add/pipeline.test.ts` 2 条 preflight 顺序）。CLI 100% 覆盖率保持。

## 2. Server / Worker 一致性

### 2.1 Server 的 `/registries/**` 不支持 Admin Token 读绕过，Worker 支持 ✅ 已解决（commit `b135929`）

位置：

- Server：`apps/registry-server/src/routes/registry.route.ts:109-126`
- Worker：`apps/registry-worker/src/lib/auth.ts:87-99`

Worker 的 `enforceNamespaceAccess` 在 token 等于 `ADMIN_TOKEN` 时直接允许读请求。Server 的 registry read route 没有 `request.isAdminToken()` 分支，会把 Admin Token 当普通 namespace token 校验；如果该 token 不在 namespace token 列表中，受保护 registry 读请求会 401。

影响：

- Worker README 说 Worker 镜像 Server 只读 API，且 `ADMIN_TOKEN` 可作为跨命名空间 bypass。
- 同一个请求在 Worker 和 Server 上结果可能不同：Worker 200，Server 401。
- 运维/CI 在 R2 拓扑和 local/server 拓扑间切换时容易踩坑。

建议：

- 若 Admin Token 也应读绕过，Server registry route 在 namespace whitelist 后加入 `if (!request.isAdminToken())` 再执行 namespace token 校验。
- 若 Admin Token 只允许发布，不允许读取，则 Worker 和相关 README 需要收敛为同一语义。

**修复**：走"也应读绕过"分支 —— Server `registry.route.ts` 在 namespace whitelist 后加 `if (!request.isAdminToken())` 包住 `verifyNamespaceAccess`，与同仓 `namespace.route.ts:61` 和 `upload.route.ts:64` 的 admin-bypass 模式一致，也对齐 Worker README 的 "ADMIN_TOKEN ... cross-namespace bypass" 契约。Server README、`Config.adminToken` JSDoc、zh/en `registry-server/configuration.md` 收敛措辞为"读写都跳过命名空间级认证"。新增 `registry.test.ts` 单测覆盖 admin token 200 路径；e2e `server-worker-parity.test.ts` 把原本锁定 §2.1 divergence 的 split expectation 改为共享 `{ status: 200 }`，两端漂移都会被矩阵失败。

### 2.2 Registry URL 路径校验分散，异常状态码不完全一致 ✅ 已解决（commit `9abee8a`）

位置：

- `packages/registry-core/src/parser.ts`
- `apps/registry-server/src/lib/path.ts`
- `apps/registry-worker/src/index.ts:73-100`
- `apps/registry-worker/src/routes/registry.ts`

`parseRegistryUrl` 只判断形状，不校验 namespace/path/filePath 是否满足 schema 级别的合法字符。Server 后续靠 `resolveUnder` 阻止路径逃逸，非法文件路径可能走到通用 Error 并变成 500；Worker 使用 R2 key，不存在 filesystem traversal，但对 `%2e%2e`、编码字符等非法 path 也只会按普通 key 查找，通常返回 404。

同一类问题也体现在 Worker 路由入口：`/namespaces/:namespace/registries` 会先 `decodeURIComponent`，所以 `%40rack` 能正常识别为 `@rack`；但 `/registries/**` 直接把 `pathname.slice('/registries/'.length)` 传给 registry parser，`/registries/%40rack/...` 会按非法 registry locator 处理，而不是和 Server 一样落到同一资源。

影响：

- CLI 和 upload 对 `files[].path` 已经使用 `validateFilePath` 严格校验，但公开读 API 的非法路径状态码可能在 Server/Worker 间不同。
- 这类问题不一定是安全漏洞，但会削弱“Server/Worker mirror”的协议一致性。

建议：

- 在 `@rack/registry-core` 增加 registry URL locator 校验，Server/Worker 共用。
- 明确非法 URL path 统一返回 400 `INVALID_PATH`，不存在资源统一返回 404。

**修复**：两端各修一处 + 共享 parser 加字段校验。`@rack/registry-core` 的 `constants.ts` 新增 `NAMESPACE_PATTERN`（镜像 schema 的 `^@[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$`）和 `PATH_SEGMENT_PATTERN`（`^[a-z0-9]+(?:-[a-z0-9]+)*$`）；`parser.ts` 在每个分支（versions / latest / versioned / file）应用这两个规则，filePath 复用 `validateFilePath` 的现成校验。非法字段一律返回 `null`，调用方映射为 400 `INVALID_PATH`，与"资源不存在 → 404"区分开。Worker `index.ts` 的 `/registries/*` 入口加 `decodeURIComponent`（包 try/catch 处理孤立 `%`），与 Fastify 自动 decode path-param 的行为对齐，`/registries/%40rack/...` 不再单独 400。e2e parity test §2.2 case 从 `SplitExpectation` 改为共享 `Expectation`（两端 200），并新增 traversal / uppercase namespace / uppercase segment 的共享 400 cases，把字段校验对齐也纳入回归网。新增 registry-core parser 单测 11 条 + worker `index.test.ts` 3 条覆盖 decode、malformed encoding、traversal。

## 3. 文档、Schema 与 CLI 行为不一致

### 3.1 优先级文档展示了 CLI 不支持的多 registry `rk add` ✅ 已解决（commit 13d4413）

位置：

- `apps/docs/zh/guide/priority.md:56-60`
- `apps/docs/en/guide/priority.md:56-60`
- `apps/cli/src/lib/commands/add/index.ts:30-35`

文档示例：

```bash
rk add runtimes/node frameworks/vue build/vite testing/vitest quality/eslint
```

但 Commander 只声明了一个 `<registry>` 参数。多余参数不会按“批量 add”语义执行。

建议：

- 修改文档为多次 `rk add`，或实现 `rk add <registry...>` 批量安装。
- 如果实现批量安装，需要一次性解析依赖/冲突/排序，而不是逐个 add，才能符合文档里“共同排序”的描述。

**修复**：走“改文档”分支 —— zh/en `priority.md` 都改成 5 条独立 `rk add`，并补一句说明“`rk add` 每次只接受一个 Registry，依赖在每次调用内部仍会按 priority 排序”。CLI 行为不动。

### 3.2 `conflicts` 示例用了 schema 不接受的 semver range ✅ 已解决（commit a78a240）

位置：

- 文档：`apps/docs/zh/reference/schema/registry-item.md:269-281`
- 文档：`apps/docs/en/reference/schema/registry-item.md:269-281`
- Schema：`packages/storage/schema/registry-item.json:20-31`

中文 schema 文档示例包含：

```json
"frameworks/react@^18.0.0"
```

但 schema 的 `registryIdentifier` 只接受精确 semver，如 `@1.0.0`，不接受 `^18.0.0`。

建议：

- 把示例改成精确版本，例如 `frameworks/react@18.0.0`。
- 或者如果确实希望 conflicts 支持 range，需要扩展 schema、parser 和 canonical conflict 语义。

**修复**：走“改文档”分支 —— zh/en `registry-item.md` 都把 `frameworks/react@^18.0.0` 改成 `frameworks/react@18.0.0`，与上下文“conflict 走 canonical（namespace + path）”的设计一致。Schema 与 parser 不动。

### 3.3 `--force` 的实际语义是跳过目录存在校验，不是清空/覆盖目录 ✅ 已解决

位置：

- `apps/cli/src/lib/commands/init/index.ts:82`
- `apps/cli/src/lib/commands/init/index.ts:113-133`

文档和 README 表述接近“强制覆盖已存在目标目录”。实现只是在目录存在时不报错，然后把 registry 文件合并/覆盖进去；不会删除目标目录中旧文件，也不会保证结果等同于全新初始化。

影响：

- 用户可能期望 `--force` 后得到干净项目，但旧文件会保留。
- 对脚手架生成结果做对比或 CI 初始化时容易出现脏内容。

建议：

- 若保留当前行为，文档改为“允许在非空目录中合并写入”。
- 若目标是覆盖目录，执行前需要显式清空 targetDir，并把风险写清楚。

**修复**：走"改文档/文案"分支 —— CLI 行为不动（与 `rk add` 的 per-file 合并语义保持一致）；把所有"overwrite / 强制覆盖"的措辞改成"allow init into an existing directory (no cleanup) / 允许在已存在目录中初始化，不会清空"。改 7 处：`apps/cli/src/lib/commands/init/index.ts` 的 `force?` JSDoc、Commander option 描述、`validateTargetDir` JSDoc 与 `VALIDATION_ERROR` 错误信息、`apps/cli/src/lib/commands/init/help.ts` 的示例注释与新增 Notes 一条说明合并策略仍接管 per-file 冲突、zh/en `cli.md` `-f, --force` 表格行、`apps/cli/README.md` `-f, --force` 行。

**产品决策**：`--force` 仅放宽"目录已存在"前置校验，per-file 冲突仍由各 Registry 的 merge strategy（overwrite / json / env / ignore / custom）决定。需要"全新初始化"的用户应自行 `rm -rf` 目标目录后再 `rk init`；CLI 不内置破坏性清理，避免对 git 未提交内容造成不可恢复的删除。

### 3.4 Schema 没有限制 `files[].target`，可发布 CLI 无法安装的 registry ✅ 已解决（PR #52 / commit `250bbe4`，决定保留现状）

位置：

- `packages/storage/schema/registry-item.json:96-122`
- `apps/cli/src/lib/pipeline/apply.ts:101-121`
- `apps/registry-server/src/services/upload.service.ts:269-298`

Schema 对 `files[].path` 使用了严格的 `filePath` 规则，Server 上传也会校验 `files[].path` 是否存在且安全；但 `files[].target` 只有 `type: string` 和 `minLength: 1`，没有禁止绝对路径、`..`、空段、反斜杠等。

CLI 在真正安装时会用 `resolveWithinTarget` 拒绝逃逸项目目录的 target。因此一个 registry 可以通过 Server schema/upload 校验并被发布，但用户 `rk add` 时才失败，例如：

```json
{
  "files": [
    {
      "target": "../outside.txt",
      "type": "registry:config",
      "content": "bad"
    }
  ]
}
```

影响：

- Registry 发布成功不代表 CLI 可安装，错误被延迟到最终用户。
- 当前 storage integrity test 只验证仓库内样例 conform schema，不会捕获“schema 比 CLI 安装规则更宽”的问题。

建议：

- 给 `target` 增加独立 schema 定义，至少禁止 absolute path、`.` / `..` 段、空段和反斜杠。
- Server 上传阶段复用同一 target validator，和 CLI 的 `resolveWithinTarget` 规则保持一致。
- 如果 target 需要允许比 `files[].path` 更宽的字符集，单独定义 `targetPath`，不要直接复用 registry server filePath。

**修复**：走"保留现状"分支。CLI 侧 `apps/cli/src/lib/pipeline/apply.ts:108` 的 `resolveWithinTarget()`（PR #52 / commit `250bbe4`）已经在 apply 阶段用 `path.resolve` + `path.relative` 拒绝任何逃逸 `targetDir` 的 target（`..` 段、绝对路径都会抛 `PathTraversalError`），同 PR 配套 `error-hints` 文案和单测。即使一个恶意 registry 通过 Server schema/upload 校验被发布，最终 `rk add` 在 apply 阶段必然 fail，没有真实的安全/数据风险——只是发布者拿到错误的时间点偏晚。

**产品决策**：不为此再加 Server schema 校验。`files[].path`（registry 内部源路径）和 `files[].target`（用户项目内目标路径）是两套不同的字符集需求：前者绑定 storage layout，必须严格；后者是用户项目里的相对路径，规则与 CLI runtime 强相关，硬塞 schema 会产生"schema/runtime 哪个是真规则"的双源问题。runtime 守卫已经是单一事实来源。

### 3.5 `--ci` 与 `-n` 的要求在 help 和实现中不一致 ✅ 已解决（commit 4d535aa）

位置：

- `apps/cli/src/lib/commands/init/help.ts:11-14`
- `apps/cli/src/lib/commands/init/index.ts:72-88`
- `apps/cli/src/lib/infra/prompts.ts:108-110`
- `apps/docs/zh/reference/cli.md:16-26`

`rk init --help` 的示例明确写了：

```text
rk init -t @rack/runtimes/node --ci -n svc        # CI mode requires -n
```

但实现没有强制 `--ci` 必须传 `-n`。`Prompter` 在 CI 模式下会直接返回 text prompt 的 `initial`，所以 `rk init -t xxx --ci` 会静默使用默认项目名 `my-project`，而不是报错。

影响：

- CI 脚本漏写 `-n` 时不会失败，会在当前目录下创建 `my-project`。
- Help 说“requires -n”，中文 CLI 参考只说 `--ci` 非交互且跳过 install/git，没有说明默认项目名。

建议：

- 如果确实要求 CI 必须显式项目名，在 `ci && !options.name` 时抛 `VALIDATION_ERROR`。
- 如果允许默认 `my-project`，help 和中文参考应明确写出这个默认行为，并删除 “requires -n”。

**修复**：走"强制 `-n`"分支 —— `rk init` 在 `ci && !options.name` 时早退抛 `VALIDATION_ERROR`，不再让 prompt 的 `initial` 默认值静默漏到 scaffold。help text 与 zh/en `cli.md` 把"requires `-n`"写明确；新增单测覆盖缺 `-n` 时的失败路径。

## 4. 工程质量与流程

### 4.1 `pnpm lint` 不是 ESLint，Husky hooks 也没有实际提交钩子 ✅ 已解决（commit 363bbc8）

位置：

- `package.json:21-24`
- `apps/cli/package.json:29-35`
- `.lintstagedrc:1-12`

根 `pnpm lint` 走 Turborepo，各包 lint 脚本目前是 `tsc --noEmit` / `tsc`。仓库有 `eslint.config.js` 和 `.lintstagedrc`，但没有 `.husky/pre-commit` 或 `.husky/commit-msg` 这类实际 hook 文件；`.husky/_` 只是 Husky 运行时辅助文件。

影响：

- README/开发约定里“ESLint + Prettier wired / Husky + lint-staged run on commit”的预期不成立。
- `pnpm lint` 通过不代表 ESLint/Prettier 通过。

建议：

- 明确拆分脚本：`typecheck` 跑 `tsc --noEmit`，`lint` 跑 `eslint .`，`format:check` 跑 `prettier --check .`。
- 补齐 `.husky/pre-commit` 调 `pnpm lint-staged`，`.husky/commit-msg` 调 commitlint。
- root `pnpm lint` 如果仍想只做 typecheck，需要文档改名，避免误导。

**修复**：把 `lint` / `typecheck` / `format` 三种职责彻底拆开。每个包的 `lint`（原本是 `tsc --noEmit`）改名为 `typecheck`，新 `lint` 跑 `eslint .`；根加 `pnpm typecheck`（走 turbo）、`pnpm lint`（直接 `eslint .` 一次扫全仓）、`pnpm format:check` / `pnpm format`（Prettier）。`apps/cli` 和 `apps/registry-server` 的 tsconfig 补 `noUnusedLocals` / `noUnusedParameters`（其他 4 个包早就开了）。`.husky/pre-commit` 写 `pnpm exec lint-staged`，`.husky/commit-msg` 写 `pnpm exec commitlint --edit "$1"`；v9 hook 文件不需要 shebang。`prepare: husky install` 改成 `prepare: husky`（v9 弃用了旧形式）。新加 `.prettierignore` 把 lockfile、build/coverage 输出、`packages/storage/**/templates/**` 排除。CI workflow 把旧 `pnpm lint`（实际跑 tsc）替换为 `pnpm typecheck` + `pnpm lint` + `pnpm format:check`。CLAUDE.md / README 的命令速查同步改写。新 pipeline 立刻揪出一个真实违规——PR #80 的 `apply.test.ts` 有 8 处 Prettier 不合规，单独 `c8701de` auto-fix。

### 4.2 Root TypeScript 命令实际没有检查源码，且引用没有覆盖全仓 ✅ 已解决（commit 363bbc8）

位置：

- `tsconfig.json:16-24`
- `apps/cli/package.json:30-31`
- `apps/registry-server/package.json:9-11`
- `packages/auth-core/tsconfig.json`
- `packages/registry-core/tsconfig.json`
- `apps/registry-worker/tsconfig.json`
- `apps/e2e/tsconfig.json`

根 `tsconfig.json` 的 `include` 是空数组，只有 references；但普通 `tsc --noEmit` 不会像 `tsc -b` 那样构建 referenced projects。我用同一命令追加 `--listFiles` 验证，输出为空，说明项目说明里强调的 root-level type-check 命令实际没有检查任何源码。

另外，即使改成 build mode，当前 root references 也只有 CLI 和 registry-server，没有覆盖 auth-core、registry-core、worker、e2e。`pnpm lint` 通过 Turborepo 会跑各包的 `lint` 脚本，但 CLI / registry-server 的脚本只是 `tsc --noEmit`，没有显式携带 `--noUnusedLocals --noUnusedParameters`；部分包是靠自己的 tsconfig 打开 noUnused。

建议：

- 如果想用 project references，改为 `tsc -b --pretty false`，并把所有 TS package 加入 root references，同时满足 referenced projects 的 `composite` 要求。
- 如果想走 Turborepo，新增明确的 root `typecheck` 脚本，例如 `turbo lint` 或 `turbo typecheck`，并确保所有包都实际启用 noUnused。
- 文档中的推荐命令需要和真实 CI 命令保持一致，避免出现“命令通过但没有检查任何文件”的假阳性。

**修复**：与 4.1 同一个 PR 解决。走 turbo 而不是 project references —— 根新增 `pnpm typecheck` 调 `turbo typecheck`，每个包都有自己的 `typecheck: tsc --noEmit` 真正落到 tsconfig 上；`turbo.json` 加 `typecheck` pipeline 依赖 `^build` 让 workspace deps 先 build。CLAUDE.md 里指向 root `tsc --noEmit` 的"命令通过但没检查任何文件"的假阳性命令改成 `pnpm typecheck`，并说明所有包都启用了 noUnused。root `tsconfig.json` 的 `include: []` 和不完整的 references 保持原样（不影响 IDE，也不再被任何 CI 命令调用）。

### 4.3 CI 没有验证文档站构建 ✅ 已解决

位置：

- `.github/workflows/ci.yml:31-37`
- `package.json:21-27`
- `apps/docs/package.json:4-8`
- `turbo.json:26-31`

根 CI 只跑 `pnpm build`、`pnpm lint`、`pnpm test`、`pnpm test:e2e`。`apps/docs` 没有 `build` / `lint` / `test` 脚本，只有 `docs:build`，所以文档站不会在主 CI 中构建验证。

我单独跑了 `pnpm --filter @rack/docs docs:build`，当前是通过的；但这说明问题更偏流程缺口：未来中文/英文文档、VitePress config、sidebar/frontmatter 破坏构建时，主 CI 不会拦住。

建议：

- CI 增加 `pnpm --filter @rack/docs docs:build`，或者把 docs 的 `build` 脚本 alias 到 `vitepress build`，让 `pnpm build` 覆盖它。
- 如果根 README / AGENTS 继续说 `pnpm build` 是 all apps，需要让 Worker/docs 都接入 `build`，或把说明改成“构建可发布的 Node 包”。

**修复**：走“`build` alias 到 `vitepress build`”分支 —— `apps/docs/package.json` 增加 `"build": "vitepress build"`，让 `pnpm build`（= `turbo build`）自动覆盖文档站；`turbo.json` 的 `build` outputs 加入 `.vitepress/dist/**` 让缓存命中。文档站仍由 Cloudflare Pages 自己部署，但破坏性改动会在 PR 阶段被主 CI 拦住，不必等 Pages 失败后回滚。Worker `build` 接入是 4.4 的事，本条不动。

### 4.4 Worker 自动部署没有监听共享包变更 ✅ 已解决（commit 4f58aa1）

位置：

- `.github/workflows/deploy-worker.yml:3-9`
- `apps/registry-worker/package.json:13-16`
- `apps/registry-worker/src/lib/auth.ts:18-20`
- `apps/registry-worker/src/routes/registry.ts:15`
- `apps/registry-worker/src/routes/namespace.ts:10-14`

Worker 源码直接依赖 `@rack/auth-core` 和 `@rack/registry-core`，但 `Deploy Worker` workflow 的 push path filter 只监听：

```yaml
paths:
  - 'apps/registry-worker/**'
  - '.github/workflows/deploy-worker.yml'
```

因此如果修改了 `packages/auth-core` 或 `packages/registry-core` 并合并到 main，主 CI 会通过，但 Worker 不会自动重新部署。Server 因为在同一个 main 发布/部署路径中可能使用新逻辑，而 Worker 还运行旧 bundle，最容易出现在 auth policy、registry URL parser、cache headers、错误码这类共享协议代码上。

影响：

- Server/Worker 本来要保持只读协议一致；共享包变更后，生产 Worker 可能滞后。
- 这类漂移不一定会被 deploy-worker 的 post-deploy smoke 捕获，因为 workflow 根本不会触发。

建议：

- `deploy-worker.yml` 的 paths 增加：

```yaml
- 'packages/auth-core/**'
- 'packages/registry-core/**'
- 'packages/storage/schema/**'
```

- 如果 Worker 行为还依赖根配置或锁文件，也建议纳入 `pnpm-lock.yaml`、`wrangler.jsonc` 等相关路径。

**修复**：`deploy-worker.yml` 的 `paths` filter 加上 `packages/auth-core/**`、`packages/registry-core/**`、`pnpm-lock.yaml`，覆盖 Worker workspace 依赖和依赖升级两条路径。`wrangler.jsonc` 不需要单列——本仓的 wrangler 配置是 `apps/registry-worker/wrangler.toml`，已经被 `apps/registry-worker/**` 覆盖。`packages/storage/schema/**` 也没加：Worker 不从该目录读 schema（已由 sync-storage workflow 同步到 R2），且 `SCHEMA_FILES` 允许列表在 `registry-core` 内，加新 schema 时一定会触发 `packages/registry-core/**` 路径，重复列没意义。

### 4.5 Registry Server Docker 手动运行示例缺少必要 env ✅ 已解决（commit `803d5ff`）

位置：

- `apps/registry-server/Dockerfile:29-40`
- `apps/registry-server/src/config.ts:55-70`
- `apps/registry-server/README.md:250-266`
- `apps/docs/zh/guide/registry-server/methods.md:198-212`

Dockerfile 在镜像里创建了 `/data`、`/app/config/auth.json`、`/app/config/webhooks.json`，并把 schema 复制到 `/app/schema`。但 `loadConfig()` 的默认值是按 `process.cwd()` 解析：

- `STORAGE_ROOT` 默认 `resolve(process.cwd(), '../../packages/storage')`
- `AUTH_CONFIG_PATH` 默认 `resolve(process.cwd(), '../../config/auth.json')`
- `SCHEMA_DIR` 默认 `<storageRoot>/schema`

容器 `WORKDIR` 是 `/app`，所以裸 `docker run -p 18080:8080 rack-registry` 会默认找 `/packages/storage`、`/config/auth.json`、`/packages/storage/schema`，而不是 Dockerfile 创建的 `/data`、`/app/config/auth.json`、`/app/schema`。

文档里的“Run with defaults”和“持久化存储 + 自定义 auth + admin token”示例也没有设置 `STORAGE_ROOT=/data`、`SCHEMA_DIR=/app/schema`、`AUTH_CONFIG_PATH=/app/config/auth.json`、`WEBHOOK_CONFIG_PATH=/app/config/webhooks.json`。`docker compose` 已经设置了这些 env，所以 compose 路径可用；手动 `docker run` 路径很可能启动后 health check 失败或所有 registry 读取 403/404。

建议：

- 在 Dockerfile 设置容器默认 env：

```dockerfile
ENV STORAGE_ROOT=/data \
    SCHEMA_DIR=/app/schema \
    AUTH_CONFIG_PATH=/app/config/auth.json \
    WEBHOOK_CONFIG_PATH=/app/config/webhooks.json
```

- 或者把 README / 中文文档里的所有 `docker run` 示例补全这些 `-e` 参数。
- `docker run` 示例里的 auth mount 路径也建议统一为 repo root 的 `$(pwd)/config/auth.json:/app/config/auth.json:ro`。

**修复**：走方案 1 —— [Dockerfile](apps/registry-server/Dockerfile) 第二个 stage 的 `ENV` 块加上 `STORAGE_ROOT=/data`、`SCHEMA_DIR=/app/schema`、`AUTH_CONFIG_PATH=/app/config/auth.json`、`WEBHOOK_CONFIG_PATH=/app/config/webhooks.json`，让裸 `docker run -p 18080:8080 rack-registry` 不依赖任何 `-e` 也能起来。docker compose 行为完全不受影响：compose `environment` 优先级高于 Dockerfile `ENV`，且 [docker-compose.yml](apps/registry-server/docker-compose.yml) 里既有的四条 env 与新默认值等价（`AUTH_CONFIG_PATH=config/auth.json` 这种相对路径在 `WORKDIR=/app` 下也解析为同一个文件），保持显式声明更利于运维 review。README 与 zh/en `methods.md` 的"manual build / run"示例同步重写：第一个示例补一句"镜像已设好默认 env"的说明；第二个示例 mount 路径统一为"在仓库根目录执行"的 `$(pwd)/config/auth.json` 与 `$(pwd)/apps/registry-server/config/webhooks.json`，删掉原来歧义的 `$(pwd)/../../config/auth.json` 形式。

### 4.6 Worker 依赖的 R2 schema/preset 对象没有自动同步链路 ✅ 已解决（commit 8e711e0）

位置：

- `apps/registry-worker/src/routes/schema.ts:4-15`
- `apps/registry-worker/src/routes/preset.ts:4-12`
- `.github/workflows/sync-auth.yml:30-40`
- `.github/workflows/deploy-worker.yml:28-43`
- `packages/storage/schema/*.json`
- `packages/storage/presets/*/preset.json`

Worker 的 `/schemas/:file` 直接读取 R2 key `schema/{file}`，`/presets/:name` 直接读取 R2 key `presets/{name}/preset.json`。但当前自动化里：

- `sync-auth.yml` 只上传 `.auth/auth.json`。
- `deploy-worker.yml` 只部署 Worker 和做 `/health` 检查。
- registry upload route 只发布 registry package，没有 preset/schema 发布路径。

这意味着 schema 和 preset 在生产 R2 里的存在与更新依赖手工操作或外部流程；仓库内 `packages/storage/schema` / `packages/storage/presets` 修改后，不会自动同步到 Worker 实际读取的位置。

影响：

- 文档里的 `$schema: https://registry.rackjs.com/schemas/registry-item.json` 可能指向旧 schema。
- 新增/修改 preset 后，CLI `rk init -t @presets/...` 在 Worker 域名上可能 404 或读到旧内容。
- `deploy-worker` 的 post-deploy health check 不覆盖 `/schemas` 和 `/presets`，不会及时发现缺失。

建议：

- 增加 workflow：当 `packages/storage/schema/**` 或 `packages/storage/presets/**` 变更时，用 Wrangler/AWS S3 API 同步到 R2。
- `deploy-worker` post-deploy smoke 增加至少一个 schema 和一个 preset read check。
- 如果 presets 不想由 R2 静态同步维护，需要给 registry-server 增加 preset 发布/同步机制，并在文档中明确。

**修复**：新增 `.github/workflows/sync-storage.yml`，监听 `packages/storage/schema/**` 和 `packages/storage/presets/**` 变更（也支持 `workflow_dispatch` 手动触发），用 `aws s3 sync --delete` 通过 R2 S3-compat endpoint 把目录原样镜像到 R2 的 `schema/` 与 `presets/` 前缀；同步完成后 curl 一个 schema + 一个 preset 的 Worker 公开 URL 兜底。同时给 `deploy-worker.yml` 的 Post-deploy health check 增加 `/schemas/registry-item.json` 和 `/presets/node/preset.json` 两条 GET，把"R2 缺对象"的失败模式提前到 Worker 部署时暴露，不再让最终用户先碰到 404。`--delete` 让仓库里删除的 preset 也会从 R2 移除。

## 5. 可优化项

### 5.1 依赖解析与安装计划可以显式建模 ✅ 已解决（PR #91 / `f6edecd`）

当前 pipeline 把“用于图排序的 registry”“本次需要写入磁盘的 registry”“已安装但用于冲突判断的 registry”混在多个数组里。建议引入 install plan：

- `requested`
- `resolvedDependencies`
- `alreadyInstalled`
- `toApply`
- `toRecord`

这样可以同时解决“已安装依赖重复应用”“显式版本升级语义”“冲突检查降级提示”等问题。

**修复**：`pipeline/types.ts` 新增 `InstallPlan` interface，五个字段一一对应五种角色。新增 `pipeline/install-plan.ts` 暴露 `buildInstallPlan({ requested, installedRegistries, language, logger })`，集中干四件事：BFS transitive deps（带已装跳过）、fetch 已装 items（用于反向 conflict 检查）、`validateNoConflicts` 跨 new+installed、`sortItems` 拓扑排序。原 `add/pipeline.ts` 里的 `warnDegradedConflictCheck` + `pluralize` 内部 helper 一并迁过来 —— 它们属于"计划阶段"的关心范围。两个 pipeline 都瘦身为 6 步：fetch root → buildInstallPlan → preflight → applyFiles → resolveDependencies → pkg.update，所有"已装/转 deps/要写盘/要记录"的判断都从 plan 字段直接取，pipeline 层不再维护四个平行数组。新增 9 条单测覆盖 `buildInstallPlan`（`tests/lib/pipeline/install-plan.test.ts`），既有 `add/pipeline.test.ts` 的集成测试全部仍然 pass 验证 wiring 正确。CLI 100% 覆盖率保持。

### 5.2 文档示例应优先使用仓库真实存在的 registry/preset ✅ 已解决（commit 4ec5b3d）

根 README 和中文快速开始中有一些示例类似 `@presets/tutorial-project`、`@rack/tailwindcss`，但当前 `packages/storage` 中并不存在。作为概念示例可以接受，但 Quick Start 更适合使用当前真实可跑的：

- `rk init -t @presets/node`
- `rk init -t @presets/node-library`
- `rk add @rack/testing/vitest`

这能降低新用户直接复制命令失败的概率。

**修复**：根 `README.md`、zh/en `getting-started.md`、zh/en `what-is-rack.md` 共 5 个文件里的假示例全部替换为真存在的 registry/preset：`@presets/tutorial-project` → `@presets/node`、`@rack/tailwindcss` → `@rack/testing/vitest`、`frameworks/vue` + `build/vite` → `testing/vitest` + `quality/eslint`、`features/pinia` → `@rack/testing/vitest`。`priority.md` 等"演示语义而非可跑命令"的概念性示例保留原状。

### 5.3 Server/Worker 协议一致性建议增加矩阵测试 ✅ 已解决

目前 unit test 很强，但 Server 和 Worker 的 read API 等价性主要靠共享代码和各自测试保证。建议增加一组共享 case：

- protected namespace：missing token / namespace token / admin token。
- malformed registry URL：非法 namespace、编码 traversal、空 file path。
- latest/versioned/files/listing 的 status code 与 body code。

这些 case 可以直接喂给 Server inject 和 Worker handler，防止两个 runtime 后续漂移。

**修复**：在 `apps/e2e` 落了一个矩阵测试 —— `tests/server-worker-parity.test.ts` 列 20 个 case，覆盖 4 个 group（auth / malformed / endpoint / listing），同一份 `ParityCase` 同时喂给 Fastify `app.inject` 和 Worker `fetch`，分别断言 status + body code。基础设施抽到 `src/parity.ts`（SeedSpec、in-memory R2BucketLike、双 runtime 共享的 seed/fire helpers）。已知 divergence（§2.1 admin token 在 `/registries/*` 上 Server 401 / Worker 200、§2.2 `%40rack` Server 200 / Worker 400）通过 per-runtime `SplitExpectation` 显式锁定当前行为，并在 `reason` 字段引用 REVIEW.md 章节 —— 任一 runtime 漂移都会失败，2.1/2.2 真修时把 case 改成共享 `Expectation` 即可。

## 6. 复查新增问题

### 6.1 `pnpm build` 后 `pnpm lint` 会扫描 VitePress 缓存并失败 ✅ 已解决

复查修复后按 CI 顺序跑命令：

```bash
pnpm build
pnpm typecheck
pnpm lint
```

结果是 `pnpm build` 与 `pnpm typecheck` 通过，但 `pnpm lint` 失败，错误来自 VitePress 生成缓存：

```text
apps/docs/.vitepress/cache/deps/chunk-2SKGOFMA.js
apps/docs/.vitepress/cache/deps/vitepress___@vue_devtools-api.js
apps/docs/.vitepress/cache/deps/vitepress___@vueuse_core.js
✖ 396 problems (396 errors, 0 warnings)
```

原因是：

- 根 `package.json` 现在的 lint 脚本是 `eslint .`。
- `eslint.config.js` 的 flat config `ignores` 只排除了 `/*.js`、`**/*.json`、`**/dist/**`、`**/node_modules/**` 和 `eslint.config.js`，没有排除 `**/.vitepress/cache/**`。
- `.gitignore` 里的 `/apps/docs/.vitepress/cache` 对 ESLint flat config 不生效。
- `.github/workflows/ci.yml` 的顺序是先 `pnpm build`，再 `pnpm typecheck`，再 `pnpm lint`，因此 CI 会先生成 `apps/docs/.vitepress/cache/`，随后 lint 这些第三方 bundle。

建议在 `eslint.config.js` 的 ignores 中显式补：

```text
**/.vitepress/cache/**
**/.vitepress/dist/**
**/coverage/**
```

其中 `dist` 已有覆盖，但 `coverage` 也属于 test 产物，建议一起保持与 `.prettierignore` 的构建/测试产物排除策略一致。修复后应按 CI 顺序复跑 `pnpm build && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm test:e2e`。

### 6.2 Preset 里同一 registry 的不同版本/语言会被静默去重 ✅ 已解决

位置：

- `packages/storage/schema/preset.json`
- `apps/docs/zh/reference/schema/preset.md`
- `apps/cli/src/lib/commands/init/fetch.ts`
- `apps/cli/src/lib/pipeline/resolve-dependencies.ts`
- `apps/cli/src/lib/pipeline/install-plan.ts`

`preset.json` schema 和文档允许 `registries` 成员带 `@version` / `:language`，例如 `runtimes/node@1.0.0`、`frameworks/vue@1.0.0:ts`。但 preset 展开后会先 fetch 每个 root，再进入 `buildInstallPlan()`；`resolveRegistryDependencies()` 初始化 `Map` 时使用的是 `canonicalizeIdentifier(i.identifier)`，这个 key 会去掉版本和语言：

```ts
const resolved = new Map(
  items.map((i) => [canonicalizeIdentifier(i.identifier), i])
)
```

因此 preset 如果声明了同一个 canonical registry 的不同版本或语言：

```json
{
  "registries": ["runtimes/node@1.0.0", "runtimes/node@2.0.0"]
}
```

或：

```json
{
  "registries": ["frameworks/vue:js", "frameworks/vue:ts"]
}
```

CLI 会把它们都 fetch 出来，但进入 install plan 后只保留一个；不会抛 `VERSION_MISMATCH`，也不会提示 preset 重复/冲突。当前 `VERSION_MISMATCH` 只覆盖“已安装项 vs transitive dependency”的版本差异，不覆盖 preset root 之间的差异。

影响：

- preset 作者写错重复项时，最终 scaffold 内容取决于 Map 去重后的保留值，用户没有任何显式错误。
- 如果未来 registry 真有语言变体，preset 里想组合同一 registry 的不同语言会被静默吞掉一个。
- 文档承诺 preset 成员可以指定版本/语言，但缺少重复 canonical root 的产品语义。

建议：

- 在 `fetchTemplate()` 展开 preset 后、或 `buildInstallPlan()` 接收 `requested` 时，按 canonical key 检查 root 列表。
- 同 canonical + 不同 `version`：直接抛 `VERSION_MISMATCH` 或新的 `DUPLICATE_REGISTRY` 错误。
- 同 canonical + 不同 `language`：直接报错，除非产品明确支持“同 registry 多语言并存”。
- 同 canonical + 完全相同：也建议报错或 warn，避免 preset 看起来装了两次但实际只装一次。
- schema 的 `uniqueItems` 只能挡住字符串完全相同，挡不住 `runtimes/node` 和 `@rack/runtimes/node` 这种等价写法，所以必须在 CLI 侧做 canonical 级校验。

### 6.3 仍有一批用户可复制的文档示例指向不存在的 registry/preset ✅ 已解决

位置：

- `apps/cli/README.md`
- `apps/docs/zh/reference/cli.md`
- `apps/docs/zh/guide/preset.md`
- `apps/docs/zh/guide/language-variants.md`
- 对应英文文档同样存在
- `packages/storage/@rack/**`
- `packages/storage/presets/**`

前面 5.2 只修了根 README、getting-started、what-is-rack 里的一部分示例；复查发现 CLI README 和多篇中英文 docs 仍然有大量可复制命令使用当前仓库不存在的内容，例如：

- `@presets/vue-ts`
- `@presets/node-api`
- `@presets/tutorial-project`
- `@rack/tailwindcss`
- `@rack/vitest`
- `@rack/node-ts`
- `frameworks/vue`
- `build/vite`
- `features/vue-router`
- `features/pinia`

当前仓库真实存在的官方 registry 只有：

- `@rack/quality/commitlint`
- `@rack/quality/prettier`
- `@rack/quality/lint-staged`
- `@rack/quality/eslint`
- `@rack/quality/husky`
- `@rack/runtimes/typescript`
- `@rack/runtimes/node`
- `@rack/testing/vitest`
- `@rack/build/typescript`
- `@rack/build/rollup`

真实 preset 只有：

- `@presets/node`
- `@presets/node-library`

另外 `apps/docs/zh/guide/preset.md` / `apps/docs/en/guide/preset.md` 里还有：

```bash
rk init -t @presets/tutorial-project --ci
```

这同时踩中两个问题：preset 不存在，并且 `--ci` 现在已经要求 `-n/--name`，复制运行会直接失败。

`language-variants.md` 的问题更明显：文档写的是“官方 Node.js TypeScript/JavaScript 变体”和“官方 Vue.js TypeScript 变体”，但当前 `packages/storage/@rack/**/registry.json` 没有任何一个声明 `languages`，也没有 `@rack/frameworks/vue`。这不是纯概念示例，而是在描述“官方”可用能力。

影响：

- 新用户按 CLI README 或参考文档复制命令时会遇到 404 / invalid template / missing `-n`。
- 文档会让人误以为官方 registry 已经覆盖 Vue/Vite/Tailwind/language variants，但仓库事实不是这样。
- e2e 只验证当前 storage 里的真实 materials/presets，不会发现文档里的虚构命令已经不可运行。

建议：

- 把“Quick Start、CLI README、Reference CLI、Preset guide”里所有可复制命令换成真实存在的 `@presets/node`、`@presets/node-library`、`@rack/testing/vitest`、`@rack/quality/eslint` 等。
- 如果某些 `frameworks/vue` 示例只是讲概念，文案上明确标成“假设你发布了如下 registry”或“概念示例”，不要写成官方可用命令。
- `--ci` 示例全部补 `-n <name>`。
- `language-variants.md` 要么新增真实带 `languages` 的官方 registry 并用它做示例，要么去掉“官方”字样，改成完整的自定义 registry 教程。
- 建议增加一个轻量 doc lint：扫描 Markdown 中的 `rk add` / `rk init -t` 命令，对明确标为官方的 identifier 去 `packages/storage` 做存在性校验。

### 6.4 `packages/storage/@rack/**` 官方 registry 没有自动同步到生产 R2 ⏭️ 不修复

位置：

- `.github/workflows/sync-storage.yml`
- `.github/workflows/deploy-worker.yml`
- `packages/storage/@rack/**`
- `apps/e2e/README.md`

前面 4.6 新增的 `sync-storage.yml` 只同步：

```yaml
- packages/storage/schema/**  → R2 schema/
- packages/storage/presets/** → R2 presets/
```

但仓库里的官方 registry 数据在 `packages/storage/@rack/**`，当前没有任何 workflow 监听这个路径，也没有 workflow 把这些 registry 打包后走 `POST /registries` 上传到 R2。`deploy-worker.yml` 的 post-deploy smoke 只做 Worker 部署、schema/preset read check，以及上传一个临时 e2e fixture；它不会同步或验证当前 checkout 里的 10 个官方 registry。

`apps/e2e/README.md` 也写明远程模式下 `materials / presets / errors` 会拿“当前 checkout 的 `packages/storage`”去打已部署 registry，并要求“Run after the deployed content is in sync”。问题是仓库里没有自动让 deployed content 与 checkout sync 的链路。

影响：

- 修改 `packages/storage/@rack/.../registry.json` 或模板文件后合并到 main，CI 可以全绿，但 `https://registry.rackjs.com/registries/@rack/...` 仍可能是旧内容。
- 新增官方 registry 后，preset 同步到 R2 了，但 preset 引用的 registry 可能没有发布，`rk init -t @presets/...` 会在安装成员时 404。
- 远程 e2e 的 materials 模式能暴露这个问题，但当前没有 workflow 自动跑它。

建议：

- 如果 `packages/storage/@rack/**` 是官方 registry 的 source of truth，增加一个发布 workflow：监听 `packages/storage/@*/**`，对变更的 registry 目录打 tar.gz，通过 registry-server `POST /registries` 上传，让 `versions.json` 继续由 Server 维护。
- 或者明确选择静态同步模式：同步 `@rack/**` 到 R2 时必须同时生成/校验每个 path 的 `versions.json`，并保证 `registry.json` 最后写入，避免 Worker 读到半发布目录。
- 同步后跑一组远程 e2e：至少 `RACK_REGISTRY_URL=https://registry.rackjs.com pnpm --filter @rack/e2e test:e2e -- tests/materials.test.ts tests/presets.test.ts`。
- `sync-storage.yml` 的名字也建议改得更精确；当前它叫 storage sync，但实际只 sync schema/presets，容易让维护者误以为 `@rack` materials 也覆盖了。

### 6.5 Pipeline 原子性修复仍只是预检，不是完整事务 ✅ 已解决（措辞收准）

位置：

- `apps/cli/src/lib/pipeline/preflight.ts`
- `apps/cli/src/lib/pipeline/apply.ts`
- `apps/cli/src/lib/pkg.ts`
- `apps/cli/src/lib/rack-json.ts`
- `apps/cli/src/lib/commands/init/index.ts`
- `apps/cli/src/lib/commands/add/index.ts`

  1.8 的解决记录写的是“Pipeline 原子性没覆盖 `package.json` / `rack.json` ✅ 已解决”，但当前实现实际只前置检查了 `package.json` 是否可解析：

```ts
export async function preflight(targetDir: string): Promise<void> {
  await pkg.read(targetDir)
}
```

`applyFiles()` 自身已经是两阶段写入并可 rollback；但 `pkg.update()` 和 `rackJson.update()` / `writeJSON(rack.json)` 仍在 `applyFiles()` 之后执行，且不在同一事务里。`preflight.ts` 的注释也明确承认 surrounding pipeline 不是 transaction。

剩余失败模式：

- `pkg.update()` 写 `package.json` 时失败：registry 文件已经落盘。
- `rackJson.update()` 写 `rack.json` 时失败：registry 文件和 `package.json` 可能都已经更新。
- `rk init` 在 pipeline 成功后才写 `rack.json`，如果这一步失败，新项目文件和 `package.json` 已经生成，但 manifest 缺失。

这些失败不常见，但并没有被当前“预检”彻底解决。当前产品决策可以接受“不做完整事务”，但 REVIEW 里的状态应该更精确：它解决的是“损坏 `package.json` 导致的最常见半安装”，不是完整原子性。

建议二选一：

- 如果产品接受残余风险：把 1.8 / 结论里的措辞改成“已通过 preflight 缓解常见失败，不提供完整 transaction”，并把这条作为低频残余风险记录。
- 如果目标是严格原子性：在 apply 前 snapshot `package.json` 和 `rack.json`，把 `pkg.update` / `rackJson.update` 纳入同一个 commit/rollback 流程；任一后置写失败时恢复 manifest/package，并调用 `applyFiles` 的文件 rollback 或统一的 transaction journal。

### 6.6 CLI 内置 help、测试和发布产物仍锁死不可运行示例 ✅ 已解决

位置：

- `apps/cli/src/lib/help/overview.ts`
- `apps/cli/src/lib/commands/add/help.ts`
- `apps/cli/src/lib/commands/init/help.ts`
- `apps/cli/src/lib/commands/add/index.ts`
- `apps/cli/src/lib/commands/init/index.ts`
- `apps/cli/tests/lib/commands/help.test.ts`
- `apps/cli/dist/bin.js`
- `apps/cli/package.json`

  6.3 主要是 docs / README 问题；继续看 CLI 代码后发现运行时 help 也还在展示同一批不存在的官方 registry/preset：

- `overviewHelpText`：`@rack/tailwindcss`、`@rack/vue:ts`、`@presets/tutorial-project`。
- `addHelpText`：`rk add @rack/tailwindcss`、`@rack/tailwindcss@1.2.0`、`@rack/vue:ts`。
- `initHelpText`：`@presets/tutorial-project`、`@presets/nextjs-app`、`@rack/vue:ts`。
- Commander 参数说明：`Registry identifier to add (e.g., @rack/tailwindcss)`。

这不是单纯文档站问题，因为 `rackjs-cli` 的 `package.json` 明确发布 `files: ["dist"]`，`bin.rk` 指向 `./dist/bin.js`；当前 `apps/cli/dist/bin.js` 里也已经包含这些旧示例。也就是说，即使修了 VitePress 文档，如果不修 source + rebuild dist，用户执行 `rk --help` / `rk add --help` / `rk init --help` 仍会复制到 404 命令。

另一个风险是测试把旧文案锁死了：

```ts
expect(help).toContain('$ rk init -t @presets/tutorial-project')
expect(help).toContain('$ rk add @rack/tailwindcss')
```

这会让未来修 help 时必须同步改测试；否则测试的存在反而保护了错误示例。

影响：

- 运行时 CLI help 和文档修复方向不一致，用户最可能看的 `--help` 仍然不可运行。
- 发布包只带 `dist`，如果只改 TS source 不 rebuild，npm 包仍然带旧 help。
- help test 会把错误示例当成预期行为继续固定。

建议：

- 把所有 runtime help 示例换成真实存在的 `@presets/node`、`@presets/node-library`、`@rack/testing/vitest`、`@rack/quality/eslint` 等。
- `--ci` 示例统一补 `-n <name>`。
- `help.test.ts` 改为断言真实官方示例，或只断言语义结构，不断言虚构 identifier。
- 发布前必须重新 `pnpm --filter rackjs-cli build`，确认 `apps/cli/dist/bin.js` 与 source 一致。

### 6.7 Worker 缺少全局异常处理，内部异常会绕过 JSON 错误协议 ✅ 已解决

位置：

- `apps/registry-worker/src/index.ts`
- `apps/registry-worker/src/lib/auth.ts`
- `apps/registry-worker/src/routes/registry.ts`
- `apps/registry-worker/src/routes/namespace.ts`
- `apps/registry-worker/src/lib/response.ts`
- `apps/registry-server/src/plugins/error-handler.ts`

Worker 的 `fetch()` 入口只做 method guard，然后直接：

```ts
const response = await dispatch(request, env)
```

`dispatch()` 外没有 `try/catch`。路由内部不少路径会抛异常，而不是返回 `json(...)`：

- `.auth/auth.json` 存在但 JSON 语法错误时，`obj.json<unknown>()` 会抛。
- `.auth/auth.json` 顶层不是 object 或 namespace policy 结构异常时，`parseAuthConfig(raw)` 可能抛。
- registry latest 路径读取 `versions.json` 时，`readJSON()` 里的 `obj.json<T>()` 可能因为 R2 对象内容损坏而抛。
- R2 的 `bucket.get/list/head` 如果发生运行时错误，也会直接 reject。

Server 侧有 `apps/registry-server/src/plugins/error-handler.ts`，会把未处理异常统一转成 `{ code, message }` JSON，并设置 no-store；Worker 没有等价兜底。结果是同一个“内部错误”在 Server/Worker 上协议不一致：Server 仍然返回 Rack 风格错误体，Worker 可能返回 Cloudflare 平台默认 500，甚至没有 JSON body / `Cache-Control` 头。

影响：

- CLI 依赖 `{ code, message }` 解析错误时，Worker 异常路径可能退化成泛化 HTTP 错误，提示质量下降。
- 受保护 namespace 的 auth 配置一旦损坏，所有相关 Worker 路由可能变成平台级 500，而不是稳定的 Rack error contract。
- Server/Worker parity test 当前覆盖了状态码分歧和正常错误返回，但没有覆盖“路由内部 throw 后顶层兜底”的协议一致性。

建议：

- 在 `fetch()` 中包住 `dispatch()`：

```ts
try {
  const response = await dispatch(request, env)
  ...
} catch (error) {
  console.error(error)
  return json(
    { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
    500
  )
}
```

- 确保该响应使用 `Cache-Control: no-store`，避免错误响应被缓存。
- 增加 Worker 单测：损坏 `.auth/auth.json`、损坏 `versions.json`、mock bucket reject 时，都返回 Rack JSON 错误体。
- 如需完全对齐 Server，可以把 error code/message 规则抽到 `registry-core` 或 Worker 自己的 `error-handler` helper。

### 6.8 `rk init --name` 被当成路径使用，可写出当前工作目录 ✅ 已解决

位置：

- `apps/cli/src/lib/commands/init/index.ts`
- `apps/cli/tests/lib/commands/init/index.test.ts`
- `apps/cli/src/lib/commands/init/help.ts`
- `apps/docs/zh/reference/cli.md`
- `apps/docs/en/reference/cli.md`

CLI 和文档都把 `-n, --name <name>` 描述为“Project name”，但实现直接把它喂给 `path.resolve(cwd, projectName)`：

```ts
const projectName = options.name ?? (await promptProjectName(prompter))
const targetDir = path.resolve(cwd, projectName)
```

`validateTargetDir()` 只检查目标目录是否已经存在，没有检查 `targetDir` 是否仍在 `cwd` 下，也没有检查 `projectName` 是否是单段项目名。因此这些命令都会被接受：

```bash
rk init -t @presets/node -n ../outside --ci
rk init -t @presets/node -n /tmp/outside --ci
```

这会把脚手架写到当前目录之外。更微妙的是，`rack.json` 的 `name` 也来自 `projectName || path.basename(targetDir)`；所以 `-n ../outside` 时 manifest 里的 name 可能就是 `../outside`，它既不是正常项目名，也容易和 `package.json` 的命名语义冲突。

当前测试只覆盖了 `-n demo`、空字符串和 `-n .`，没有覆盖 `..`、带 slash 的名字或绝对路径。`-n .` 被当成“init into cwd”的能力保留了下来，但 docs/help 没有把 `--name` 定义为“target directory/path”。

影响：

- 用户以为 `--name` 只是项目名，输入带路径字符时会意外写到父目录或绝对目录。
- CI 脚本如果拼错变量，例如 `-n "$OUT_DIR"`，可能把生成物写到 workspace 外。
- `rack.json.name` 可能落下包含 `/`、`..` 的值，后续工具展示和校验都会变脏。

建议二选一：

- 如果 `--name` 真的只是项目名：校验它必须是安全单段名称，拒绝 absolute path、`..`、`/`、`\` 和空段；`-n .` 这种 init 当前目录能力可以改成单独选项，或明确保留为唯一特殊值。
- 如果产品想支持输出路径：把选项语义改清楚，例如新增 `--dir <path>` / `--cwd`，文档写明允许路径；同时对绝对路径和逃逸 `cwd` 做二次确认，CI 模式下建议默认拒绝逃逸。
- 无论走哪条，都增加单测覆盖 `../x`、`/tmp/x`、`a/b`、`.` 这几类边界。

### 6.9 CLI 源码运行时找不到 `package.json`，版本和 Node engine 检查会退化 ✅ 已解决

位置：

- `apps/cli/src/lib/utils/version.ts`
- `apps/cli/src/lib/commands/version/index.ts`
- `apps/cli/src/lib/commands/doctor/checks.ts`
- `apps/cli/tests/lib/utils/version.test.ts`

`version.ts` 用相对 `import.meta.url` 的方式找 CLI 自己的 `package.json`：

```ts
const PACKAGE_PATHS = [
  '../package.json', // dist/cli.js   → apps/cli/package.json (production)
  '../../package.json' // src/utils/version.ts → apps/cli/package.json (development)
]
```

但源码文件的真实位置是 `apps/cli/src/lib/utils/version.ts`，不是注释里的 `src/utils/version.ts`。所以源码/开发态下这两个候选路径实际分别指向：

- `apps/cli/src/lib/package.json`
- `apps/cli/src/package.json`

真正存在的是 `apps/cli/package.json`，从 `src/lib/utils` 需要 `../../../package.json`。因此在 source/dev 方式运行 CLI 时，`getPackageJson()` 会走 fallback：

```ts
return { version: '0.0.0' }
```

影响：

- `rk version` 在源码运行模式下可能显示 `0.0.0`，而不是 `apps/cli/package.json` 的真实版本。
- `rk doctor` 的 Node 最低版本来自 `engines.node`；读不到 package 后会退化为 `0.0.0`，等于开发态失去 Node 版本检查。
- 生产 `dist` 当前没暴露这个问题，因为 `dist/bin.js` 的 `../package.json` 能指到 `apps/cli/package.json`；这也让问题更容易被忽略。

当前测试没有锁住真实源码路径。`version.test.ts` 只验证返回值像 semver，或 mock fallback 行为；它没有断言 `src/lib/utils/version.ts` 这一真实布局能读到 app 根目录的 `package.json`。

建议：

- `PACKAGE_PATHS` 补上 `../../../package.json`，或改成从当前文件向上查找最近的 `package.json`。
- 单测要覆盖真实 source layout：期望 `getCliVersion()` 等于 `apps/cli/package.json.version`，`getMinNodeVersion()` 等于 `engines.node` 的 minVersion。
- 注释里的开发路径同步改成 `src/lib/utils/version.ts`，避免后续维护者继续按错误目录理解。

### 6.10 `rack.json.items` 记录请求标识而不是解析后的实际版本，和“不支持升级”语义冲突

位置：

- `apps/cli/src/lib/registry/client.ts`
- `apps/cli/src/lib/pipeline/install-plan.ts`
- `apps/cli/src/lib/pipeline/resolve-dependencies.ts`
- `apps/cli/src/lib/commands/add/index.ts`
- `apps/cli/src/lib/commands/init/index.ts`
- `apps/cli/src/lib/rack-json.ts`
- `apps/cli/tests/lib/commands/add/index.test.ts`
- `apps/cli/tests/lib/pipeline/resolve-dependencies.test.ts`

`fetchItem('@rack/foo')` 在未指定版本时会先读 latest，然后把 `registryUrl` 补成具体版本路径：

```ts
const registryUrl = parsed.version ? url : `${url}/${item.version}`
```

也就是说，本次安装实际应用的是一个确定版本。但返回给 pipeline 的 `identifier` 仍然来自用户请求：

```ts
const canonicalId = formatCanonicalIdentifier(parsed)
...
identifier: canonicalId
```

如果用户请求的是 `@rack/foo`，`canonicalId` 里不会包含服务端返回的 `item.version`。随后 `buildInstallPlan()` 又把它原样写入待记录清单：

```ts
toRecord: toApply.map((item) => item.identifier)
```

最终 `rk add` / `rk init` 写入 `rack.json.items` 的可能是无版本的 `@rack/foo`，而不是实际应用过的 `@rack/foo@1.0.0`。

这和当前“Rack 不支持 upgrade”的产品决策有冲突：如果不支持升级，manifest 反而更需要保存“已经应用到磁盘的是哪个确切版本”。现在会出现两个副作用：

- 用户第一次 `rk add @rack/foo` 实际装了 latest `1.0.0`，但 `rack.json` 只知道 `@rack/foo`。以后 `rk add @rack/foo@1.0.0` 会因为“已安装无版本、请求有版本”被当成 `VERSION_MISMATCH`，即使磁盘上很可能就是 `1.0.0`。
- `buildInstallPlan()` 会用 `registry.fetchItems(installedRegistries)` 拉取已安装项做冲突检查。无版本的 installed entry 会重新解析成“当前 latest”，可能不是当初写入磁盘的版本；如果远端 latest 变了，冲突检查和依赖判断就会基于一个没有真正安装过的 registry manifest。

当前测试甚至把这个不确定性固化成预期：

- `add/index.test.ts` 有 “installed has no version but request pins one → errors out”。
- `resolve-dependencies.test.ts` 有 “installed is unpinned and transitive dep pins a version → throws”。

这些测试的注释说“installed version is unknown”，但这个 unknown 是 CLI 自己写 manifest 时丢掉的；服务端返回过 `item.version`，只是没有持久化。

建议：

- `ResolvedRegistryItem` 增加 `resolvedIdentifier`，未 pin 时用服务端 `item.version` 补成 `@ns/path@version(:lang)`；`toRecord` 写 resolved identifier。
- 如果仍想保留用户输入，可在 `rack.json` 里分开存 `requested` 和 `resolved`，但后续幂等、冲突、版本比较应以 resolved 为准。
- 迁移策略：读取旧的无版本 `rack.json.items` 时，可以维持当前保守 `VERSION_MISMATCH`，但新写入的 manifest 不应再产生无版本 installed entry。
- 对应调整 `add/index.test.ts` / `resolve-dependencies.test.ts`：新安装无版本请求后，manifest 应包含解析后的版本；只有旧 manifest 的无版本项才需要走“unknown version”保守错误。

### 6.11 e2e registry 发现逻辑不支持 SemVer build metadata，合法版本会被漏测

位置：

- `apps/e2e/src/discover.ts`
- `apps/e2e/tests/materials.test.ts`
- `apps/e2e/tests/presets.test.ts`
- `packages/registry-core/src/constants.ts`
- `packages/storage/schema/registry-item.json`

项目的共享 SemVer 规则明确支持 build metadata，例如 `1.0.0+build.42`：

```ts
export const SEMVER_PATTERN = /... (?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
```

`registry-item.json` 的 schema 也按同一规则允许 build metadata。Server / R2 上传代码也已经考虑过 `1.0.0+build.42` 这类目录，避免 rollback 时误删相邻版本。

但 e2e 的 material discovery 自己写了一份更窄的正则：

```ts
const SEMVER = /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/
```

它只支持普通版本和 prerelease，不支持 `+build`。如果 `packages/storage` 以后新增合法目录 `1.0.0+build.42/registry.json`，`discoverRegistries()` 不会把它当成版本目录，而是继续递归，把 `1.0.0+build.42` 当作 registry path segment 的一部分。因为下面通常没有再嵌套一个 semver 目录，这个 registry 最终会从 `materials.test.ts` / `presets.test.ts` 的真实安装覆盖里消失。

影响：

- e2e 名义上是“every @rack/\* registry is installable”，但对 schema/协议允许的 build metadata 版本并不成立。
- 官方 storage 一旦使用 build metadata，测试不会失败，反而会静默漏掉该 material。
- 这属于测试工程和共享协议源不一致，不是当前 storage 数据的即时线上故障；当前仓库里暂时没有 `+build` 版本目录。

建议：

- `apps/e2e/src/discover.ts` 直接从 `@rack/registry-core` 引入 `SEMVER_PATTERN`，不要维护第二份 SemVer 正则。
- 增加一个 fixture 或临时目录单测，目录名为 `1.0.0+build.42`，断言 `discoverRegistries()` 能发现它。
- 如果产品决定 storage 目录永远不用 build metadata，那也应把 schema / registry-core / server 测试里的支持面收窄，避免协议层和 e2e 层长期不一致。

### 6.12 Registry Server 在 `debug` / `trace` 日志级别会记录完整认证头 ⏭️ 不修复

位置：

- `apps/registry-server/src/plugins/request-logger.ts`
- `apps/registry-server/src/constants.ts`
- `apps/registry-server/README.md`

`SENSITIVE_HEADERS` 已经列出了应该打码的请求头：

```ts
export const SENSITIVE_HEADERS = [
  'cookie',
  'set-cookie',
  'authorization',
  'x-registry-token',
  'proxy-authorization'
]
```

但 request logger 在 `debug` / `trace` 时会完全跳过打码：

```ts
const showFull = VERBOSE_LEVELS.has(app.log.level)

const headers = showFull
  ? request.headers
  : redactHeaders(...)
```

这意味着只要生产排障时把 `LOG_LEVEL=debug` 或 `trace` 打开，所有 `Authorization: Bearer ...`、`X-Registry-Token`、Cookie 以及 admin token 都会原样进入应用日志。Registry Server 的 README 只说 `LOG_LEVEL` 是普通日志级别开关，没有提示 debug/trace 会泄露认证材料。

影响：

- Namespace token 和 admin token 都是长期凭证；一旦日志被集中采集、转储或给第三方排障人员查看，凭证会直接暴露。
- 上传和只读接口都会经过 `onRequest`，所以读 token / publish token / admin token 都受影响。
- 当前没有测试覆盖 request logger 的打码行为；未来改动也不容易被发现。

建议：

- 敏感头在所有日志级别都默认打码；debug/trace 只增加非敏感上下文。
- 如果确实需要排障时看完整 headers，应增加显式高风险开关，例如 `LOG_UNREDACTED_HEADERS=true`，并在 README 标注只能本地临时使用。
- 增加单测：`LOG_LEVEL=debug` 时 `authorization` / `x-registry-token` 仍为 `[REDACTED]`。

## 结论

当前项目的主干实现质量不错，测试覆盖也很扎实；前面记录的问题大多已经闭环。但这轮继续按 `apps/cli`、`apps/docs`、`apps/e2e`、`apps/registry-server`、`apps/registry-worker` 顺序深挖后，仍有几类需要处理的残留问题：CI 顺序下 lint 会失败（6.1）、preset root 去重会静默吞掉版本/语言冲突（6.2）、文档和 CLI runtime help 仍有不可运行的官方示例（6.3 / 6.6）、官方 registry 数据缺少自动发布到 R2 的链路（6.4）、pipeline 原子性只能算预检缓解而非完整事务（6.5）、Worker 内部异常缺少统一 JSON 兜底（6.7）、`rk init --name` 的项目名/路径语义不清且可写出当前目录（6.8）、CLI 源码运行态版本读取路径错误（6.9）、`rack.json.items` 丢失实际解析版本（6.10）、e2e SemVer 发现规则漏掉 build metadata（6.11），以及 Server debug/trace 日志可能泄露认证头（6.12）。建议优先修 6.1 / 6.2 / 6.7 / 6.8 / 6.10；6.3 / 6.6 应作为用户可复制示例的一组问题一起收敛；6.5 至少需要把产品决策和文档措辞收准确；6.9 / 6.11 属于开发态和测试覆盖问题，适合顺手补测试一起收掉；6.4（官方 registry 自动同步链路）与 6.12（debug/trace 日志记录认证头）经评估暂不修复。其余已解决项的优先级记录如下：

1. ~~修复或明确 CLI 的已安装依赖跳过~~（1.1 已解决）、~~版本升级语义~~（1.3 已解决，明确不支持 upgrade）、~~语言传播~~（1.2 已解决）。
2. ~~修复 npm 版本 range 兼容解析~~（1.7 已解决，subset 优先 + AND-join 兜底；~~`package.json` 跨多次 add 的依赖归类去重已在 1.5 解决~~；~~明确自动安装使用哪个 package manager~~ 1.6 已解决，默认只支持 npm）。
3. ~~前置 `package.json` 损坏预检，避免最常见半安装~~（1.8 通过 preflight 部分缓解：apply 前先 `pkg.read` 验证 `package.json` 可解析；5.1 已解决，引入显式 `InstallPlan` 收敛角色）。完整 install transaction（plan/rollback 覆盖 registry 文件 + `package.json` + `rack.json`）仍未实现，作为低频残余风险记录在 6.5。
4. ~~统一 Server/Worker 的 Admin Token 读权限~~（2.1 已解决，Server 与 Worker 都对 admin token 跳过命名空间认证）、~~非法 URL path 状态码~~（2.2 已解决，parser 字段校验 + Worker decode 对齐）。
5. 收敛中文文档示例、schema 示例和 CLI 实际能力（~~`files[].target` schema/runtime 差异已在 3.4 决议保留现状，runtime 守卫即单一事实来源~~；~~`--ci -n` 语义已在 3.5 解决~~；~~`--force` 文案在 3.3 解决~~）。
6. ~~补齐 CI/docs build~~（4.3 已解决）、~~Worker shared packages 部署触发~~（4.4 已解决）、~~R2 schema/preset 同步~~（4.6 已解决），以及 Docker 手动运行 env。
7. ~~整理 lint/typecheck/Husky 脚本，让工程约定和命令实际一致~~（4.1 / 4.2 已解决）。
8. ~~明确远程 custom merge 插件的能力边界，或补齐多文件插件支持~~（1.4 已解决，走"收文档 + 加清理"，不支持多文件插件）。

## 解决记录

| 问题                                                   | 状态        | Commit             | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------ | ----------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 已安装依赖被重新应用                               | ✅ 已解决   | `90be73e`          | `resolveRegistryDependencies` 加 `installed` 参数跳过已装 transitive deps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 1.2 `:js`/`:ts` 后缀未传播                             | ✅ 已解决   | `55db008`          | `fetchItem` 返回 `resolvedLanguage`，deps/apply 按 parent 语言；`rk init` 抽 `:language` 持久化到 `rack.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 1.3 版本维度未参与已装判定                             | ✅ 已解决   | `cb4b964`          | 同 canonical + 不同版本时抛 `VERSION_MISMATCH`。产品决策：不支持 upgrade 语义                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 3.1 priority 文档多参数 `rk add` 示例                  | ✅ 已解决   | `13d4413`          | zh/en `priority.md` 改成多次 `rk add`，补一句说明 CLI 单参数语义                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 3.2 `conflicts` 示例用 schema 不接受的 range           | ✅ 已解决   | `a78a240`          | zh/en `registry-item.md` 改为精确 semver `frameworks/react@18.0.0`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 1.6 自动安装依赖固定 `npm install`                     | ✅ 已解决   | `796258c`          | zh/en `registry.md` 删除 "或 `pnpm install`"，与 CLI 实际行为一致。产品决策：默认只支持 npm                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 4.3 CI 没有验证文档站构建                              | ✅ 已解决   | `872a67f`          | `apps/docs` 增加 `build` 脚本（alias `vitepress build`），`turbo.json` build outputs 加入 `.vitepress/dist/**`；`pnpm build` 现在覆盖文档站                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 5.2 文档示例使用了仓库不存在的 registry/preset         | ✅ 已解决   | `4ec5b3d`          | 根 `README.md`、zh/en `getting-started.md` 与 `what-is-rack.md` 假示例替换为真存在的 `@presets/node` / `@rack/testing/vitest` / `quality/eslint` 等                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 4.6 Worker R2 schema/preset 无自动同步                 | ✅ 已解决   | `8e711e0`          | 新增 `sync-storage.yml` 同步 schema 与 presets 到 R2（`aws s3 sync --delete`），并在 `deploy-worker.yml` post-deploy 加 `/schemas` + `/presets` smoke check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 4.4 Worker 部署不监听共享包变更                        | ✅ 已解决   | `4f58aa1`          | `deploy-worker.yml` paths 增加 `packages/auth-core/**`、`packages/registry-core/**`、`pnpm-lock.yaml`；storage/schema 故意没加，已由 registry-core 路径覆盖                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 5.3 Server/Worker 协议一致性矩阵测试                   | ✅ 已解决   | `625b59e`          | 新增 `apps/e2e/tests/server-worker-parity.test.ts` + `apps/e2e/src/parity.ts`，20 个 case 同时喂给 Fastify inject 和 Worker fetch；§2.1 / §2.2 divergence 用 per-runtime `SplitExpectation` 锁定                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 4.1 `pnpm lint` 不是 ESLint，Husky hooks 缺失          | ✅ 已解决   | `363bbc8`          | 拆分 `typecheck`/`lint`/`format`：各包 lint→typecheck，新 lint=`eslint .`；根加 `pnpm typecheck`(turbo)/`pnpm lint`/`pnpm format:check`；补 `.husky/pre-commit`+`commit-msg`；新 `.prettierignore`；CI 接入三个新检查                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 4.2 Root `tsc --noEmit` 没检查源码                     | ✅ 已解决   | `363bbc8`          | 与 4.1 同 PR。走 turbo 路线：`pnpm typecheck` = `turbo typecheck`，每个包跑自己的 `tsc --noEmit`；cli + server tsconfig 补 `noUnusedLocals`/`noUnusedParameters` 与其他 4 包对齐；CLAUDE.md 假阳性命令换成 `pnpm typecheck`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 3.5 `--ci` 与 `-n` 要求 help 与实现不一致              | ✅ 已解决   | `4d535aa`          | `rk init` 在 `ci && !options.name` 时早退抛 `VALIDATION_ERROR`；help text 与 zh/en `cli.md` 明确"requires `-n`"，新增缺 `-n` 的失败路径单测                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 4.5 Docker 手动运行缺默认 env                          | ✅ 已解决   | `803d5ff`          | Dockerfile runtime stage `ENV` 加 `STORAGE_ROOT=/data`、`SCHEMA_DIR=/app/schema`、`AUTH_CONFIG_PATH=/app/config/auth.json`、`WEBHOOK_CONFIG_PATH=/app/config/webhooks.json`；裸 `docker run` 无需 `-e` 即可启动。docker compose 不受影响（compose `environment` 仍覆盖且值等价）。README + zh/en `methods.md` 示例同步重写为从仓库根目录运行的标准形式                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2.1 Server `/registries/*` 不支持 admin token 读绕过   | ✅ 已解决   | `b135929`          | `registry.route.ts` 在 namespace whitelist 后加 `if (!request.isAdminToken())` 包住 `verifyNamespaceAccess`，与 `namespace.route.ts` / `upload.route.ts` 的 admin-bypass 模式一致；Server README + `Config.adminToken` JSDoc + zh/en `configuration.md` 改为"读写都跳过命名空间级认证"；新增 registry route 单测；e2e parity §2.1 split expectation 收敛为共享 `{ status: 200 }`                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2.2 Registry URL 路径校验分散，状态码不一致            | ✅ 已解决   | `9abee8a`          | `@rack/registry-core` 加 `NAMESPACE_PATTERN` + `PATH_SEGMENT_PATTERN`，parser 各分支落地字段校验，filePath 复用 `validateFilePath`；非法字段 → 400 `INVALID_PATH`，资源不存在 → 404 `NOT_FOUND`。Worker `/registries/*` 入口加 `decodeURIComponent` + try/catch 与 Fastify path-param decode 对齐。e2e parity §2.2 由 `SplitExpectation` 收敛为共享 200，并新增 traversal / uppercase namespace / uppercase segment 三条共享 400 cases；parser 单测 +11、worker `index.test.ts` +3                                                                                                                                                                                                                                                                                                                                                 |
| 3.3 `--force` 文案与实际语义不符                       | ✅ 已解决   | `444b26d`          | 走"改文案"分支：CLI 行为不动；`init/index.ts` 的 `force?` JSDoc、Commander option 描述、`validateTargetDir` 错误信息全部从"force overwrite"改成"allow init into an existing directory (no cleanup)"；`init/help.ts` 示例注释 + 新增 Notes 一条说明 per-file 冲突仍由各 Registry merge strategy 处理；zh/en `cli.md` 与 `apps/cli/README.md` 的 `-f, --force` 行同步重写。产品决策：不内置破坏性清理，避免对 git 未提交内容造成不可恢复的删除                                                                                                                                                                                                                                                                                                                                                                                       |
| 1.4 远程 custom merge 插件单文件限制 + 临时目录无清理  | ✅ 已解决   | `fa62e0c`          | 走"收文档 + 加清理"分支：`plugin-loader.ts` 用 `mkdtemp` 替代 `mkdir + Date.now()`，嵌套 `try/finally` + `rm(tempDir, { recursive: true, force: true })` 让成功/失败路径都清理（嵌套结构规避 catch-always-throws 不可达分支的覆盖率漏点），下载 helper 改名 `downloadRemotePlugin` 并接收 caller-owned tempDir；zh/en `file-merge.md` 的"插件路径"段写明远程必须自包含单文件、不递归下载相对 import、临时目录自动清理；新增两条 readdir-snapshot 测试覆盖清理。产品决策：不实现多文件插件支持，custom merge plugin 保持"单文件零依赖"约束                                                                                                                                                                                                                                                                                          |
| 3.4 Schema 没有限制 `files[].target`                   | ✅ 已解决   | PR #52 / `250bbe4` | 走"保留现状"分支。CLI 侧 `apply.ts` 的 `resolveWithinTarget()` 早已在 apply 阶段用 `path.resolve` + `path.relative` 拒绝任何逃逸 `targetDir` 的 target（`..` / 绝对路径 → `PathTraversalError`），同 PR 配 error-hints 与单测。恶意 registry 即使通过 Server schema/upload 也会在 `rk add` 必然 fail，无真实安全/数据风险。产品决策：不再加 Server schema 校验，避免与 runtime 守卫产生双源                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 1.5 `package.json` 跨多次 add 双字段依赖               | ✅ 已解决   | `09f3623`          | "runtime wins"跨字段规则下沉到 `pkg.update` 写回前：合并 incoming `dependencies` 时把同名包从 `current.devDependencies` 删除（dev→runtime 升级）；合并 incoming `devDependencies` 时如果 `current.dependencies` 已有同名包，把版本写到 runtime 而非 dev（runtime placement 不被降级）。清理空对象避免 `"devDependencies": {}` 落盘。新增 2 条 pkg.test.ts case 覆盖两条新分支；既有 case 顺带覆盖清理路径。CLI 100% 覆盖率保持                                                                                                                                                                                                                                                                                                                                                                                                     |
| 1.7 npm 版本兼容解析返回过宽 range                     | ✅ 已解决   | `322da6a`          | `findCompatibleVersion` 在 max-min 兼容性检测后改为：先用 `semver.subset` 找一个被所有其它 range 包含的最窄 range（`^3.4.0 + ^3.3.0` → `^3.4.0`），找不到时用 `unique.join(' ')` 按 npm AND 语法拼接（`^1.0.0 + <1.5.0` → `^1.0.0 <1.5.0`），让包管理器同时强制每条原始约束，根治"返回单一来源 range 导致上限丢失"。zh/en `dependency.md`"版本兼容"段重写为"保留所有约束的交集"并补 AND 语法解释。`resolve-versions.test.ts` 新增 6 条 case：`^X + <Y` AND-join、`>=X + <Y` AND-join、三 range 全无包含关系的 AND-join、subset 命中（3 个 range 中 1 个最窄）、exact version 作为最窄 range；既有 caret 子集 case 仍走 subset 分支保留可读输出。CLI 100% 覆盖率保持                                                                                                                                                                |
| 1.8 Pipeline 原子性没覆盖 `package.json` / `rack.json` | 🟡 部分缓解 | PR #91 / `f6edecd` | 走"预检前置"分支：`pkg.ts` 抽出 `pkg.read(projectDir)` 返回 `PackageJson \| null`，损坏抛 `PackageJsonInvalidError`；`pkg.update` 内部改用它。新增 `pipeline/preflight.ts` 暴露 `preflight(targetDir)`，目前只做一件事 —— 调用 `pkg.read` 把"package.json 坏掉"前置到 `applyFiles` 之前。`add/pipeline.ts` 与 `init/pipeline.ts` 在 plan 后、apply 前插入 `await preflight(targetDir)`。`rack.json` 不预检：add 路径 `readOrCreate` 已在 pipeline 前跑，init 时 `rack.json` 尚不存在。产品决策：不引入覆盖三者的完整 install transaction，只兜最常见真实失败。新增 6 条单测覆盖 preflight + pkg.read + 顺序断言。CLI 100% 覆盖率保持。完整原子性（覆盖 registry 文件 + `package.json` + `rack.json` 的 plan/rollback）作为低频残余风险记录在 6.5，未实现                                                                           |
| 5.1 依赖解析与安装计划可以显式建模                     | ✅ 已解决   | PR #91 / `f6edecd` | `pipeline/types.ts` 新增 `InstallPlan` interface（5 字段：requested / resolvedDependencies / alreadyInstalled / toApply / toRecord）。新增 `pipeline/install-plan.ts` 暴露 `buildInstallPlan({ requested, installedRegistries, language, logger })`，集中干 4 件事：BFS transitive deps（带已装跳过）、fetch 已装 items（反向 conflict 用）、`validateNoConflicts` 跨 new+installed、`sortItems` 拓扑排序；原 add/pipeline 里的 `warnDegradedConflictCheck` + `pluralize` 一并迁过来。`add/pipeline.ts` 与 `init/pipeline.ts` 都瘦身为 6 步：fetch root → buildInstallPlan → preflight → applyFiles → resolveDependencies → pkg.update，所有角色判断从 plan 字段直接取，pipeline 层不再维护四个平行数组。新增 `tests/lib/pipeline/install-plan.test.ts`（9 case），既有 add/init pipeline 集成测试全部仍 pass。CLI 100% 覆盖率保持 |
