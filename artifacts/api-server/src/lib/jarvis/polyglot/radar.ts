import { KnowledgeStatus, TechnologyRecord } from "./types";
import { TechnologyCapabilityRegistry } from "./registry";

export interface RadarStatusEntry {
  technologyId: string;
  name: string;
  status: KnowledgeStatus;
  confidence: number;
  lastVerified: string;
  evidenceSource: string;
  alternatives: string[];
  deprecationWarning?: string;
}

export class TechnologyKnowledgeRadar {
  private registry: TechnologyCapabilityRegistry;
  private statusMap: Map<string, RadarStatusEntry> = new Map();

  constructor(registry: TechnologyCapabilityRegistry) {
    this.registry = registry;
    this.initializeRadar();
  }

  private initializeRadar(): void {
    const all = this.registry.getAll();
    for (const tech of all) {
      this.statusMap.set(tech.technologyId.toLowerCase(), {
        technologyId: tech.technologyId,
        name: tech.name,
        status: tech.status || "VERIFIED",
        confidence: tech.confidence,
        lastVerified: tech.lastVerified,
        evidenceSource: tech.evidenceSource,
        alternatives: tech.alternatives,
      });
    }
  }

  public getStatus(technologyId: string): RadarStatusEntry {
    const key = technologyId.toLowerCase();
    const entry = this.statusMap.get(key);
    if (entry) {
      // Freshness check: if last verified > 30 days ago, mark as STALE
      const daysOld = (Date.now() - new Date(entry.lastVerified).getTime()) / (1000 * 60 * 60 * 24);
      if (daysOld > 30 && entry.status === "VERIFIED") {
        return { ...entry, status: "STALE" };
      }
      return entry;
    }

    // Unregistered technology
    return {
      technologyId,
      name: technologyId,
      status: "UNKNOWN",
      confidence: 0.1,
      lastVerified: new Date(0).toISOString(),
      evidenceSource: "Unverified / No registry record",
      alternatives: [],
    };
  }

  public markVerified(technologyId: string, source: string): void {
    const key = technologyId.toLowerCase();
    const existing = this.statusMap.get(key);
    const tech = this.registry.get(key);
    const name = tech ? tech.name : technologyId;

    this.statusMap.set(key, {
      technologyId,
      name,
      status: "VERIFIED",
      confidence: 0.98,
      lastVerified: new Date().toISOString(),
      evidenceSource: source,
      alternatives: existing?.alternatives || tech?.alternatives || [],
    });
  }

  public markUncertain(technologyId: string, reason: string): void {
    const key = technologyId.toLowerCase();
    const existing = this.getStatus(technologyId);
    this.statusMap.set(key, {
      ...existing,
      status: "UNCERTAIN",
      confidence: 0.4,
      deprecationWarning: reason,
    });
  }

  public compareTechnologies(techIdA: string, techIdB: string): {
    techA: RadarStatusEntry;
    techB: RadarStatusEntry;
    recommended: string;
    reasoning: string;
  } {
    const statusA = this.getStatus(techIdA);
    const statusB = this.getStatus(techIdB);

    let recommended = techIdA;
    let reasoning = "";

    if (statusA.confidence >= statusB.confidence) {
      recommended = techIdA;
      reasoning = `${statusA.name} has higher verification confidence (${statusA.confidence}) than ${statusB.name} (${statusB.confidence}).`;
    } else {
      recommended = techIdB;
      reasoning = `${statusB.name} has higher verification confidence (${statusB.confidence}) than ${statusA.name} (${statusA.confidence}).`;
    }

    return {
      techA: statusA,
      techB: statusB,
      recommended,
      reasoning,
    };
  }
}
