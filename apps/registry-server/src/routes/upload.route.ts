/**
 * Upload route for publishing registry packages.
 *
 * `POST /registries` — Upload a tar.gz package with checksum verification.
 */

import { AppError, ForbiddenError, ValidationError } from '../lib/errors.js'

import type { FastifyReply, FastifyRequest, FastifyInstance } from 'fastify'

/**
 * Register the upload route.
 *
 * @param app - Fastify instance
 */
export default async function uploadRoute(app: FastifyInstance): Promise<void> {
  app.post(
    '/registries',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const upload = app.uploadService
      let tempTarPath: string | undefined
      let tempExtractDir: string | undefined

      // 0. Reject anonymous uploads before reading the multipart body.
      // Pre-§6.20, every upload — including ones with no Authorization /
      // X-Registry-Token header — flowed through saveToTemp + checksum +
      // extractTarGz before namespace auth ran. That meant an
      // unauthenticated caller could burn 100MB of disk + tar/gz CPU per
      // request and then receive a 401. There is no successful upload
      // path without a token (anonymous namespaces forbid publishing
      // outright; the protected path requires `publish: true`), so a
      // token-less request can be rejected immediately.
      if (request.getAuthToken() === null) {
        throw new AppError(
          'UNAUTHORIZED',
          'Authentication required for upload. Provide a namespace token or admin token via Authorization or X-Registry-Token.',
          401
        )
      }

      try {
        // 1. Get uploaded file
        const data = await request.file()
        if (!data) {
          throw new ValidationError('MISSING_FILE', 'No file uploaded')
        }

        // 2. Validate MIME type
        if (!upload.isValidMimeType(data.mimetype)) {
          throw new ValidationError(
            'INVALID_FILE_TYPE',
            'File must be a tar.gz archive'
          )
        }

        // 3. Save to temp
        tempTarPath = await upload.saveToTemp(data.file)

        // 4. Verify checksum
        const providedChecksum = (data.fields.checksum as { value: string })
          ?.value
        if (!providedChecksum || typeof providedChecksum !== 'string') {
          throw new ValidationError(
            'MISSING_CHECKSUM',
            'SHA256 checksum is required for upload verification'
          )
        }
        await upload.verifyChecksum(tempTarPath, providedChecksum)

        // 5. Extract
        tempExtractDir = await upload.extractTarGz(tempTarPath)

        // 6. Parse metadata
        const { name, version, segments, namespace } =
          await upload.parsePackageInfo(tempExtractDir)

        // 7. Validate namespace
        upload.validateNamespace(namespace)

        // 8. Verify auth
        if (request.isAdminToken()) {
          // Admin token: bypass namespace-level auth
        } else if (app.authService.isNamespaceAnonymous(namespace)) {
          throw new ForbiddenError(
            'ANONYMOUS_UPLOAD_FORBIDDEN',
            'Anonymous namespaces do not allow uploads. Use an admin token or configure namespace tokens.'
          )
        } else {
          const accessResult = request.verifyNamespaceAccess(namespace)
          if (!accessResult.allowed) {
            throw new AppError(
              accessResult.error!.code,
              accessResult.error!.message,
              accessResult.error!.statusCode
            )
          }
          if (!accessResult.token?.publish) {
            throw new ForbiddenError(
              'INSUFFICIENT_PERMISSIONS',
              `Token does not have publish permission for namespace ${namespace}`
            )
          }
        }

        // 9. Validate schema (also returns the parsed manifest so the
        //    next two steps can reuse it without re-reading registry.json)
        const manifest = await upload.validateSchema(tempExtractDir)

        // 10. Validate file paths and existence
        await upload.validateFilePaths(tempExtractDir, manifest)

        // 11. Reject symlinks / non-regular entries and any file not
        //     declared in the manifest allowlist
        await upload.validateExtractedTree(tempExtractDir, manifest)

        // 12. Install (atomic rename + versions.json update)
        await upload.install(tempExtractDir, namespace, name, version, segments)

        // 13. Clean up temp files (local rename already moved extractDir,
        //     so cleanup is a safe no-op; R2 mode still needs it removed)
        await upload.cleanup(tempTarPath, tempExtractDir)
        tempTarPath = undefined
        tempExtractDir = undefined

        // 14. Emit webhook events
        upload.emitEvents(namespace, name, version, segments)

        // 15. Success
        return reply.code(201).send({
          name,
          version,
          namespace,
          message: 'Registry uploaded successfully',
          path: `${namespace}/${segments.join('/')}/${version}`
        })
      } catch (error) {
        // Clean up on failure
        await upload.cleanup(tempTarPath, tempExtractDir)
        throw error
      }
    }
  )
}
