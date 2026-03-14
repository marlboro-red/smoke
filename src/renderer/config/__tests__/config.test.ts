import { describe, it, expect, beforeEach } from 'vitest'
import { preferencesStore } from '../../stores/preferencesStore'

describe('preferencesStore', () => {
  beforeEach(() => {
    preferencesStore.setState({
      preferences: {
        defaultShell: '',
        autoLaunchClaude: false,
        claudeCommand: 'claude',
        gridSize: 20,
        sidebarPosition: 'left',
        sidebarWidth: 240,
        theme: 'dark',
        defaultCwd: '',
      },
      loaded: false,
    })
  })

  it('has correct default values', () => {
    const { preferences } = preferencesStore.getState()
    expect(preferences.defaultShell).toBe('')
    expect(preferences.autoLaunchClaude).toBe(false)
    expect(preferences.claudeCommand).toBe('claude')
    expect(preferences.gridSize).toBe(20)
    expect(preferences.sidebarPosition).toBe('left')
    expect(preferences.sidebarWidth).toBe(240)
    expect(preferences.theme).toBe('dark')
    expect(preferences.defaultCwd).toBe('')
  })

  it('setPreferences replaces all preferences and sets loaded', () => {
    preferencesStore.getState().setPreferences({
      defaultShell: '/bin/zsh',
      autoLaunchClaude: true,
      claudeCommand: 'claude --flag',
      gridSize: 30,
      sidebarPosition: 'right',
      sidebarWidth: 300,
      theme: 'light',
      defaultCwd: '/home/user',
    })
    const state = preferencesStore.getState()
    expect(state.loaded).toBe(true)
    expect(state.preferences.defaultShell).toBe('/bin/zsh')
    expect(state.preferences.autoLaunchClaude).toBe(true)
    expect(state.preferences.claudeCommand).toBe('claude --flag')
    expect(state.preferences.gridSize).toBe(30)
    expect(state.preferences.sidebarPosition).toBe('right')
    expect(state.preferences.sidebarWidth).toBe(300)
    expect(state.preferences.defaultCwd).toBe('/home/user')
  })

  it('updatePreference updates a single preference', () => {
    preferencesStore.getState().updatePreference('gridSize', 40)
    expect(preferencesStore.getState().preferences.gridSize).toBe(40)
    // Other values unchanged
    expect(preferencesStore.getState().preferences.defaultShell).toBe('')
  })

  it('updatePreference handles boolean values', () => {
    preferencesStore.getState().updatePreference('autoLaunchClaude', true)
    expect(preferencesStore.getState().preferences.autoLaunchClaude).toBe(true)
  })

  it('updatePreference handles sidebarPosition', () => {
    preferencesStore.getState().updatePreference('sidebarPosition', 'right')
    expect(preferencesStore.getState().preferences.sidebarPosition).toBe('right')
  })

  it('updatePreference handles claudeCommand', () => {
    preferencesStore.getState().updatePreference('claudeCommand', 'claude --model opus')
    expect(preferencesStore.getState().preferences.claudeCommand).toBe('claude --model opus')
  })
})
