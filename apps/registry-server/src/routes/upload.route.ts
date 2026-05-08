/**
 * Upload route for publishing registry packages.
 *
 * `POST /registries` — Upload a tar.gz package with checksum verification.
 */

import { AppError, ValidationError, ForbiddenError } from '../lib/errors.js'

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

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
        const { namespace, name, version, segments } =
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

        // 9. Validate schema
        await upload.validateSchema(tempExtractDir)

        // 10. Install (atomic rename + versions.json update)
        await upload.install(tempExtractDir, namespace, name, version, segments)
        tempExtractDir = undefined // Ownership transferred

        // 11. Clean up temp tar
        await upload.cleanup(tempTarPath)
        tempTarPath = undefined

        // 12. Emit webhook events
        upload.emitEvents(namespace, name, version, segments)

        // 13. Success
        return reply.code(201).send({
          name,
          version,
          namespace,
          path: `${namespace}/${segments.join('/')}/${version}`,
          message: 'Registry uploaded successfully'
        })
      } catch (error) {
        // Clean up on failure
        await upload.cleanup(tempTarPath, tempExtractDir)
        throw error
      }
    }
  )
}
