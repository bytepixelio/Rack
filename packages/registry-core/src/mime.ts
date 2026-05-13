/**
 * Shared MIME type derivation for template files.
 *
 * Server and Worker used to maintain two independent maps: the Server
 * called `mime-types` and overrode `.ts` to `text/typescript`, while
 * the Worker hard-coded its own map that returned `text/plain` for
 * TypeScript/JSX files. The same `/registries/.../files/src/index.ts`
 * URL therefore answered with different `Content-Type` headers
 * depending on which runtime served it (§6.17), breaking the Worker
 * README's "mirrors the read-only Server API" promise.
 *
 * Centralizing the table here keeps both runtimes byte-aligned: the
 * Server's `getMimeType` and the Worker's `mimeType` both delegate to
 * {@link mimeType} below, so any future extension lands in one place.
 *
 * Coverage targets the file shapes a registry actually ships:
 *   - source: js / ts / jsx / tsx / mjs / cjs
 *   - styles: css / scss / less
 *   - markup: html / svg
 *   - data:   json / yaml / yml / toml / xml
 *   - docs:   md / txt
 *   - fonts:  woff / woff2 / ttf / otf
 *   - images: png / jpg / jpeg / gif / webp / ico
 *
 * Unknown extensions return `application/octet-stream` (RFC 7231 §3.1.1.5).
 */

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Look up the Content-Type for a path or filename.
 *
 * Case-insensitive on the extension. Paths with no extension fall
 * through to the default. Behavior is intentionally deterministic and
 * library-free so the Server (Node + `mime-types`) and the Worker
 * (Cloudflare, no Node built-ins) emit byte-identical headers.
 *
 * @param path - File path or bare filename
 * @returns Content-Type string. Defaults to `application/octet-stream`.
 *
 * @example
 * mimeType('src/index.ts')   // → 'text/typescript'
 * mimeType('readme.md')      // → 'text/markdown'
 * mimeType('app.tsx')        // → 'text/typescript'
 * mimeType('blob.bin')       // → 'application/octet-stream'
 */
export function mimeType(path: string): string {
  const dot = path.lastIndexOf('.')
  if (dot === -1) return DEFAULT_MIME
  const ext = path.slice(dot + 1).toLowerCase()
  return MIME_TYPES[ext] ?? DEFAULT_MIME
}

// ─── Internal ────────────────────────────────────────────────────────

const DEFAULT_MIME = 'application/octet-stream'

/**
 * Extension → Content-Type table.
 *
 * Keep this map sorted by category (code, style, markup, data, docs,
 * fonts, images) so additions land alongside their peers. Don't
 * collapse `tsx` into `text/plain` — VS Code, editors-in-browser, and
 * CDN previews use `text/typescript` to enable highlighting.
 */
const MIME_TYPES: Record<string, string> = {
  // source
  js: 'text/javascript',
  cjs: 'text/javascript',
  mjs: 'text/javascript',
  jsx: 'text/javascript',
  ts: 'text/typescript',
  tsx: 'text/typescript',

  // styles
  css: 'text/css',
  scss: 'text/x-scss',
  less: 'text/x-less',

  // markup
  html: 'text/html',
  svg: 'image/svg+xml',

  // data
  json: 'application/json',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  toml: 'text/toml',
  xml: 'application/xml',

  // docs
  md: 'text/markdown',
  txt: 'text/plain',

  // fonts
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',

  // images
  png: 'image/png',
  gif: 'image/gif',
  ico: 'image/x-icon',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp'
}
