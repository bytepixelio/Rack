import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/bin.ts'],
  format: ['esm'],
  dts: false,
  tsconfig: './tsconfig.json',
  clean: true,
  shims: true,
  outDir: 'dist',
  minify: true,
  bundle: true,
  splitting: false,
  platform: 'node',
  target: 'node22',
  treeshake: true,
  sourcemap: false
})
