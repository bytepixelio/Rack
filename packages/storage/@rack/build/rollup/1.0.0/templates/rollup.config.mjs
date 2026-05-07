import { defineConfig } from 'rollup'
import json from '@rollup/plugin-json'
import clean from 'rollup-plugin-delete'
import babel from '@rollup/plugin-babel'
import commonjs from '@rollup/plugin-commonjs'
import { DEFAULT_EXTENSIONS } from '@babel/core'
import typescript from 'rollup-plugin-typescript2'
import externals from 'rollup-plugin-node-externals'
import { DEFAULTS, nodeResolve } from '@rollup/plugin-node-resolve'

export default defineConfig({
  input: 'src/index.ts',
  output: [{
    format: 'cjs',
    sourcemap: true,
    file: './dist/index.cjs'
  }, {
    format: 'es',
    sourcemap: true,
    file: './dist/index.js'
  }],
  plugins: [
    clean({ targets: ['dist/*', 'types/*'] }),
    externals({ deps: true }),
    nodeResolve({
      extensions: [...DEFAULTS.extensions, '.ts', '.tsx']
    }),
    commonjs(),
    json(),
    typescript({ useTsconfigDeclarationDir: true }),
    babel({
      babelHelpers: 'runtime',
      exclude: '**/node_modules/**',
      extensions: [...DEFAULT_EXTENSIONS, '.ts', '.tsx']
    })
  ]
})
