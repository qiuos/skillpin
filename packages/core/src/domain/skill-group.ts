import type { SkillCandidate } from "./skill-candidate.js";

/** Candidates that contend for the same normalized project link name. */
export interface SkillGroup {
  readonly candidates: readonly SkillCandidate[];
  readonly conflictKey: string;
  readonly linkName: string;
}
