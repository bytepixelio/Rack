import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { makeTmpDir, cleanTmpDir } from '../../helpers/tmp.js'
import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { preflight } from '../../../src/lib/pipeline/preflight.js'

describe('pipeline/preflight', () => {
  let tmp: string

  beforeEach(async () => {
    tmp = await makeTmpDir('preflight')
  })
  afterEach(async () => {
    await cleanTmpDir(tmp)
  })

  it('resolves silently when no package.json exists', async () => {
    await expect(preflight(tmp)).resolves.toBeUndefined()
  })

  it('resolves silently when package.json exists and is valid JSON', async () => {
    await writeFile(
      join(tmp, 'package.json'),
      JSON.stringify({ name: 'demo', version: '1.0.0' })
    )
    await expect(preflight(tmp)).resolves.toBeUndefined()
  })

  it('rejects with PACKAGE_JSON_INVALID when the file is unparseable', async () => {
    await writeFile(join(tmp, 'package.json'), '{ not json')

    await expect(preflight(tmp)).rejects.toMatchObject({
      code: 'PACKAGE_JSON_INVALID',
      filePath: join(tmp, 'package.json')
    })
  })
})
