import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type { ContextFile, ContextCollectResult, ParsedTask } from '../../preload/types'

export interface PreviewFile extends ContextFile {
  selected: boolean
  basename: string
  /** Relative path from project root (for display) */
  relativePath: string
}

export interface FileGroup {
  label: string
  moduleId: string | null
  files: PreviewFile[]
}

interface AssemblyPreviewStore {
  isOpen: boolean
  loading: boolean
  files: PreviewFile[]
  parsedTask: ParsedTask | null
  projectRoot: string
  taskDescription: string
  addSearchQuery: string
  addSearchResults: string[]

  /** Called with the result from context.collect — opens the preview */
  showPreview: (
    result: ContextCollectResult,
    projectRoot: string,
    taskDescription: string,
  ) => void
  close: () => void
  toggleFile: (filePath: string) => void
  selectAll: () => void
  deselectAll: () => void
  setAddSearchQuery: (q: string) => void
  setAddSearchResults: (results: string[]) => void
  addFile: (filePath: string) => void
  removeFile: (filePath: string) => void
  /** Returns the selected files in ContextFile format */
  getSelectedFiles: () => ContextFile[]
}

function basename(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1]
}

function relativePath(filePath: string, projectRoot: string): string {
  if (filePath.startsWith(projectRoot)) {
    const rel = filePath.slice(projectRoot.length)
    return rel.startsWith('/') ? rel.slice(1) : rel
  }
  return filePath
}

function toPreviewFile(f: ContextFile, projectRoot: string): PreviewFile {
  return {
    ...f,
    selected: true,
    basename: basename(f.filePath),
    relativePath: relativePath(f.filePath, projectRoot),
  }
}

export const assemblyPreviewStore = createStore<AssemblyPreviewStore>((set, get) => ({
  isOpen: false,
  loading: false,
  files: [],
  parsedTask: null,
  projectRoot: '',
  taskDescription: '',
  addSearchQuery: '',
  addSearchResults: [],

  showPreview: (result, projectRoot, taskDescription) => {
    const files = result.files.map((f) => toPreviewFile(f, projectRoot))
    set({
      isOpen: true,
      loading: false,
      files,
      parsedTask: result.parsedTask,
      projectRoot,
      taskDescription,
      addSearchQuery: '',
      addSearchResults: [],
    })
  },

  close: () =>
    set({
      isOpen: false,
      loading: false,
      files: [],
      parsedTask: null,
      projectRoot: '',
      taskDescription: '',
      addSearchQuery: '',
      addSearchResults: [],
    }),

  toggleFile: (filePath: string) =>
    set((s) => ({
      files: s.files.map((f) =>
        f.filePath === filePath ? { ...f, selected: !f.selected } : f,
      ),
    })),

  selectAll: () =>
    set((s) => ({ files: s.files.map((f) => ({ ...f, selected: true })) })),

  deselectAll: () =>
    set((s) => ({ files: s.files.map((f) => ({ ...f, selected: false })) })),

  setAddSearchQuery: (q: string) => set({ addSearchQuery: q }),

  setAddSearchResults: (results: string[]) => set({ addSearchResults: results }),

  addFile: (filePath: string) => {
    const state = get()
    if (state.files.some((f) => f.filePath === filePath)) return
    const newFile: PreviewFile = {
      filePath,
      relevance: 0,
      imports: [],
      importedBy: [],
      source: 'search',
      selected: true,
      basename: basename(filePath),
      relativePath: relativePath(filePath, state.projectRoot),
    }
    set((s) => ({
      files: [...s.files, newFile],
      addSearchQuery: '',
      addSearchResults: [],
    }))
  },

  removeFile: (filePath: string) =>
    set((s) => ({ files: s.files.filter((f) => f.filePath !== filePath) })),

  getSelectedFiles: () => {
    const state = get()
    return state.files
      .filter((f) => f.selected)
      .map(({ selected: _, basename: _b, relativePath: _r, ...rest }) => rest)
  },
}))

// Selector hooks
export const useAssemblyPreviewOpen = (): boolean =>
  useStore(assemblyPreviewStore, (s) => s.isOpen)

export const useAssemblyPreviewLoading = (): boolean =>
  useStore(assemblyPreviewStore, (s) => s.loading)

export const useAssemblyPreviewFiles = (): PreviewFile[] =>
  useStore(assemblyPreviewStore, useShallow((s) => s.files))

export const useAssemblyPreviewTask = (): { description: string; parsed: ParsedTask | null } =>
  useStore(
    assemblyPreviewStore,
    useShallow((s) => ({ description: s.taskDescription, parsed: s.parsedTask })),
  )

export const useAddSearchQuery = (): string =>
  useStore(assemblyPreviewStore, (s) => s.addSearchQuery)

export const useAddSearchResults = (): string[] =>
  useStore(assemblyPreviewStore, useShallow((s) => s.addSearchResults))

/** Group files by moduleId for grouped display */
export function groupFilesByModule(files: PreviewFile[]): FileGroup[] {
  const groups = new Map<string, FileGroup>()

  for (const file of files) {
    const key = file.moduleId ?? '__ungrouped__'
    let group = groups.get(key)
    if (!group) {
      group = {
        label: file.moduleId ?? 'Other',
        moduleId: file.moduleId ?? null,
        files: [],
      }
      groups.set(key, group)
    }
    group.files.push(file)
  }

  // Sort groups: named modules first (alphabetical), then "Other"
  const sorted = [...groups.values()].sort((a, b) => {
    if (!a.moduleId) return 1
    if (!b.moduleId) return -1
    return a.label.localeCompare(b.label)
  })

  // Within each group, sort by relevance (descending)
  for (const group of sorted) {
    group.files.sort((a, b) => b.relevance - a.relevance)
  }

  return sorted
}
