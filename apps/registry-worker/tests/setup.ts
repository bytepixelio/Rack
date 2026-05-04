import { beforeEach } from 'vitest'
import { clearAuthCache } from '../src/lib/auth.js'

beforeEach(() => {
  clearAuthCache()
})
