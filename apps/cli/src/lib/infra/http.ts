/**
 * HTTP client with automatic retry and timeout.
 *
 * Wraps axios with sensible defaults: 30 s timeout, up to 3 retries
 * on transient failures (429 / 5xx / network errors), and linear
 * back-off. Axios errors are translated into {@link HttpError} and
 * {@link TimeoutError} so callers never deal with axios internals.
 */

import axiosRetry from 'axios-retry'
import { HttpError, TimeoutError } from '../utils/errors.js'
import axios, {
  type AxiosInstance,
  type AxiosError,
  type AxiosResponse
} from 'axios'

/** Request timeout: 30 seconds. */
const TIMEOUT = 30_000

/** Retry up to 3 times on transient failures. */
const MAX_RETRIES = 3

/** Parsed HTTP response returned by every request method. */
export interface HttpResponse<T = unknown> {
  data: T
  status: number
  headers: Headers
}

export class HttpClient {
  private timeout: number
  private ax: AxiosInstance

  constructor() {
    this.timeout = TIMEOUT

    this.ax = axios.create({ timeout: this.timeout })

    axiosRetry(this.ax, {
      retries: MAX_RETRIES,
      retryDelay: (n) => 1000 * n,
      retryCondition: (err: AxiosError) =>
        !err.response ||
        err.response.status === 429 ||
        err.response.status >= 500
    })

    this.ax.interceptors.response.use(
      (res) => res,
      (err: AxiosError) => {
        if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
          throw new TimeoutError(`Request timeout after ${this.timeout}ms`)
        }
        if (err.response) {
          const { status, statusText, data } = err.response
          throw new HttpError(
            `HTTP ${status}: ${statusText || err.message}`,
            status,
            data
          )
        }
        throw err
      }
    )
  }

  /**
   * Send a GET request and return parsed JSON.
   *
   * @param url     - Request URL
   * @param options - Optional headers
   * @returns Parsed response
   *
   * @throws {HttpError}    on non-2xx status
   * @throws {TimeoutError} when the request exceeds the timeout
   */
  async get<T = unknown>(
    url: string,
    options?: { headers?: Record<string, string> }
  ): Promise<HttpResponse<T>> {
    const res = await this.ax.get<T>(url, { headers: options?.headers })
    return this.toResponse(res)
  }

  /**
   * Send a POST request with a JSON body.
   *
   * @param url     - Request URL
   * @param body    - Request body (JSON-serializable)
   * @param options - Optional headers
   * @returns Parsed response
   *
   * @throws {HttpError}    on non-2xx status
   * @throws {TimeoutError} when the request exceeds the timeout
   */
  async post<T = unknown>(
    url: string,
    body?: unknown,
    options?: { headers?: Record<string, string> }
  ): Promise<HttpResponse<T>> {
    const res = await this.ax.post<T>(url, body, {
      headers: { 'Content-Type': 'application/json', ...options?.headers }
    })
    return this.toResponse(res)
  }

  /**
   * Send a GET request and return the body as a raw Buffer.
   *
   * Useful for downloading binary assets (images, tarballs, etc.).
   *
   * @param url     - Request URL
   * @param options - Optional headers
   * @returns Response body as a Buffer
   *
   * @throws {HttpError}    on non-2xx status
   * @throws {TimeoutError} when the request exceeds the timeout
   */
  async getBuffer(
    url: string,
    options?: { headers?: Record<string, string> }
  ): Promise<Buffer> {
    const res = await this.ax.get(url, {
      headers: options?.headers,
      responseType: 'arraybuffer'
    })
    return Buffer.from(res.data as ArrayBuffer)
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  /**
   * Convert an axios response to our {@link HttpResponse} shape.
   *
   * @param res - Raw axios response
   * @returns Normalized response with Web-API `Headers`
   */
  private toResponse<T>(res: AxiosResponse<T>): HttpResponse<T> {
    const headers = new Headers()
    for (const [k, v] of Object.entries(res.headers)) {
      if (typeof v === 'string') headers.set(k, v)
      else if (Array.isArray(v)) headers.set(k, v.join(', '))
    }
    return { data: res.data, status: res.status, headers }
  }
}
