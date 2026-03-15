import { describe, it, expect, vi, beforeEach } from 'vitest'
import { collectContext, type ContextCollectRequest } from '../ContextCollector'
import { SearchIndex, type SearchResponse } from '../SearchIndex'
import { StructureAnalyzer, type StructureMap } from '../StructureAnalyzer'

// Mock dependencies
vi.mock('../TaskParser', () => ({
  parseTask: vi.fn().mockResolvedValue({
    intent: 'fix',
    keywords: ['payment', 'retry'],
    filePatterns: ['payment', 'retry', 'payments', 'retryer'],
    includeFileTypes: ['source', 'test'],
    usedAi: false,
  }),
}))

vi.mock('../graphBuilder', () => ({
  buildCodeGraph: vi.fn().mockResolvedValue({
    graph: {
      nodes: [
        { filePath: '/project/src/payment/PaymentService.ts', imports: ['/project/src/payment/retry.ts'], importedBy: [], depth: 0 },
        { filePath: '/project/src/payment/retry.ts', imports: [], importedBy: ['/project/src/payment/PaymentService.ts'], depth: 1 },
      ],
      edges: [
        { from: '/project/src/payment/PaymentService.ts', to: '/project/src/payment/retry.ts', type: 'import' },
      ],
    },
    rootPath: '/project/src/payment/PaymentService.ts',
    fileCount: 2,
    edgeCount: 1,
  }),
  ensureIndex: vi.fn().mockResolvedValue({}),
}))

vi.mock('../RelevanceScorer', () => ({
  scoreRelevance: vi.fn().mockResolvedValue({
    rankedFiles: [
      {
        filePath: '/project/src/payment/PaymentService.ts',
        score: 25,
        signals: { pathKeyword: 10, contentKeyword: 5, importProximity: 6, fileTypeBoost: 0, recency: 4 },
      },
      {
        filePath: '/project/src/payment/retry.ts',
        score: 20,
        signals: { pathKeyword: 8, contentKeyword: 4, importProximity: 6, fileTypeBoost: 0, recency: 2 },
      },
      {
        filePath: '/project/src/payment/__tests__/payment.test.ts',
        score: 12,
        signals: { pathKeyword: 6, contentKeyword: 2, importProximity: 0, fileTypeBoost: 4, recency: 0 },
      },
    ],
    keywords: ['payment', 'retry'],
  }),
}))

vi.mock('../CodeGraph', () => {
  const CodeGraphMock = {
    fromJSON: vi.fn().mockReturnValue({
      nodes: new Map(),
      edges: [],
    }),
  }
  return { CodeGraph: CodeGraphMock }
})

// Create mock instances
function createMockSearchIndex(): SearchIndex {
  const searchResults: Record<string, SearchResponse> = {
    payment: {
      results: [
        { filePath: '/project/src/payment/PaymentService.ts', lineNumber: 1, lineContent: 'class PaymentService', matchStart: 6, matchEnd: 13, score: 8 },
        { filePath: '/project/src/payment/__tests__/payment.test.ts', lineNumber: 5, lineContent: 'describe("payment")', matchStart: 10, matchEnd: 17, score: 3 },
      ],
      totalMatches: 2,
      durationMs: 5,
    },
    retry: {
      results: [
        { filePath: '/project/src/payment/retry.ts', lineNumber: 1, lineContent: 'export function retry()', matchStart: 16, matchEnd: 21, score: 8 },
        { filePath: '/project/src/payment/PaymentService.ts', lineNumber: 10, lineContent: 'import { retry } from "./retry"', matchStart: 10, matchEnd: 15, score: 3 },
      ],
      totalMatches: 2,
      durationMs: 3,
    },
  }

  return {
    search: vi.fn((query: string, maxResults?: number) => {
      return searchResults[query] ?? { results: [], totalMatches: 0, durationMs: 0 }
    }),
    getStats: vi.fn().mockReturnValue({
      fileCount: 100,
      tokenCount: 5000,
      rootPath: '/project',
      indexing: false,
    }),
    build: vi.fn(),
    addFile: vi.fn(),
    removeFile: vi.fn(),
    dispose: vi.fn(),
  } as unknown as SearchIndex
}

function createMockStructureAnalyzer(cached: StructureMap | null = null): StructureAnalyzer {
  const defaultMap: StructureMap = {
    projectRoot: '/project',
    modules: {
      '.': {
        id: '.',
        name: 'project',
        rootPath: '/project',
        entryPoint: 'src/index.ts',
        type: 'package',
        children: ['src/payment'],
        keyFiles: ['package.json', 'tsconfig.json'],
      },
      'src/payment': {
        id: 'src/payment',
        name: 'payment',
        rootPath: '/project/src/payment',
        entryPoint: 'index.ts',
        type: 'source',
        children: [],
        keyFiles: [],
      },
    },
    topLevelDirs: [
      { name: 'src', type: 'source', path: '/project/src' },
    ],
  }

  return {
    getCached: vi.fn().mockReturnValue(cached ?? defaultMap),
    analyze: vi.fn().mockResolvedValue(cached ?? defaultMap),
    getModule: vi.fn((id: string) => (cached ?? defaultMap).modules[id] ?? null),
  } as unknown as StructureAnalyzer
}

describe('ContextCollector', () => {
  let searchIndex: SearchIndex
  let structureAnalyzer: StructureAnalyzer

  beforeEach(() => {
    vi.clearAllMocks()
    searchIndex = createMockSearchIndex()
    structureAnalyzer = createMockStructureAnalyzer()
  })

  describe('collectContext', () => {
    const baseRequest: ContextCollectRequest = {
      taskDescription: 'fix the payment retry logic that drops failed charges',
      projectRoot: '/project',
    }

    it('returns files with relevance scores', async () => {
      const result = await collectContext(baseRequest, searchIndex, structureAnalyzer)

      expect(result.files).toHaveLength(3)
      expect(result.files[0].filePath).toBe('/project/src/payment/PaymentService.ts')
      expect(result.files[0].relevance).toBeGreaterThanOrEqual(0)
      expect(result.files[0].relevance).toBeLessThanOrEqual(1)
    })

    it('normalizes relevance to 0-1 range', async () => {
      const result = await collectContext(baseRequest, searchIndex, structureAnalyzer)

      // First file (highest score) should have relevance 1
      expect(result.files[0].relevance).toBe(1)
      // Last file (lowest score) should have relevance 0
      expect(result.files[result.files.length - 1].relevance).toBe(0)
    })

    it('includes parsed task in result', async () => {
      const result = await collectContext(baseRequest, searchIndex, structureAnalyzer)

      expect(result.parsedTask).toBeDefined()
      expect(result.parsedTask.intent).toBe('fix')
      expect(result.parsedTask.keywords).toContain('payment')
      expect(result.parsedTask.keywords).toContain('retry')
    })

    it('includes structure map in result', async () => {
      const result = await collectContext(baseRequest, searchIndex, structureAnalyzer)

      expect(result.structureMap).toBeDefined()
      expect(result.structureMap!.projectRoot).toBe('/project')
    })

    it('includes timing breakdown', async () => {
      const result = await collectContext(baseRequest, searchIndex, structureAnalyzer)

      expect(result.timing).toBeDefined()
      expect(result.timing.parse).toBeGreaterThanOrEqual(0)
      expect(result.timing.search).toBeGreaterThanOrEqual(0)
      expect(result.timing.structure).toBeGreaterThanOrEqual(0)
      expect(result.timing.graph).toBeGreaterThanOrEqual(0)
      expect(result.timing.scoring).toBeGreaterThanOrEqual(0)
      expect(result.timing.total).toBeGreaterThanOrEqual(0)
    })

    it('searches index with each keyword', async () => {
      await collectContext(baseRequest, searchIndex, structureAnalyzer)

      expect(searchIndex.search).toHaveBeenCalledWith('payment', 50)
      expect(searchIndex.search).toHaveBeenCalledWith('retry', 50)
    })

    it('searches index with file patterns', async () => {
      await collectContext(baseRequest, searchIndex, structureAnalyzer)

      // File patterns include derived variants
      expect(searchIndex.search).toHaveBeenCalledWith('payments', 50)
      expect(searchIndex.search).toHaveBeenCalledWith('retryer', 50)
    })

    it('uses cached structure map when available', async () => {
      await collectContext(baseRequest, searchIndex, structureAnalyzer)

      expect(structureAnalyzer.getCached).toHaveBeenCalled()
      // Should not call analyze since getCached returned a result
      expect(structureAnalyzer.analyze).not.toHaveBeenCalled()
    })

    it('analyzes structure when no cache available', async () => {
      const uncachedAnalyzer = createMockStructureAnalyzer()
      ;(uncachedAnalyzer.getCached as ReturnType<typeof vi.fn>).mockReturnValue(null)

      await collectContext(baseRequest, searchIndex, uncachedAnalyzer)

      expect(uncachedAnalyzer.analyze).toHaveBeenCalledWith('/project')
    })

    it('respects maxFiles parameter', async () => {
      const { scoreRelevance } = await import('../RelevanceScorer')
      const scoreMock = vi.mocked(scoreRelevance)

      await collectContext({ ...baseRequest, maxFiles: 5 }, searchIndex, structureAnalyzer)

      // The limit should be passed to scoreRelevance
      const lastCall = scoreMock.mock.calls[scoreMock.mock.calls.length - 1]
      expect(lastCall[0].limit).toBe(5)
    })

    it('handles empty search index gracefully', async () => {
      const emptySearch = createMockSearchIndex()
      ;(emptySearch.getStats as ReturnType<typeof vi.fn>).mockReturnValue({
        fileCount: 0,
        tokenCount: 0,
        rootPath: null,
        indexing: false,
      })

      const result = await collectContext(baseRequest, emptySearch, structureAnalyzer)
      expect(result.files).toBeDefined()
    })

    it('tracks discovery source for files', async () => {
      const result = await collectContext(baseRequest, searchIndex, structureAnalyzer)

      // Files found via search should be marked as 'search'
      for (const file of result.files) {
        expect(['search', 'import-graph', 'structure', 'file-pattern']).toContain(file.source)
      }
    })

    it('assigns module IDs from structure map', async () => {
      const result = await collectContext(baseRequest, searchIndex, structureAnalyzer)

      // Files under /project/src/payment/ should have the payment module ID
      const paymentFile = result.files.find(f => f.filePath.includes('PaymentService'))
      expect(paymentFile?.moduleId).toBe('src/payment')
    })

    it('handles empty task description', async () => {
      const { parseTask } = await import('../TaskParser')
      const parseMock = vi.mocked(parseTask)
      parseMock.mockResolvedValueOnce({
        intent: 'investigate',
        keywords: [],
        filePatterns: [],
        includeFileTypes: ['source'],
        usedAi: false,
      })

      const { scoreRelevance } = await import('../RelevanceScorer')
      const scoreMock = vi.mocked(scoreRelevance)
      scoreMock.mockResolvedValueOnce({ rankedFiles: [], keywords: [] })

      const result = await collectContext(
        { ...baseRequest, taskDescription: '' },
        searchIndex,
        structureAnalyzer,
      )

      expect(result.files).toHaveLength(0)
      expect(result.parsedTask.intent).toBe('investigate')
    })
  })
})
