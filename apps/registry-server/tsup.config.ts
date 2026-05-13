import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  dts: false,
  tsconfig: './tsconfig.json',
  clean: true,
  shims: true,
  // Both workspace packages ship as raw TS source (no published build
  // artifact), so they must be bundled into dist/server.js. Otherwise
  // `node dist/server.js` would try to import `.ts` files via Node's
  // ESM resolver, which doesn't rewrite `.js` → `.ts` and breaks the
  // R2-mode smoke check (§6.17 regressed this when registry-core was
  // moved from devDependencies to dependencies).
  noExternal: ['@rack/auth-core', '@rack/registry-core']
})
