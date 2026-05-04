import axios from 'axios'
import MockAdapter from 'axios-mock-adapter'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { HttpClient } from '../../../src/lib/infra/http.js'
import { HttpError, TimeoutError } from '../../../src/lib/utils/errors.js'

/** Virtual time large enough to flush axios-retry's 1s+2s+3s linear backoff. */
const RETRY_BACKOFF_MS = 10_000

describe('infra/http', () => {
  let mock: MockAdapter
  let client: HttpClient

  beforeEach(() => {
    vi.useFakeTimers()
    client = new HttpClient()
    mock = new MockAdapter((client as unknown as { ax: typeof axios }).ax, {
      onNoMatch: 'throwException'
    })
  })

  afterEach(() => {
    mock.restore()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('get returns parsed JSON body and normalized headers', async () => {
    mock.onGet('/api').reply(200, { ok: true }, { 'x-trace': 'abc' })
    const res = await client.get<{ ok: boolean }>('/api')
    expect(res.status).toBe(200)
    expect(res.data).toEqual({ ok: true })
    expect(res.headers.get('x-trace')).toBe('abc')
  })

  it('get joins array response headers with ", "', async () => {
    mock.onGet('/api').reply(200, {}, {
      'set-cookie': ['a=1', 'b=2']
    } as unknown as Record<
      string,
      string | number | boolean | null | undefined
    >)
    const res = await client.get('/api')
    expect(res.headers.get('set-cookie')).toBe('a=1, b=2')
  })

  it('toResponse ignores non-string non-array header values', () => {
    const out = (
      client as unknown as { toResponse: (r: unknown) => { headers: Headers } }
    ).toResponse({
      data: {},
      status: 200,
      headers: { 'x-num': 123 as unknown as string }
    })
    expect(out.headers.get('x-num')).toBeNull()
  })

  it('get forwards custom request headers', async () => {
    mock.onGet('/api').reply((config) => {
      expect(config.headers?.['X-Token']).toBe('secret')
      return [200, {}]
    })
    await client.get('/api', { headers: { 'X-Token': 'secret' } })
  })

  it('post sends JSON body with application/json Content-Type by default', async () => {
    mock.onPost('/api').reply((config) => {
      expect(config.headers?.['Content-Type']).toBe('application/json')
      expect(config.data).toBe(JSON.stringify({ a: 1 }))
      return [200, { ok: true }]
    })
    const res = await client.post('/api', { a: 1 })
    expect(res.data).toEqual({ ok: true })
  })

  it('post merges custom headers with default Content-Type', async () => {
    mock.onPost('/api').reply((config) => {
      expect(config.headers?.['X-Extra']).toBe('1')
      return [200, {}]
    })
    await client.post('/api', {}, { headers: { 'X-Extra': '1' } })
  })

  it('getBuffer returns the response body as a Node Buffer', async () => {
    const bytes = Buffer.from([0x48, 0x69])
    mock.onGet('/bin').reply(200, bytes)
    const buf = await client.getBuffer('/bin')
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.toString()).toBe('Hi')
  })

  it('getBuffer forwards custom request headers', async () => {
    mock.onGet('/bin').reply((config) => {
      expect(config.headers?.Authorization).toBe('Bearer x')
      return [200, Buffer.from([0])]
    })
    await client.getBuffer('/bin', { headers: { Authorization: 'Bearer x' } })
  })

  it('translates non-2xx responses into HttpError with status and body', async () => {
    mock.onGet('/fail').reply(404, { reason: 'nope' })
    await expect(client.get('/fail')).rejects.toMatchObject({
      status: 404,
      response: { reason: 'nope' }
    })
    await expect(client.get('/fail')).rejects.toBeInstanceOf(HttpError)
  })

  it('falls back to error message when statusText is empty', async () => {
    mock.onGet('/boom').reply(500, {}, {})
    const result = expect(client.get('/boom')).rejects.toThrow(/HTTP 500/)
    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS)
    await result
  })

  it('translates ECONNABORTED errors into TimeoutError', async () => {
    mock.onGet('/slow').timeout()
    const result = expect(client.get('/slow')).rejects.toBeInstanceOf(
      TimeoutError
    )
    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS)
    await result
  })

  it('passes through non-HTTP errors without wrapping', async () => {
    mock.onGet('/net').networkError()
    const result = expect(client.get('/net')).rejects.toThrow(/Network Error/)
    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS)
    await result
  })
})
