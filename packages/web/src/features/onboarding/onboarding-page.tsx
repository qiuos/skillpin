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
      <EmptyState
        action={
          <Button disabled={disabled} onClick={onAddSource} variant="primary">
            添加第一个技能源
          </Button>
        }
        body="添加你信任的本地目录。SkillPin 会读取该目录及其 SKILL.md 元数据，为当前会话建立私有技能目录。"
        title="设置你的第一个技能源"
      />
    </section>
  );
}
