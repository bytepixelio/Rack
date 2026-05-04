import { describe, it, expect } from 'vitest'
import {
  envMerge,
  jsonMerge,
  ignoreMerge,
  overwriteMerge
} from '../../../../src/lib/pipeline/merge/strategies.js'
import { mergeInternals } from '../../../../src/lib/pipeline/merge/index.js'
import { MergeError } from '../../../../src/lib/utils/errors.js'

describe('merge/strategies jsonMerge', () => {
  it('deep-merges two JSON objects', () => {
    const res = jsonMerge({
      filePath: 'pkg.json',
      currentContent: '{"name":"a","scripts":{"dev":"old"}}',
      incomingContent: '{"version":"1","scripts":{"build":"new"}}'
    })
    const parsed = JSON.parse(res.content)
    expect(parsed).toEqual({
      name: 'a',
      version: '1',
      scripts: { dev: 'old', build: 'new' }
    })
  })

  it('deduplicates array values using deep equality', () => {
    const res = jsonMerge({
      filePath: 'pkg.json',
      currentContent: '{"keywords":["a","b"]}',
      incomingContent: '{"keywords":["b","c"]}'
    })
    expect(JSON.parse(res.content).keywords).toEqual(['a', 'b', 'c'])
  })

  it('treats null current content as an empty object', () => {
    const res = jsonMerge({
      filePath: 'x.json',
      currentContent: null,
      incomingContent: '{"a":1}'
    })
    expect(JSON.parse(res.content)).toEqual({ a: 1 })
  })

  it('throws MergeError for invalid JSON input', () => {
    expect(() =>
      jsonMerge({
        filePath: 'x.json',
        currentContent: '{bad',
        incomingContent: '{}'
      })
    ).toThrow(MergeError)
  })

  it('throws MergeError when inputs are not plain objects', () => {
    expect(() =>
      jsonMerge({
        filePath: 'x.json',
        currentContent: '[1, 2]',
        incomingContent: '{}'
      })
    ).toThrow(MergeError)
  })

  it('returns changed=false when pretty-printed result matches current', () => {
    const pretty = `{\n  "a": 1\n}\n`
    const res = jsonMerge({
      filePath: 'x.json',
      currentContent: pretty,
      incomingContent: '{}'
    })
    expect(res.changed).toBe(false)
  })

  it('scalar incoming value overrides array existing value', () => {
    const res = jsonMerge({
      filePath: 'x.json',
      currentContent: '{"a":[1,2]}',
      incomingContent: '{"a":"str"}'
    })
    expect(JSON.parse(res.content).a).toBe('str')
  })
})

describe('merge/strategies ignoreMerge', () => {
  it('appends unique entries preserving ordering', () => {
    const res = ignoreMerge({
      filePath: '.gitignore',
      currentContent: 'node_modules\n',
      incomingContent: 'dist\n\nnode_modules\n'
    })
    expect(res.content).toBe('node_modules\ndist\n')
  })

  it('uses incoming content when current is null', () => {
    const res = ignoreMerge({
      filePath: '.gitignore',
      currentContent: null,
      incomingContent: 'a\n'
    })
    expect(res.content).toBe('a\n')
  })

  it('does not duplicate trailing blank lines', () => {
    const res = ignoreMerge({
      filePath: '.gitignore',
      currentContent: 'a\n\n',
      incomingContent: '\n\nb\n'
    })
    expect(res.content).toBe('a\n\nb\n')
  })

  it('returns changed=false when content is unchanged', () => {
    const res = ignoreMerge({
      filePath: '.gitignore',
      currentContent: 'a\n',
      incomingContent: 'a\n'
    })
    expect(res.changed).toBe(false)
  })
})

describe('merge/strategies overwriteMerge', () => {
  it('replaces the existing content verbatim', () => {
    const res = overwriteMerge({
      filePath: 'x.txt',
      currentContent: 'old\n',
      incomingContent: 'new'
    })
    expect(res.content).toBe('new\n')
    expect(res.changed).toBe(true)
  })

  it('returns changed=false when incoming equals current', () => {
    const res = overwriteMerge({
      filePath: 'x.txt',
      currentContent: 'same\n',
      incomingContent: 'same\n'
    })
    expect(res.changed).toBe(false)
  })
})

describe('merge/strategies envMerge', () => {
  it('updates existing keys in place and appends new keys', () => {
    const res = envMerge({
      filePath: '.env',
      currentContent: 'FOO=one\n# note\n',
      incomingContent: 'FOO=two\nBAR=three\n'
    })
    expect(res.content).toBe('FOO=two\n# note\nBAR=three\n')
  })

  it('appends comment lines from incoming content', () => {
    const res = envMerge({
      filePath: '.env',
      currentContent: 'A=1\n',
      incomingContent: '# header\nB=2\n'
    })
    expect(res.content.includes('# header')).toBe(true)
    expect(res.content.includes('B=2')).toBe(true)
  })

  it('does not append consecutive blank lines', () => {
    const res = envMerge({
      filePath: '.env',
      currentContent: 'A=1\n\n',
      incomingContent: '\n\nB=2\n'
    })
    expect(res.content).toBe('A=1\n\nB=2\n')
  })

  it('indexes bare KEY lines for re-assignment', () => {
    const res = envMerge({
      filePath: '.env',
      currentContent: 'FOO\n',
      incomingContent: 'FOO=1\n'
    })
    expect(res.content).toBe('FOO=1\n')
  })

  it('returns changed=false when no keys differ', () => {
    const res = envMerge({
      filePath: '.env',
      currentContent: 'A=1\n',
      incomingContent: 'A=1\n'
    })
    expect(res.changed).toBe(false)
  })
})

describe('merge/strategies internals', () => {
  it('exposes hasTrailingBlankDuplicate helper through mergeInternals', () => {
    expect(mergeInternals.hasTrailingBlankDuplicate(['a', ''])).toBe(true)
    expect(mergeInternals.hasTrailingBlankDuplicate(['a'])).toBe(false)
    expect(mergeInternals.hasTrailingBlankDuplicate([])).toBe(false)
  })
})
