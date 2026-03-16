import { describe, it, expect, beforeEach } from 'vitest'
import { sessionStore, type NoteSession } from '../../stores/sessionStore'
import {
  NOTE_PRESETS,
  colorsFromHex,
  resolveNoteColors,
  noteTextColor,
} from '../NoteColorPicker'

// Helper to reset the session store before each test
function resetStore() {
  sessionStore.setState({
    sessions: new Map(),
    focusedId: null,
    highlightedId: null,
    selectedIds: new Set<string>(),
    nextZIndex: 1,
  })
}

describe('note store — creation and deletion', () => {
  beforeEach(resetStore)

  it('creates a note session with default values', () => {
    const note = sessionStore.getState().createNoteSession()
    expect(note.type).toBe('note')
    expect(note.title).toBe('Note')
    expect(note.content).toBe('')
    expect(note.color).toBe('yellow')
    expect(note.position).toEqual({ x: 0, y: 0 })
    expect(note.size).toEqual({ cols: 0, rows: 0, width: 240, height: 200 })
    expect(note.id).toMatch(/^[0-9a-f]{8}-/)
  })

  it('creates a note with custom position', () => {
    const note = sessionStore.getState().createNoteSession({ x: 300, y: 150 })
    expect(note.position).toEqual({ x: 300, y: 150 })
  })

  it('creates a note with custom color', () => {
    const note = sessionStore.getState().createNoteSession(undefined, 'pink')
    expect(note.color).toBe('pink')
  })

  it('creates a note with custom position and color', () => {
    const note = sessionStore.getState().createNoteSession({ x: 50, y: 75 }, 'blue')
    expect(note.position).toEqual({ x: 50, y: 75 })
    expect(note.color).toBe('blue')
  })

  it('adds the created note to the sessions map', () => {
    const note = sessionStore.getState().createNoteSession()
    const stored = sessionStore.getState().sessions.get(note.id) as NoteSession
    expect(stored).toBeDefined()
    expect(stored.type).toBe('note')
    expect(stored.content).toBe('')
  })

  it('increments zIndex for each new note', () => {
    const n1 = sessionStore.getState().createNoteSession()
    const n2 = sessionStore.getState().createNoteSession()
    expect(n2.zIndex).toBeGreaterThan(n1.zIndex)
  })

  it('deletes a note session', () => {
    const note = sessionStore.getState().createNoteSession()
    expect(sessionStore.getState().sessions.size).toBe(1)
    sessionStore.getState().removeSession(note.id)
    expect(sessionStore.getState().sessions.size).toBe(0)
    expect(sessionStore.getState().sessions.get(note.id)).toBeUndefined()
  })

  it('clears focusedId when a focused note is deleted', () => {
    const note = sessionStore.getState().createNoteSession()
    sessionStore.getState().focusSession(note.id)
    expect(sessionStore.getState().focusedId).toBe(note.id)
    sessionStore.getState().removeSession(note.id)
    expect(sessionStore.getState().focusedId).toBeNull()
  })

  it('clears selectedIds when a selected note is deleted', () => {
    const note = sessionStore.getState().createNoteSession()
    sessionStore.getState().toggleSelectSession(note.id)
    expect(sessionStore.getState().selectedIds.has(note.id)).toBe(true)
    sessionStore.getState().removeSession(note.id)
    expect(sessionStore.getState().selectedIds.has(note.id)).toBe(false)
  })
})

describe('note store — text editing and content persistence', () => {
  beforeEach(resetStore)

  it('updates note content via updateSession', () => {
    const note = sessionStore.getState().createNoteSession()
    sessionStore.getState().updateSession(note.id, { content: 'Hello world' })
    const updated = sessionStore.getState().sessions.get(note.id) as NoteSession
    expect(updated.content).toBe('Hello world')
  })

  it('preserves content across multiple updates', () => {
    const note = sessionStore.getState().createNoteSession()
    sessionStore.getState().updateSession(note.id, { content: 'First' })
    sessionStore.getState().updateSession(note.id, { content: 'First\nSecond' })
    const updated = sessionStore.getState().sessions.get(note.id) as NoteSession
    expect(updated.content).toBe('First\nSecond')
  })

  it('supports empty content', () => {
    const note = sessionStore.getState().createNoteSession()
    sessionStore.getState().updateSession(note.id, { content: 'something' })
    sessionStore.getState().updateSession(note.id, { content: '' })
    const updated = sessionStore.getState().sessions.get(note.id) as NoteSession
    expect(updated.content).toBe('')
  })

  it('updates note title', () => {
    const note = sessionStore.getState().createNoteSession()
    sessionStore.getState().updateSession(note.id, { title: 'My Note' })
    const updated = sessionStore.getState().sessions.get(note.id) as NoteSession
    expect(updated.title).toBe('My Note')
  })

  it('preserves other fields when updating content', () => {
    const note = sessionStore.getState().createNoteSession({ x: 10, y: 20 }, 'green')
    sessionStore.getState().updateSession(note.id, { content: 'text' })
    const updated = sessionStore.getState().sessions.get(note.id) as NoteSession
    expect(updated.color).toBe('green')
    expect(updated.position).toEqual({ x: 10, y: 20 })
    expect(updated.type).toBe('note')
  })

  it('does nothing when updating a non-existent note', () => {
    const before = sessionStore.getState()
    sessionStore.getState().updateSession('non-existent-id', { content: 'test' })
    const after = sessionStore.getState()
    expect(after.sessions.size).toBe(before.sessions.size)
  })

  it('handles multiline content with special characters', () => {
    const note = sessionStore.getState().createNoteSession()
    const content = 'Line 1\nLine 2\n\tTabbed\n  Spaced\n# Heading\n- bullet'
    sessionStore.getState().updateSession(note.id, { content })
    const updated = sessionStore.getState().sessions.get(note.id) as NoteSession
    expect(updated.content).toBe(content)
  })
})

describe('note store — color selection', () => {
  beforeEach(resetStore)

  it('updates note color via updateSession', () => {
    const note = sessionStore.getState().createNoteSession()
    sessionStore.getState().updateSession(note.id, { color: 'pink' })
    const updated = sessionStore.getState().sessions.get(note.id) as NoteSession
    expect(updated.color).toBe('pink')
  })

  it('cycles through all preset colors', () => {
    const note = sessionStore.getState().createNoteSession()
    const presetKeys = Object.keys(NOTE_PRESETS)
    for (const color of presetKeys) {
      sessionStore.getState().updateSession(note.id, { color })
      const updated = sessionStore.getState().sessions.get(note.id) as NoteSession
      expect(updated.color).toBe(color)
    }
  })

  it('accepts a custom hex color', () => {
    const note = sessionStore.getState().createNoteSession()
    sessionStore.getState().updateSession(note.id, { color: '#ff5733' })
    const updated = sessionStore.getState().sessions.get(note.id) as NoteSession
    expect(updated.color).toBe('#ff5733')
  })

  it('preserves content when changing color', () => {
    const note = sessionStore.getState().createNoteSession()
    sessionStore.getState().updateSession(note.id, { content: 'keep this' })
    sessionStore.getState().updateSession(note.id, { color: 'purple' })
    const updated = sessionStore.getState().sessions.get(note.id) as NoteSession
    expect(updated.content).toBe('keep this')
    expect(updated.color).toBe('purple')
  })
})

describe('NoteColorPicker utilities', () => {
  describe('NOTE_PRESETS', () => {
    it('contains the five expected preset colors', () => {
      expect(Object.keys(NOTE_PRESETS)).toEqual(['yellow', 'pink', 'blue', 'green', 'purple'])
    })

    it('each preset has bg, border, and dot properties', () => {
      for (const [, val] of Object.entries(NOTE_PRESETS)) {
        expect(val).toHaveProperty('bg')
        expect(val).toHaveProperty('border')
        expect(val).toHaveProperty('dot')
        expect(val.bg).toContain('rgba(')
        expect(val.border).toContain('rgba(')
        expect(val.dot).toMatch(/^#[0-9a-f]{6}$/)
      }
    })
  })

  describe('colorsFromHex', () => {
    it('converts a hex color to bg/border/dot', () => {
      const result = colorsFromHex('#ff0000')
      expect(result.bg).toBe('rgba(255, 0, 0, 0.08)')
      expect(result.border).toBe('rgba(255, 0, 0, 0.25)')
      expect(result.dot).toBe('#ff0000')
    })

    it('handles black', () => {
      const result = colorsFromHex('#000000')
      expect(result.bg).toBe('rgba(0, 0, 0, 0.08)')
      expect(result.border).toBe('rgba(0, 0, 0, 0.25)')
      expect(result.dot).toBe('#000000')
    })

    it('handles white', () => {
      const result = colorsFromHex('#ffffff')
      expect(result.bg).toBe('rgba(255, 255, 255, 0.08)')
      expect(result.border).toBe('rgba(255, 255, 255, 0.25)')
      expect(result.dot).toBe('#ffffff')
    })

    it('handles mixed case hex', () => {
      const result = colorsFromHex('#aaBBcc')
      expect(result.bg).toBe('rgba(170, 187, 204, 0.08)')
      expect(result.dot).toBe('#aaBBcc')
    })
  })

  describe('resolveNoteColors', () => {
    it('returns preset colors for a known preset name', () => {
      const result = resolveNoteColors('yellow')
      expect(result).toBe(NOTE_PRESETS.yellow)
    })

    it('returns preset colors for each preset key', () => {
      for (const key of Object.keys(NOTE_PRESETS)) {
        expect(resolveNoteColors(key)).toBe(NOTE_PRESETS[key])
      }
    })

    it('converts a valid hex color to colors', () => {
      const result = resolveNoteColors('#3366ff')
      expect(result.bg).toBe('rgba(51, 102, 255, 0.08)')
      expect(result.border).toBe('rgba(51, 102, 255, 0.25)')
      expect(result.dot).toBe('#3366ff')
    })

    it('falls back to yellow for invalid color strings', () => {
      expect(resolveNoteColors('invalid')).toBe(NOTE_PRESETS.yellow)
      expect(resolveNoteColors('')).toBe(NOTE_PRESETS.yellow)
      expect(resolveNoteColors('#xyz')).toBe(NOTE_PRESETS.yellow)
    })

    it('rejects short hex codes', () => {
      expect(resolveNoteColors('#fff')).toBe(NOTE_PRESETS.yellow)
    })

    it('rejects hex codes without hash', () => {
      expect(resolveNoteColors('ff0000')).toBe(NOTE_PRESETS.yellow)
    })
  })

  describe('noteTextColor', () => {
    it('returns undefined for preset colors', () => {
      for (const key of Object.keys(NOTE_PRESETS)) {
        expect(noteTextColor(key)).toBeUndefined()
      }
    })

    it('returns undefined for custom hex colors', () => {
      expect(noteTextColor('#ff0000')).toBeUndefined()
      expect(noteTextColor('#ffffff')).toBeUndefined()
      expect(noteTextColor('#000000')).toBeUndefined()
    })

    it('returns undefined for non-hex non-preset strings', () => {
      expect(noteTextColor('unknown')).toBeUndefined()
    })
  })
})
