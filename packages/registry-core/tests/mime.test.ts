import { it, expect, describe } from 'vitest'
import { mimeType } from '../src/mime.js'

describe('mimeType', () => {
  it.each([
    ['index.ts', 'text/typescript'],
    ['App.tsx', 'text/typescript'],
    ['app.js', 'text/javascript'],
    ['app.jsx', 'text/javascript'],
    ['esm.mjs', 'text/javascript'],
    ['cjs.cjs', 'text/javascript'],
    ['styles.css', 'text/css'],
    ['index.html', 'text/html'],
    ['readme.md', 'text/markdown'],
    ['logo.svg', 'image/svg+xml'],
    ['config.yaml', 'text/yaml'],
    ['config.yml', 'text/yaml'],
    ['data.json', 'application/json'],
    ['photo.png', 'image/png'],
    ['photo.JPG', 'image/jpeg']
  ])('%s → %s', (path, expected) => {
    expect(mimeType(path)).toBe(expected)
  })

  it('handles paths with directories', () => {
    expect(mimeType('src/components/App.ts')).toBe('text/typescript')
  })

  it('returns application/octet-stream for unknown extensions', () => {
    expect(mimeType('blob.xyz')).toBe('application/octet-stream')
  })

  it('returns application/octet-stream when there is no extension', () => {
    expect(mimeType('Makefile')).toBe('application/octet-stream')
  })

  it('is case-insensitive on the extension', () => {
    expect(mimeType('App.TSX')).toBe('text/typescript')
  })
})
