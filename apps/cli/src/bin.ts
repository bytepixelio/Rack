#!/usr/bin/env node

/**
 * CLI entry point — bootstraps the Rack CLI.
 *
 * This file is the executable entry for `rk`. It imports
 * {@link main} and handles top-level fatal errors.
 */

import { main } from './cli.js'
import { getErrorMessage } from './lib/utils/errors.js'

main().catch((error) => {
  console.error('Fatal error:', getErrorMessage(error))
  process.exit(1)
})
