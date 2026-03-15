import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { v4 as uuidv4 } from 'uuid'

export interface Region {
  id: string
  name: string
  color: string
  position: { x: number; y: number }
  size: { width: number; height: number }
}

interface RegionStore {
  regions: Map<string, Region>

  createRegion: (
    name: string,
    position: { x: number; y: number },
    size?: { width: number; height: number },
    color?: string
  ) => Region
  updateRegion: (id: string, patch: Partial<Omit<Region, 'id'>>) => void
  removeRegion: (id: string) => void
}

const DEFAULT_COLORS = ['#4A90D9', '#D94A4A', '#4AD97A', '#D9C74A', '#9B59B6', '#E67E22']

const DEFAULT_SIZE = { width: 600, height: 400 }

// Color utility maps for region rendering
const COLOR_TO_BG: Record<string, string> = {
  '#4A90D9': 'rgba(74, 144, 217, 0.06)',
  '#D94A4A': 'rgba(217, 74, 74, 0.06)',
  '#4AD97A': 'rgba(74, 217, 122, 0.06)',
  '#D9C74A': 'rgba(217, 199, 74, 0.06)',
  '#9B59B6': 'rgba(155, 89, 182, 0.06)',
  '#E67E22': 'rgba(230, 126, 34, 0.06)',
}

const COLOR_TO_BORDER: Record<string, string> = {
  '#4A90D9': 'rgba(74, 144, 217, 0.20)',
  '#D94A4A': 'rgba(217, 74, 74, 0.20)',
  '#4AD97A': 'rgba(74, 217, 122, 0.20)',
  '#D9C74A': 'rgba(217, 199, 74, 0.20)',
  '#9B59B6': 'rgba(155, 89, 182, 0.20)',
  '#E67E22': 'rgba(230, 126, 34, 0.20)',
}

const COLOR_TO_LABEL: Record<string, string> = {
  '#4A90D9': 'rgba(74, 144, 217, 0.70)',
  '#D94A4A': 'rgba(217, 74, 74, 0.70)',
  '#4AD97A': 'rgba(74, 217, 122, 0.70)',
  '#D9C74A': 'rgba(217, 199, 74, 0.70)',
  '#9B59B6': 'rgba(155, 89, 182, 0.70)',
  '#E67E22': 'rgba(230, 126, 34, 0.70)',
}

export function getRegionBgColor(region: Region): string {
  return COLOR_TO_BG[region.color] ?? 'rgba(255, 255, 255, 0.04)'
}

export function getRegionBorderColor(region: Region): string {
  return COLOR_TO_BORDER[region.color] ?? 'rgba(255, 255, 255, 0.12)'
}

export function getRegionLabelColor(region: Region): string {
  return COLOR_TO_LABEL[region.color] ?? 'rgba(255, 255, 255, 0.55)'
}

export const regionStore = createStore<RegionStore>((set, get) => ({
  regions: new Map(),

  createRegion: (name, position, size, color) => {
    const region: Region = {
      id: uuidv4(),
      name,
      color: color ?? DEFAULT_COLORS[get().regions.size % DEFAULT_COLORS.length],
      position,
      size: size ?? DEFAULT_SIZE,
    }
    set((state) => {
      const regions = new Map(state.regions)
      regions.set(region.id, region)
      return { regions }
    })
    return region
  },

  updateRegion: (id, patch) => {
    set((state) => {
      const existing = state.regions.get(id)
      if (!existing) return state
      const regions = new Map(state.regions)
      regions.set(id, { ...existing, ...patch })
      return { regions }
    })
  },

  removeRegion: (id) => {
    set((state) => {
      const regions = new Map(state.regions)
      regions.delete(id)
      return { regions }
    })
  },
}))

export const useRegionList = (): Region[] =>
  useStore(regionStore, useShallow((state) => Array.from(state.regions.values())))

export const useRegion = (id: string): Region | undefined =>
  useStore(regionStore, (state) => state.regions.get(id))

export const useRegionStore = <T>(selector: (state: RegionStore) => T): T =>
  useStore(regionStore, selector)
