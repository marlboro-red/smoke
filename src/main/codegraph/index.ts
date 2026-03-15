/**
 * Code graph module — barrel export.
 */

export { CodeGraph, type CodeNode, type CodeEdge } from './CodeGraph'
export { parseImports, detectLanguage, type ParsedImport } from './importParser'
export { FilenameIndex } from './FilenameIndex'
export {
  resolveImport,
  resolveAllImports,
  loadPathAliases,
  type ResolvedImport,
  type PathAliases,
} from './importResolver'
export {
  buildCodeGraph,
  expandCodeGraph,
  ensureIndex,
  getIndexStats,
  invalidateIndex,
  type GraphBuildRequest,
  type GraphBuildResult,
} from './graphBuilder'
export {
  computeLayout,
  computeIncrementalLayout,
  type NodePosition,
  type LayoutResult,
  type LayoutOptions,
} from './layoutEngine'
export {
  scoreRelevance,
  extractKeywords,
  type ScoredFile,
  type RelevanceScoringRequest,
  type RelevanceScoringResult,
} from './RelevanceScorer'
export { SearchIndex, type SearchResult, type SearchResponse, type SearchIndexStats } from './SearchIndex'
export { StructureAnalyzer, type ModuleInfo, type ModuleType, type StructureMap } from './StructureAnalyzer'
