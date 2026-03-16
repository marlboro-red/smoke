import { describe, it, expect, beforeEach, vi } from 'vitest'
import { pluginStore } from '../../stores/pluginStore'

// Mock window.smokeAPI
const mockList = vi.fn()
const mockInstall = vi.fn()
const mockUninstall = vi.fn()

vi.stubGlobal('window', {
  ...globalThis.window,
  smokeAPI: {
    plugin: {
      list: mockList,
      install: mockInstall,
      uninstall: mockUninstall,
    },
  },
})

describe('pluginStore', () => {
  beforeEach(() => {
    pluginStore.setState({ plugins: [], loading: false, installing: false })
    vi.clearAllMocks()
  })

  it('initial state has empty plugins array', () => {
    const state = pluginStore.getState()
    expect(state.plugins).toEqual([])
    expect(state.loading).toBe(false)
    expect(state.installing).toBe(false)
  })

  describe('loadPlugins', () => {
    it('sets loading to true while fetching', async () => {
      mockList.mockResolvedValue({ plugins: [] })

      const promise = pluginStore.getState().loadPlugins()
      expect(pluginStore.getState().loading).toBe(true)
      await promise
      expect(pluginStore.getState().loading).toBe(false)
    })

    it('populates plugins from API result', async () => {
      const plugins = [
        { name: 'plugin-a', version: '1.0.0', description: 'A', author: 'x' },
        { name: 'plugin-b', version: '2.0.0', description: 'B', author: 'y' },
      ]
      mockList.mockResolvedValue({ plugins })

      await pluginStore.getState().loadPlugins()
      expect(pluginStore.getState().plugins).toEqual(plugins)
    })

    it('handles API errors gracefully', async () => {
      mockList.mockRejectedValue(new Error('IPC failed'))

      await pluginStore.getState().loadPlugins()
      expect(pluginStore.getState().plugins).toEqual([])
      expect(pluginStore.getState().loading).toBe(false)
    })
  })

  describe('installPlugin', () => {
    it('sets installing to true during install', async () => {
      mockInstall.mockResolvedValue({ success: true })
      mockList.mockResolvedValue({ plugins: [] })

      const promise = pluginStore.getState().installPlugin('/path/to/plugin')
      expect(pluginStore.getState().installing).toBe(true)
      await promise
      expect(pluginStore.getState().installing).toBe(false)
    })

    it('reloads plugins on successful install', async () => {
      const newPlugins = [{ name: 'new-plugin', version: '1.0.0' }]
      mockInstall.mockResolvedValue({ success: true, pluginName: 'new-plugin' })
      mockList.mockResolvedValue({ plugins: newPlugins })

      const result = await pluginStore.getState().installPlugin('/path/to/plugin')
      expect(result.success).toBe(true)
      expect(mockList).toHaveBeenCalled()
      expect(pluginStore.getState().plugins).toEqual(newPlugins)
    })

    it('does not reload on failed install', async () => {
      mockInstall.mockResolvedValue({ success: false, error: 'invalid manifest' })

      const result = await pluginStore.getState().installPlugin('/bad/path')
      expect(result.success).toBe(false)
      expect(result.error).toBe('invalid manifest')
      expect(mockList).not.toHaveBeenCalled()
    })

    it('handles install exceptions', async () => {
      mockInstall.mockRejectedValue(new Error('network error'))

      const result = await pluginStore.getState().installPlugin('/path')
      expect(result.success).toBe(false)
      expect(result.error).toContain('network error')
      expect(pluginStore.getState().installing).toBe(false)
    })
  })

  describe('uninstallPlugin', () => {
    it('reloads plugins on successful uninstall', async () => {
      pluginStore.setState({
        plugins: [{ name: 'to-remove', version: '1.0.0' } as any],
      })
      mockUninstall.mockResolvedValue({ success: true })
      mockList.mockResolvedValue({ plugins: [] })

      const result = await pluginStore.getState().uninstallPlugin('to-remove')
      expect(result.success).toBe(true)
      expect(pluginStore.getState().plugins).toEqual([])
    })

    it('does not reload on failed uninstall', async () => {
      mockUninstall.mockResolvedValue({ success: false, error: 'not found' })

      const result = await pluginStore.getState().uninstallPlugin('nonexistent')
      expect(result.success).toBe(false)
      expect(mockList).not.toHaveBeenCalled()
    })

    it('handles uninstall exceptions', async () => {
      mockUninstall.mockRejectedValue(new Error('permission denied'))

      const result = await pluginStore.getState().uninstallPlugin('protected')
      expect(result.success).toBe(false)
      expect(result.error).toContain('permission denied')
    })
  })
})
