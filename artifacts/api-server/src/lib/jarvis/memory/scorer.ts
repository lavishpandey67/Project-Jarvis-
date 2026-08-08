import { CognitiveMemoryRecord, MemoryScope } from "./types";
import { EmbeddingProvider, DeterministicEmbeddingProvider } from "./embedding";

export interface ScoringConfig {
  /** Weight for vector / semantic similarity matching (Default: 0.35) */
  semanticWeight: number;
  /** Weight for task objective and capability alignment (Default: 0.25) */
  taskWeight: number;
  /** Weight for project workspace isolation matching (Default: 0.15) */
  projectWeight: number;
  /** Weight for memory confidence rating (Default: 0.10) */
  confidenceWeight: number;
  /** Weight for memory importance level (Default: 0.10) */
  importanceWeight: number;
  /** Weight for recency time decay (Default: 0.05) */
  recencyWeight: number;
  /** Half-life in hours for recency decay (Default: 48h) */
  halfLifeHours?: number;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  semanticWeight: 0.35,
  taskWeight: 0.25,
  projectWeight: 0.15,
  confidenceWeight: 0.10,
  importanceWeight: 0.10,
  recencyWeight: 0.05,
  halfLifeHours: 48,
};

export class RelevanceScorer {
  private config: ScoringConfig;
  private embeddingProvider: EmbeddingProvider;

  constructor(config: Partial<ScoringConfig> = {}, embeddingProvider?: EmbeddingProvider) {
    this.config = { ...DEFAULT_SCORING_CONFIG, ...config };
    this.embeddingProvider = embeddingProvider || new DeterministicEmbeddingProvider();
  }

  /**
   * Score a candidate memory record against query, scope, and task context.
   */
  public async scoreRecord(
    record: CognitiveMemoryRecord,
    queryText: string,
    scope: MemoryScope,
    taskContext?: {
      taskDescription?: string;
      requiredCapabilities?: string[];
      agentRole?: string;
    },
  ): Promise<number> {
    // 1. Project Isolation Check
    let projectScore = 0.5;
    if (scope.projectId && record.projectId) {
      if (scope.projectId === record.projectId) {
        projectScore = 1.0;
      } else if (!scope.allowCrossProject) {
        // Unmatched project without cross-project authorization -> Score 0
        return 0.0;
      } else {
        projectScore = 0.1;
      }
    } else if (!scope.projectId && !record.projectId) {
      projectScore = 1.0;
    }

    // 2. Semantic Similarity Score
    let semanticScore = 0.5;
    if (queryText && queryText.trim().length > 0) {
      const queryVec = await this.embeddingProvider.embed(queryText);
      let recordVec = record.embedding;
      if (!recordVec || recordVec.length === 0) {
        recordVec = await this.embeddingProvider.embed(`${record.title} ${record.content}`);
      }
      semanticScore = Math.max(0, this.embeddingProvider.similarity(queryVec, recordVec));
    }

    // 3. Task Relevance Score
    let taskScore = 0.5;
    if (taskContext) {
      const taskText = `${taskContext.taskDescription || ""} ${(taskContext.requiredCapabilities || []).join(" ")} ${taskContext.agentRole || ""}`.toLowerCase();
      const memText = `${record.title} ${record.content} ${record.agentRole || ""}`.toLowerCase();
      
      const words = taskText.split(/\W+/).filter((w) => w.length > 3);
      if (words.length > 0) {
        let matchCount = 0;
        for (const w of words) {
          if (memText.includes(w)) matchCount++;
        }
        taskScore = Math.min(1.0, matchCount / words.length + 0.2);
      }
    }

    // 4. Confidence Score (0.0 to 1.0)
    const confidenceScore = Math.max(0.0, Math.min(1.0, record.confidence));

    // 5. Importance Score (1-5 normalized to 0.2-1.0)
    const importanceScore = Math.max(0.2, Math.min(1.0, record.importance / 5.0));

    // 6. Recency Decay Score
    let recencyScore = 1.0;
    const createdAtMs = new Date(record.createdAt).getTime();
    if (!isNaN(createdAtMs)) {
      const ageHours = (Date.now() - createdAtMs) / (1000 * 60 * 60);
      const halfLife = this.config.halfLifeHours || 48;
      recencyScore = Math.pow(0.5, ageHours / halfLife);
    }

    // Weighted Overall Score
    const totalScore =
      semanticScore * this.config.semanticWeight +
      taskScore * this.config.taskWeight +
      projectScore * this.config.projectWeight +
      confidenceScore * this.config.confidenceWeight +
      importanceScore * this.config.importanceWeight +
      recencyScore * this.config.recencyWeight;

    return Number(totalScore.toFixed(4));
  }
}
