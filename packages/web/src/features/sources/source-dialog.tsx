import { useEffect, useState } from "react";

import type { LocalSourceInput, LocalSourceSummary } from "@skillpin/core";

import {
  Button,
  Checkbox,
  Dialog,
  TextInput,
} from "../../components/controls.js";
import { LocalApiClientError } from "../../api/local-api.js";
import { useLocalApiClient } from "../session/session-context.js";
import { DirectoryBrowser } from "./directory-browser.js";
import { ScanProgress } from "./scan-progress.js";

function blankInput(): LocalSourceInput {
  return { displayName: "", enabled: true, path: "" };
}

function inputFor(source: LocalSourceSummary | null): LocalSourceInput {
  return source === null
    ? blankInput()
    : {
        displayName: source.source.displayName,
        enabled: source.source.enabled,
        path: source.source.path,
      };
}

function errorMessage(reason: unknown): string {
  return reason instanceof LocalApiClientError
    ? reason.message
    : "无法保存该技能源。";
}

export function SourceDialog({
  disabled,
  onClose,
  onSave,
  open,
  source,
}: {
  readonly disabled: boolean;
  readonly onClose: () => void;
  readonly onSave: (input: LocalSourceInput) => Promise<LocalSourceSummary>;
  readonly open: boolean;
  readonly source: LocalSourceSummary | null;
}) {
  const client = useLocalApiClient();
  const [input, setInput] = useState<LocalSourceInput>(() => inputFor(source));
  const [showBrowser, setShowBrowser] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<LocalSourceSummary | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setInput(inputFor(source));
    setShowBrowser(false);
    setValidation(null);
    setError(null);
    setSaved(null);
  }, [open, source]);

  const validatePath = async (): Promise<string | null> => {
    if (input.path.trim() === "") {
      setError("验证前请输入目录路径。");
      return null;
    }
    try {
      const validated = await client.validateSourcePath(input.path);
      setInput((current) => ({ ...current, path: validated.path }));
      setValidation(`已验证目录：${validated.path}`);
      setError(null);
      return validated.path;
    } catch (reason: unknown) {
      setValidation(null);
      setError(errorMessage(reason));
      return null;
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (input.displayName.trim() === "") {
      setError("请输入该技能源的显示名称。");
      return;
    }
    setSaving(true);
    const canonicalPath = await validatePath();
    if (canonicalPath === null) {
      setSaving(false);
      return;
    }
    try {
      const result = await onSave({
        ...input,
        displayName: input.displayName.trim(),
        path: canonicalPath,
      });
      setSaved(result);
      setError(null);
      onClose();
    } catch (reason: unknown) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const editing = source !== null;
  return (
    <Dialog
      className="source-dialog"
      description="SkillPin 会在保存前验证此本地目录，且仅扫描技能相关元数据。"
      onClose={onClose}
      open={open}
      title={editing ? "编辑技能源" : "添加技能源"}
    >
      <form className="source-form" onSubmit={(event) => void submit(event)}>
        <TextInput
          disabled={disabled || saving}
          label="显示名称"
          onChange={(event) =>
            setInput((current) => ({
              ...current,
              displayName: event.target.value,
            }))
          }
          placeholder="个人技能库"
          value={input.displayName}
        />
        <TextInput
          disabled={disabled || saving}
          hint="粘贴绝对目录路径，或在下方选择子目录。"
          label="目录路径"
          onChange={(event) => {
            setValidation(null);
            setInput((current) => ({ ...current, path: event.target.value }));
          }}
          placeholder="/Users/you/skills"
          value={input.path}
        />
        <div className="source-form__row">
          <Checkbox
            checked={input.enabled}
            disabled={disabled || saving}
            label="在当前技能目录中启用此技能源"
            onChange={(event) =>
              setInput((current) => ({
                ...current,
                enabled: event.target.checked,
              }))
            }
          />
          <Button
            disabled={disabled || saving}
            onClick={() => void validatePath()}
            variant="tertiary"
          >
            验证路径
          </Button>
        </div>
        {validation === null ? null : (
          <p className="form-message form-message--success" role="status">
            {validation}
          </p>
        )}
        {error === null ? null : (
          <p className="form-message form-message--error" role="alert">
            {error}
          </p>
        )}
        <Button
          aria-expanded={showBrowser}
          disabled={disabled || saving}
          onClick={() => setShowBrowser((current) => !current)}
          variant="tertiary"
        >
          {showBrowser ? "隐藏目录浏览器" : "浏览目录"}
        </Button>
        {showBrowser ? (
          <DirectoryBrowser
            disabled={disabled || saving}
            onChoose={(path) => {
              setInput((current) => ({ ...current, path }));
              setValidation(`已选择目录：${path}`);
            }}
            selectedPath={input.path}
          />
        ) : null}
        <ScanProgress pending={saving} source={saved} />
        <div className="dialog__actions source-form__actions">
          <Button disabled={saving} onClick={onClose} variant="secondary">
            取消
          </Button>
          <Button disabled={disabled || saving} type="submit" variant="primary">
            {editing ? "保存修改" : "添加技能源"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
