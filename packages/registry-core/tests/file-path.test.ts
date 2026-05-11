import { it, expect, describe } from 'vitest'
import { validateFilePath, FILE_PATH_PATTERN } from '../src/file-path.js'

describe('validateFilePath', () => {
  it.each([
    ['templates/app.vue'],
    ['./templates/app.vue'],
    ['.eslintrc.json'],
    ['@types/index.d.ts'],
    ['src/lib/my-file.ts'],
    ['a+b.txt'],
    ['src/components/Button.tsx']
  ])('accepts %s', (p) => {
    const result = validateFilePath(p)
    expect(result.normalized).toBeTruthy()
    expect(result.segments.length).toBeGreaterThan(0)
  })

  it('strips leading ./ prefix', () => {
    expect(validateFilePath('./templates/app.vue').normalized).toBe(
      'templates/app.vue'
    )
  })

  it.each([
    ['../evil', 'traversal'],
    ['.', 'single dot segment'],
    ['..', 'double dot segment'],
    ['./..', 'dot-slash then double-dot'],
    ['./.', 'dot-slash then single-dot'],
    ['templates/../evil', 'mid-path traversal'],
    ['templates/./evil', 'mid-path single-dot'],
    ['/absolute', 'absolute path'],
    ['', 'empty string'],
    ['./', 'bare dot-slash'],
    ['templates//double', 'empty segment'],
    ['templates/ space', 'space in segment'],
    ['templates/%2e/evil', 'percent-encoded dot'],
    ['templates/a?b', 'query character'],
    ['templates/a#b', 'fragment character'],
    ['templates\\evil', 'backslash'],
    ['templates/%ZZ/file', 'malformed percent'],
    ['templates/%80/file', 'invalid UTF-8 percent'],
    ['templates/a%2fb', 'encoded slash']
  ])('rejects %s (%s)', (p) => {
    expect(() => validateFilePath(p)).toThrow(/Invalid file path/)
  })
})

describe('FILE_PATH_PATTERN', () => {
  const re = new RegExp(FILE_PATH_PATTERN)

  it.each([
    ['templates/app.vue'],
    ['./templates/app.vue'],
    ['.eslintrc.json'],
    ['@types/index.d.ts'],
    ['a+b.txt']
  ])('matches %s', (p) => {
    expect(re.test(p)).toBe(true)
  })

  it.each([
    ['../evil'],
    ['.'],
    ['..'],
    ['./..'],
    ['./.'],
    ['templates/../evil'],
    ['templates/./evil'],
    ['/absolute'],
    [''],
    ['./'],
    ['templates//double'],
    ['templates/ space'],
    ['templates/%2e/evil'],
    ['templates/a?b'],
    ['templates/a#b']
  ])('does not match %s', (p) => {
    expect(re.test(p)).toBe(false)
  })

  it('agrees with validateFilePath on all test cases', () => {
    const paths = [
      'templates/app.vue',
      './templates/app.vue',
      '.eslintrc.json',
      '../evil',
      '.',
      '..',
      'templates/../evil',
      '/absolute',
      '',
      'templates//x',
      'templates/%2e/x',
      'templates/a?b',
      'templates/a#b'
    ]
    for (const p of paths) {
      const regexResult = re.test(p)
      let runtimeResult: boolean
      try {
        validateFilePath(p)
        runtimeResult = true
      } catch {
        runtimeResult = false
      }
      expect(regexResult).toBe(runtimeResult)
    }
  })
})
