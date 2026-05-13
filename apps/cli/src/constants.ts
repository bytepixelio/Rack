/**
 * Project-level constants.
 *
 * If you are forking Rack, these are the values you most likely
 * want to change first: your default namespace and registry URL.
 */

/** Default namespace for registry identifiers. */
export const DEFAULT_NAMESPACE = '@rack'

/**
 * Reserved namespace for preset bundles.
 *
 * Presets live at `/presets/<name>` on the registry root, not under a
 * separate namespace path, but the CLI surfaces them as `@presets/<name>`
 * for symmetry with registry identifiers. The default rackrc pins this
 * namespace to {@link DEFAULT_REGISTRY_URL} so `rk init -t @presets/...`
 * works without explicit `rk config set @presets`.
 */
export const PRESETS_NAMESPACE = '@presets'

/** Default registry server URL. */
export const DEFAULT_REGISTRY_URL = 'https://registry.rackjs.com'
