/**
 * `idnPlugin()` - the package's Vite entry (contracts/plugin-options.md, FR-019).
 *
 * Single registration step, zero required options: `plugins: [idnPlugin()]`
 * yields working Indonesian search (G1). Performs no network requests (G3,
 * FR-021). Host hooks are composed, never replaced (G4).
 */

import type { Plugin } from 'vite'
import {
  RESOLVED_VIRTUAL_ID,
  VIRTUAL_ID,
} from '../core/constants'
import type { IdnPluginOptions } from '../core/types'
import { resolveOptions } from './configResolved'
import { corePlugin } from './corePlugin'
import { searchIndexPlugin } from './searchIndexPlugin'

export { VIRTUAL_ID as IDN_VIRTUAL_MODULE, RESOLVED_VIRTUAL_ID as IDN_RESOLVED_VIRTUAL_MODULE }

/**
 * Build the plugin list. Unknown `language` throws here = build error at
 * plugin init listing the offending value (contracts/plugin-options.md).
 * `enabled: false` returns no plugins - no index, no UI, build succeeds
 * (FR-020).
 */
export function idnPlugin(options: IdnPluginOptions = {}): Plugin[] {
  const resolved = resolveOptions(options)
  if (!resolved.enabled) return []
  return [corePlugin(resolved), searchIndexPlugin(resolved)]
}
