import {
  CognitivePatternType,
  MemoryScope,
  PatternEvidenceItem,
  UserCognitivePattern,
} from "./types";
import { CognitiveMemoryStore } from "./store";

export interface PatternExtractionContext {
  userMessage: string;
  assistantAnswer?: string;
  projectId?: string;
  conversationId?: number;
  decisionsMade?: string[];
  correctionsDetected?: string[];
  userPreferencesExpressed?: string[];
}

export class PersonalCognitivePatternTracker {
  private memoryStore: CognitiveMemoryStore;
  private candidateThresholdOccurrences = 2;
  private candidateThresholdConfidence = 60;

  constructor(memoryStore: CognitiveMemoryStore) {
    this.memoryStore = memoryStore;
  }

  /**
   * Observe interaction and extract/update pattern candidates
   */
  public async observeInteraction(
    context: PatternExtractionContext,
  ): Promise<UserCognitivePattern[]> {
    const scope: MemoryScope = {
      projectId: context.projectId,
      conversationId: context.conversationId,
    };

    const existingPatterns = await this.memoryStore.loadUserCognitivePatterns(scope);
    const updatedPatterns: UserCognitivePattern[] = [];

    // 1. Detect User Corrections (e.g., "no,", "instead", "don't do", "i actually prefer")
    const lowerMessage = context.userMessage.toLowerCase();
    if (
      lowerMessage.includes("instead of") ||
      lowerMessage.includes("do not use") ||
      lowerMessage.includes("i prefer") ||
      lowerMessage.includes("always use") ||
      lowerMessage.includes("correction:") ||
      lowerMessage.includes("actually,")
    ) {
      const pattern = await this.recordOrUpdatePattern(
        "USER_CORRECTION",
        "Explicit User Constraint / Correction",
        `User requested adjustment or constraint: "${context.userMessage.slice(0, 120)}"`,
        context,
        existingPatterns,
      );
      if (pattern) updatedPatterns.push(pattern);
    }

    // 2. Detect Recurring Decision Criteria / Preferred Reasoning Approaches
    if (
      lowerMessage.includes("prioritize") ||
      lowerMessage.includes("tradeoff") ||
      lowerMessage.includes("speed over") ||
      lowerMessage.includes("quality over") ||
      lowerMessage.includes("focus on")
    ) {
      const pattern = await this.recordOrUpdatePattern(
        "DECISION_CRITERIA",
        "Preferred Decision Trade-off Criterion",
        `User emphasized decision criteria: "${context.userMessage.slice(0, 120)}"`,
        context,
        existingPatterns,
      );
      if (pattern) updatedPatterns.push(pattern);
    }

    // 3. Detect Recurring Goals
    if (
      lowerMessage.includes("objective is") ||
      lowerMessage.includes("we need to build") ||
      lowerMessage.includes("goal is")
    ) {
      const pattern = await this.recordOrUpdatePattern(
        "RECURRING_GOAL",
        "Project Goal Archetype",
        `User stated project objective focus: "${context.userMessage.slice(0, 120)}"`,
        context,
        existingPatterns,
      );
      if (pattern) updatedPatterns.push(pattern);
    }

    // 4. Detect Stable Preferences
    if (context.userPreferencesExpressed && context.userPreferencesExpressed.length > 0) {
      for (const pref of context.userPreferencesExpressed) {
        const pattern = await this.recordOrUpdatePattern(
          "STABLE_PREFERENCE",
          "Explicit User Style / Preference",
          `Expressed preference: ${pref}`,
          context,
          existingPatterns,
        );
        if (pattern) updatedPatterns.push(pattern);
      }
    }

    return updatedPatterns;
  }

  /**
   * Helper to record a candidate pattern or update existing pattern evidence & confidence
   */
  private async recordOrUpdatePattern(
    patternType: CognitivePatternType,
    title: string,
    observation: string,
    context: PatternExtractionContext,
    existingPatterns: UserCognitivePattern[],
  ): Promise<UserCognitivePattern> {
    const now = new Date().toISOString();
    const evidenceItem: PatternEvidenceItem = {
      interactionId: context.conversationId ? `conv_${context.conversationId}` : undefined,
      timestamp: now,
      observation,
    };

    // Check if matching candidate already exists
    const match = existingPatterns.find(
      (p) => p.patternType === patternType && p.title.toLowerCase() === title.toLowerCase(),
    );

    if (match) {
      // Never convert a single interaction into a permanent user trait.
      // Increment occurrences and update confidence progressively.
      match.occurrences += 1;
      match.evidence.push(evidenceItem);
      match.confidence = Math.min(100, match.confidence + 20);
      match.lastObservedAt = now;
      match.updatedAt = now;

      // Check if threshold met to promote candidate to VALIDATED
      if (
        match.occurrences >= this.candidateThresholdOccurrences &&
        match.confidence >= this.candidateThresholdConfidence &&
        match.validationStatus === "CANDIDATE"
      ) {
        match.validationStatus = "VALIDATED";
      }

      return await this.memoryStore.persistUserCognitivePattern(match);
    } else {
      // First observation -> Create initial CANDIDATE (single interaction is not permanent)
      const newPattern: UserCognitivePattern = {
        id: `pat_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        patternType,
        title,
        description: observation,
        evidence: [evidenceItem],
        confidence: 40, // Initial candidate confidence below validation threshold
        occurrences: 1,
        source: "OBSERVED_INTERACTION",
        projectId: context.projectId,
        validationStatus: "CANDIDATE",
        createdAt: now,
        updatedAt: now,
        lastObservedAt: now,
      };

      return await this.memoryStore.persistUserCognitivePattern(newPattern);
    }
  }

  /**
   * Retrieve validated personal cognitive patterns to enrich agent reasoning without prompt dumping
   */
  public async getDurableUserPatterns(scope: MemoryScope): Promise<UserCognitivePattern[]> {
    const patterns = await this.memoryStore.loadUserCognitivePatterns(scope);
    // Only return patterns that passed confidence & repetition thresholds (VALIDATED) or high-confidence candidates
    return patterns.filter((p) => p.validationStatus === "VALIDATED" || p.confidence >= 80);
  }
}
