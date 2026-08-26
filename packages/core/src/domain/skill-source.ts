/** A locally configured root directory from which skills can be discovered. */
export interface SkillSource {
  readonly displayName: string;
  readonly enabled: boolean;
  readonly id: string;
  readonly path: string;
}
