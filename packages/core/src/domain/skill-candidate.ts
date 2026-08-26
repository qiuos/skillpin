/** A parsed warning that does not prevent a skill directory from being listed. */
export interface SkillParseWarning {
  readonly code:
    "INVALID_FRONT_MATTER" | "INVALID_TEXT_ENCODING" | "MISSING_DESCRIPTION";
  readonly message: string;
}

/** One concrete skill directory discovered in one configured source. */
export interface SkillCandidate {
  readonly contentFingerprint: string | null;
  readonly displayName: string;
  readonly id: string;
  readonly linkName: string;
  readonly parseWarning: SkillParseWarning | null;
  readonly relativePath: string;
  readonly sourceId: string;
  readonly summary: string;
}
