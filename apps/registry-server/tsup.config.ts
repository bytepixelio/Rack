import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  dts: false,
  tsconfig: './tsconfig.json',
  clean: true,
  shims: true,
  noExternal: ['@rack/auth-core']
})
