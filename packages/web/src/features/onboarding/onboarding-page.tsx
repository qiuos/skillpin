import { Button, EmptyState } from "../../components/controls.js";

export function OnboardingPage({
  disabled,
  onAddSource,
}: {
  readonly disabled: boolean;
  readonly onAddSource: () => void;
}) {
  return (
    <section className="onboarding-page">
      <p className="eyebrow">Local source setup</p>
      <EmptyState
        action={
          <Button disabled={disabled} onClick={onAddSource} variant="primary">
            Add your first source
          </Button>
        }
        body="Connect a directory you trust. SkillPin reads directory and SKILL.md metadata to build a private catalog for this local session."
        title="Set up your first source"
      />
    </section>
  );
}
