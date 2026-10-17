import { describe, expect, it, vi } from 'vitest'
import { searchIndexPlugin } from '../../src/node/searchIndexPlugin'
import { TRANSLATIONS_ID } from '../../src/core/types'
import type { ResolvedIdnOptions } from '../../src/core/types'
import type { Plugin, ViteDevServer } from 'vite'

const mockOptions: ResolvedIdnOptions = {
  enabled: true,
  ui: 'nav',
  language: 'id',
  translations: { ...TRANSLATIONS_ID },
  minIndexSizeWarningMB: 10,
  include: ['**/*.md'],
  exclude: [],
  hyphenate: { enabled: false, selector: '.content', minWordLength: 6 },
}

describe('searchIndexPlugin dependency tracking', () => {
  it('instantiates plugin correctly', () => {
    const plugin = searchIndexPlugin(mockOptions) as Plugin
    expect(plugin.name).toBe('vitepress-plugin-idn:search-index')
  })

  it('handles virtual module resolution', () => {
    const plugin = searchIndexPlugin(mockOptions) as Plugin
    const resolveId = plugin.resolveId as (id: string) => string | null
    expect(resolveId('virtual:vitepress-plugin-idn/index')).toBe('\0virtual:vitepress-plugin-idn/index')
    expect(resolveId('virtual:vitepress-plugin-idn/options')).toBe('\0virtual:vitepress-plugin-idn/options')
    expect(resolveId('other')).toBeNull()
  })

  it('handles hot update when file is neither page nor dependency', async () => {
    const plugin = searchIndexPlugin(mockOptions) as Plugin
    const reloadModule = vi.fn()
    const server = {
      moduleGraph: {
        getModuleById: vi.fn(),
      },
      reloadModule,
    } as unknown as ViteDevServer

    const handleHotUpdate = plugin.handleHotUpdate as (ctx: { file: string; server: ViteDevServer }) => Promise<void>
    const result = await handleHotUpdate({ file: '/some/untracked/path.md', server })
    expect(result).toBeUndefined()
    expect(reloadModule).not.toHaveBeenCalled()
  })
})
