import { ipcMain, type BrowserWindow } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { FilenameIndex } from '../../index/FilenameIndex'
import { buildCodeGraph, expandCodeGraph, buildDependentsGraph, getDependents, ensureIndex, getIndexStats, invalidateIndex, parseImports, detectLanguage, resolveImport, loadPathAliases, computeLayout, computeIncrementalLayout, scoreRelevance, computeWorkspaceLayout, parseTask, collectContext } from '../../codegraph'
import { SearchIndex } from '../../codegraph/SearchIndex'
import { StructureAnalyzer } from '../../codegraph/StructureAnalyzer'
import {
  PROJECT_INDEX_BUILD,
  PROJECT_INDEX_LOOKUP,
  PROJECT_INDEX_STATS,
  SEARCH_BUILD,
  SEARCH_QUERY,
  SEARCH_STATS,
  STRUCTURE_ANALYZE,
  STRUCTURE_GET,
  STRUCTURE_GET_MODULE,
  CODEGRAPH_BUILD,
  CODEGRAPH_EXPAND,
  CODEGRAPH_GET_IMPORTS,
  CODEGRAPH_RESOLVE_IMPORT,
  CODEGRAPH_INDEX_STATS,
  CODEGRAPH_INVALIDATE,
  CODEGRAPH_GET_DEPENDENTS,
  CODEGRAPH_BUILD_DEPENDENTS,
  TASK_PARSE,
  RELEVANCE_SCORE,
  CODEGRAPH_PLAN_WORKSPACE,
  CONTEXT_COLLECT,
  type ProjectIndexBuildRequest,
  type ProjectIndexBuildResponse,
  type ProjectIndexLookupRequest,
  type ProjectIndexLookupResponse,
  type ProjectIndexStatsResponse,
  type SearchBuildRequest,
  type SearchBuildResponse,
  type SearchQueryRequest,
  type SearchQueryResponse,
  type SearchStatsResponse,
  type StructureAnalyzeRequest,
  type StructureAnalyzeResponse,
  type StructureGetModuleRequest,
  type StructureModuleInfo,
  type CodeGraphBuildRequest,
  type CodeGraphBuildResponse,
  type CodeGraphExpandRequest,
  type CodeGraphGetImportsRequest,
  type CodeGraphGetImportsResponse,
  type CodeGraphResolveImportRequest,
  type CodeGraphResolveImportResponse,
  type CodeGraphIndexStats,
  type CodeGraphGetDependentsRequest,
  type CodeGraphGetDependentsResponse,
  type CodeGraphBuildDependentsRequest,
  type TaskParseRequest,
  type TaskParseResponse,
  type RelevanceScoringRequest,
  type RelevanceScoringResponse,
  type ContextCollectRequest,
  type ContextCollectResponse,
} from '../channels'

export interface CodegraphInstances {
  searchIndex: SearchIndex
  structureAnalyzer: StructureAnalyzer
  dispose: () => void
}

export function registerCodegraphHandlers(
  getMainWindow: () => BrowserWindow | null,
): CodegraphInstances {
  // Project filename index handlers
  const filenameIndex = new FilenameIndex(getMainWindow)

  ipcMain.handle(PROJECT_INDEX_BUILD, async (_event, request: ProjectIndexBuildRequest): Promise<ProjectIndexBuildResponse> => {
    return filenameIndex.build(request.rootPath)
  })

  ipcMain.handle(PROJECT_INDEX_LOOKUP, (_event, request: ProjectIndexLookupRequest): ProjectIndexLookupResponse => {
    return { paths: filenameIndex.lookup(request.basename) }
  })

  ipcMain.handle(PROJECT_INDEX_STATS, (): ProjectIndexStatsResponse => {
    return filenameIndex.getStats()
  })

  // Full-text search index handlers
  const searchIndex = new SearchIndex(getMainWindow)

  ipcMain.handle(SEARCH_BUILD, async (_event, request: SearchBuildRequest): Promise<SearchBuildResponse> => {
    return searchIndex.build(request.rootPath)
  })

  ipcMain.handle(SEARCH_QUERY, (_event, request: SearchQueryRequest): SearchQueryResponse => {
    return searchIndex.search(request.query, request.maxResults)
  })

  ipcMain.handle(SEARCH_STATS, (): SearchStatsResponse => {
    return searchIndex.getStats()
  })

  // Structure analyzer handlers
  const structureAnalyzer = new StructureAnalyzer()

  ipcMain.handle(STRUCTURE_ANALYZE, async (_event, request: StructureAnalyzeRequest): Promise<StructureAnalyzeResponse> => {
    return structureAnalyzer.analyze(request.rootPath)
  })

  ipcMain.handle(STRUCTURE_GET, (): StructureAnalyzeResponse | null => {
    return structureAnalyzer.getCached()
  })

  ipcMain.handle(STRUCTURE_GET_MODULE, (_event, request: StructureGetModuleRequest): StructureModuleInfo | null => {
    return structureAnalyzer.getModule(request.moduleId)
  })

  // Code graph handlers
  ipcMain.handle(
    CODEGRAPH_BUILD,
    async (_event, request: CodeGraphBuildRequest): Promise<CodeGraphBuildResponse> => {
      const result = await buildCodeGraph(request)
      const layout = computeLayout(result.graph, result.rootPath)
      return { ...result, layout }
    }
  )

  ipcMain.handle(
    CODEGRAPH_EXPAND,
    async (_event, request: CodeGraphExpandRequest): Promise<CodeGraphBuildResponse> => {
      const result = await expandCodeGraph(
        request.existingGraph,
        request.expandPath,
        request.projectRoot,
        request.maxDepth
      )
      const layout = computeIncrementalLayout(
        result.graph,
        request.existingPositions
      )
      return { ...result, layout }
    }
  )

  ipcMain.handle(
    CODEGRAPH_GET_IMPORTS,
    async (_event, request: CodeGraphGetImportsRequest): Promise<CodeGraphGetImportsResponse> => {
      const filePath = path.resolve(request.filePath)
      const language = detectLanguage(filePath)
      if (language === 'text') return { imports: [] }

      const content = await fs.readFile(filePath, 'utf-8')
      const imports = parseImports(content, language)
      return { imports }
    }
  )

  ipcMain.handle(
    CODEGRAPH_RESOLVE_IMPORT,
    async (_event, request: CodeGraphResolveImportRequest): Promise<CodeGraphResolveImportResponse> => {
      const importerPath = path.resolve(request.importerPath)
      const language = detectLanguage(importerPath)
      if (language === 'text') return { resolvedPath: null }

      const index = await ensureIndex(request.projectRoot)
      const aliases = await loadPathAliases(request.projectRoot)
      const result = resolveImport(
        { specifier: request.specifier, type: 'import' },
        importerPath,
        language,
        index,
        aliases
      )
      return { resolvedPath: result.resolvedPath }
    }
  )

  ipcMain.handle(CODEGRAPH_INDEX_STATS, (): CodeGraphIndexStats | null => {
    return getIndexStats()
  })

  ipcMain.handle(CODEGRAPH_INVALIDATE, (): void => {
    invalidateIndex()
  })

  ipcMain.handle(
    CODEGRAPH_GET_DEPENDENTS,
    async (_event, request: CodeGraphGetDependentsRequest): Promise<CodeGraphGetDependentsResponse> => {
      const dependents = await getDependents(request.filePath, request.projectRoot)
      return { dependents }
    }
  )

  ipcMain.handle(
    CODEGRAPH_BUILD_DEPENDENTS,
    async (_event, request: CodeGraphBuildDependentsRequest): Promise<CodeGraphBuildResponse> => {
      const result = await buildDependentsGraph(request)
      const layout = computeLayout(result.graph, result.rootPath)
      return { ...result, layout }
    }
  )

  // Task parsing handler
  ipcMain.handle(
    TASK_PARSE,
    async (_event, request: TaskParseRequest): Promise<TaskParseResponse> => {
      return parseTask(request)
    }
  )

  // Relevance scoring handler
  ipcMain.handle(
    RELEVANCE_SCORE,
    async (_event, request: RelevanceScoringRequest): Promise<RelevanceScoringResponse> => {
      return scoreRelevance(request)
    }
  )

  ipcMain.handle(
    CODEGRAPH_PLAN_WORKSPACE,
    (_event, request: { files: Array<{ filePath: string; relevance: number; imports: string[]; importedBy: string[] }> }) => {
      return computeWorkspaceLayout(request.files)
    }
  )

  // Context collector handler
  ipcMain.handle(
    CONTEXT_COLLECT,
    async (_event, request: ContextCollectRequest): Promise<ContextCollectResponse> => {
      return collectContext(request, searchIndex, structureAnalyzer)
    }
  )

  return {
    searchIndex,
    structureAnalyzer,
    dispose(): void {
      ipcMain.removeHandler(PROJECT_INDEX_BUILD)
      ipcMain.removeHandler(PROJECT_INDEX_LOOKUP)
      ipcMain.removeHandler(PROJECT_INDEX_STATS)
      ipcMain.removeHandler(SEARCH_BUILD)
      ipcMain.removeHandler(SEARCH_QUERY)
      ipcMain.removeHandler(SEARCH_STATS)
      ipcMain.removeHandler(STRUCTURE_ANALYZE)
      ipcMain.removeHandler(STRUCTURE_GET)
      ipcMain.removeHandler(STRUCTURE_GET_MODULE)
      ipcMain.removeHandler(CODEGRAPH_BUILD)
      ipcMain.removeHandler(CODEGRAPH_EXPAND)
      ipcMain.removeHandler(CODEGRAPH_GET_IMPORTS)
      ipcMain.removeHandler(CODEGRAPH_RESOLVE_IMPORT)
      ipcMain.removeHandler(CODEGRAPH_INDEX_STATS)
      ipcMain.removeHandler(CODEGRAPH_INVALIDATE)
      ipcMain.removeHandler(CODEGRAPH_GET_DEPENDENTS)
      ipcMain.removeHandler(CODEGRAPH_BUILD_DEPENDENTS)
      ipcMain.removeHandler(TASK_PARSE)
      ipcMain.removeHandler(RELEVANCE_SCORE)
      ipcMain.removeHandler(CODEGRAPH_PLAN_WORKSPACE)
      ipcMain.removeHandler(CONTEXT_COLLECT)
    },
  }
}
