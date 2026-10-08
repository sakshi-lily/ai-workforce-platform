import { WorkerObservation } from "./types";

export interface ResolvedConflict {
  topic: string;
  workerClaims: Array<{ worker: string; claim: string; sourcePriority: number }>;
  resolution: string;
  primarySource: string;
  uncertaintyFlagged: boolean;
  requiresHumanReview: boolean;
}

export class ConflictResolver {
  /**
   * Evidence Source Precedence Hierarchy (Section 44):
   * 1 = Authoritative MySQL Database
   * 2 = Approved Internal Knowledge Base (RAG)
   * 3 = Trusted External Sources (Research)
   * 4 = Unverified Web Content
   */
  public static getSourcePriority(workerType: string): number {
    switch (workerType) {
      case "VERIFICATION_WORKER":
        return 1;
      case "KNOWLEDGE_WORKER":
        return 2;
      case "RESEARCH_WORKER":
        return 3;
      default:
        return 4;
    }
  }

  /**
   * Resolves conflicts between worker observations using explicit evidence hierarchy (Sections 43, 44, 114).
   */
  public static resolve(observations: WorkerObservation[]): {
    conflicts: ResolvedConflict[];
    synthesizedUncertainties: string[];
  } {
    const conflicts: ResolvedConflict[] = [];
    const uncertainties: string[] = [];

    const verifyObs = observations.find((o) => o.workerType === "VERIFICATION_WORKER");
    const researchObs = observations.find((o) => o.workerType === "RESEARCH_WORKER");

    // Check for Customer Record Existence Conflict
    if (verifyObs && researchObs) {
      const verifyData = verifyObs.data as any;
      const researchData = researchObs.data as any;

      if (verifyData.customerFound === false && researchData.findings && researchData.findings.length > 0) {
        conflicts.push({
          topic: "Customer Account Verification",
          workerClaims: [
            {
              worker: "VERIFICATION_WORKER",
              claim: "Account not located in authoritative MySQL database.",
              sourcePriority: 1,
            },
            {
              worker: "RESEARCH_WORKER",
              claim: "Public entities with similar naming located in external search.",
              sourcePriority: 3,
            },
          ],
          resolution:
            "Authoritative MySQL database takes precedence (Priority 1). Entity is classified as UNVERIFIED pending onboarding.",
          primarySource: "MySQL Internal Ledger",
          uncertaintyFlagged: true,
          requiresHumanReview: true,
        });

        uncertainties.push(
          "Discrepancy noted between public market existence and active internal account ledger."
        );
      }
    }

    return {
      conflicts,
      synthesizedUncertainties: uncertainties,
    };
  }
}
