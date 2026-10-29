#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pkqcode — narrow PreToolUse task-context injection for Task|Agent.

Only `prompt` changes: the role's own prompt is prefixed with the Active task
path and the task's task.md/prd.md (plus optional design.md/implement.md). Every
other tool_input field (`model`, `effort`, `isolation`, permission fields, …) is
passed back verbatim; this hook never adds, removes or judges a dispatch
parameter.

Context safety (injection is optional):
- The task path must resolve inside `.pkqcode/tasks/`, and each task file must
  resolve inside that task directory. Nothing outside those roots is read.
- A malformed `Active task:` line is never a fallback to the pointer or another
  task. A pointer naming a missing directory injects nothing.
- Missing, empty or binary `task.md`/`prd.md` injects nothing: the call is left
  untouched so the role reads the declared task files itself and reports what is
  missing. Absence of context is never reported as readiness.
- A caller-supplied `<!-- pkqcode-hook-injected -->` marker only skips
  re-injection after the context above was read.

Non-role agents and unmarked role calls are untouched. Dispatch mode, isolation,
model, effort and failure history are caller/main responsibility, not hook state.
Schema: hookSpecificOutput.updatedInput only (full tool_input replacement); the
allow path sets no permissionDecision so the host keeps its normal flow.
— https://code.claude.com/docs/en/hooks
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

_stdin_reconfigure = getattr(sys.stdin, "reconfigure", None)
if callable(_stdin_reconfigure):
    try:
        _stdin_reconfigure(encoding="utf-8", errors="replace")
    except (OSError, ValueError):
        pass

if sys.platform.startswith("win"):
    import io as _io

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    elif hasattr(sys.stdout, "detach"):
        sys.stdout = _io.TextIOWrapper(
            sys.stdout.detach(), encoding="utf-8", errors="replace"
        )  # type: ignore[union-attr]

MARKER = "<!-- pkqcode-hook-injected -->"
DIR_WORKFLOW = ".pkqcode"
AGENTS = ("implement", "frontend", "check")
MAX_FILE_BYTES = 32768
MAX_TOTAL_BYTES = 98304
ACTIVE_TASK_RE = re.compile(
    r"(?im)^\s*Active task:\s*(?P<path>\.pkqcode/tasks/[^\s]+)"
)
ACTIVE_TASK_LINE_RE = re.compile(r"(?im)^[ \t]*Active task:[ \t]*(?P<rest>.*?)[ \t]*$")
REQUIRED = ("task.md", "prd.md")


def _string(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    return ""


def find_repo_root(start: str) -> str | None:
    current = Path(start).resolve()
    while current != current.parent:
        if (current / DIR_WORKFLOW).is_dir() or (current / ".git").exists():
            return str(current)
        current = current.parent
    return None


def _extract_subagent_name(value: Any) -> str:
    direct = _string(value)
    if direct:
        return direct
    if not isinstance(value, dict):
        return ""
    for key in ("name", "subagent_type_name", "subagentTypeName"):
        direct = _string(value.get(key))
        if direct:
            return direct
    custom = value.get("custom")
    if isinstance(custom, dict):
        custom_name = _string(custom.get("name"))
        if custom_name:
            return custom_name
    return ""


def _extract_subagent_type(tool_input: dict) -> str:
    for key in (
        "subagent_type",
        "subagentType",
        "subagent_type_name",
        "subagentTypeName",
        "subagent_name",
        "subagentName",
        "agent_type",
        "agentType",
        "name",
    ):
        name = _extract_subagent_name(tool_input.get(key))
        if name:
            return name
    return ""


def _normalize_role(raw: str) -> str | None:
    lower = raw.strip().lower()
    for role in AGENTS:
        if lower == role or lower.endswith("/" + role) or lower.endswith("-" + role):
            return role
        if lower.startswith(role + "/") or lower.startswith(role + "-"):
            return role
    return None


def _parse_hook_input(input_data: dict) -> tuple[str, dict]:
    tool_input = input_data.get("tool_input", {})
    if not isinstance(tool_input, dict):
        tool_input = input_data.get("toolInput", {})
    if not isinstance(tool_input, dict):
        tool_input = {}

    tool_name = _string(input_data.get("tool_name") or input_data.get("toolName"))
    if tool_name.lower() in ("task", "agent", "subagent"):
        return (
            tool_input.get("prompt", "") if isinstance(tool_input.get("prompt"), str) else "",
            tool_input,
        )
    return "", tool_input


def _task_dir_ok(repo_root: str, rel: str) -> bool:
    """A task path must resolve to an existing directory under .pkqcode/tasks/."""
    try:
        tasks_real = os.path.realpath(Path(repo_root) / DIR_WORKFLOW / "tasks")
        full_real = os.path.realpath(Path(repo_root) / rel)
        if os.path.commonpath([tasks_real, full_real]) != tasks_real:
            return False
    except (OSError, ValueError):
        return False
    return Path(full_real).is_dir()


def _resolve_from_pointer(repo_root: str) -> str | None:
    pointer = Path(repo_root) / DIR_WORKFLOW / "current-task"
    slug = ""
    if pointer.is_file():
        slug = pointer.read_text(encoding="utf-8", errors="replace").strip()
    if not slug or slug.lower() in ("null", "none", "~"):
        cfg = Path(repo_root) / DIR_WORKFLOW / "config.yaml"
        if cfg.is_file():
            try:
                text = cfg.read_text(encoding="utf-8", errors="replace")
            except OSError:
                text = ""
            m = re.search(r"(?m)^\s*current_task:\s*['\"]?([^\s'\"]+)", text)
            if m:
                slug = m.group(1).strip()
    if not slug or slug.lower() in ("null", "none", "~"):
        return None
    rel = f"{DIR_WORKFLOW}/tasks/{slug.rstrip('/')}/"
    if not _task_dir_ok(repo_root, rel):
        return None
    return rel


def resolve_task_rel(repo_root: str, prompt: str) -> str | None:
    m = ACTIVE_TASK_RE.search(prompt or "")
    if m:
        rel = m.group("path").rstrip("/") + "/"
        if not rel.startswith(f"{DIR_WORKFLOW}/tasks/") or not _task_dir_ok(repo_root, rel):
            return None
        return rel
    # A malformed claim must never silently fall back to the pointer/another task.
    if ACTIVE_TASK_LINE_RE.search(prompt or ""):
        return None
    return _resolve_from_pointer(repo_root)


def _truncate_utf8(data: bytes, cap: int) -> bytes:
    if cap <= 0 or len(data) <= cap:
        return data
    truncated = data[:cap]
    i = len(truncated)
    while i > 0 and (truncated[i - 1] & 0xC0) == 0x80:
        i -= 1
    if i == 0:
        return b""
    lead = truncated[i - 1]
    if lead & 0x80:
        if (lead & 0xE0) == 0xC0:
            seq_len = 2
        elif (lead & 0xF0) == 0xE0:
            seq_len = 3
        elif (lead & 0xF8) == 0xF0:
            seq_len = 4
        else:
            seq_len = 1
        if (i - 1) + seq_len > len(truncated):
            i -= 1
    return truncated[:i]


def _read_task_file(repo_root: str, task_rel: str, name: str, budget: list[int]) -> str | None:
    """budget is a one-element list holding remaining bytes."""
    rel = f"{task_rel.rstrip('/')}/{name}"
    full = Path(repo_root) / rel
    try:
        # The task directory is the authorized root: a symlinked file that
        # escapes it (even into the repo) is never read.
        task_real = os.path.realpath(Path(repo_root) / task_rel)
        full_real = os.path.realpath(full)
        if os.path.commonpath([task_real, full_real]) != task_real:
            return None
    except (OSError, ValueError):
        return None
    if not full.is_file():
        return None
    try:
        data = full.read_bytes()
    except OSError:
        return None
    if b"\x00" in data:
        return None
    capped = _truncate_utf8(data, MAX_FILE_BYTES)
    text = capped.decode("utf-8", errors="replace")
    if not text.strip():
        return None
    if len(capped) < len(data):
        text += f"\n[pkqcode: truncated at {MAX_FILE_BYTES} bytes — read {rel} for full content]"
    block = f"=== {rel} ===\n{text}"
    size = len(block.encode("utf-8"))
    if budget[0] >= 0 and size > budget[0]:
        notice = f"[pkqcode: skipped {rel} — total context budget reached]"
        budget[0] = max(0, budget[0] - len(notice.encode("utf-8")))
        return notice
    if budget[0] >= 0:
        budget[0] -= size
    return block


def collect_context(repo_root: str, task_rel: str) -> tuple[str, list[str]]:
    budget = [MAX_TOTAL_BYTES]
    parts: list[str] = []
    missing: list[str] = []
    for name in ("task.md", "prd.md", "design.md", "implement.md"):
        block = _read_task_file(repo_root, task_rel, name, budget)
        if block:
            parts.append(block)
        elif name in REQUIRED:
            missing.append(name)
    return "\n\n".join(parts), missing


def build_prompt(role: str, task_rel: str, original: str, context: str) -> str:
    return (
        f"{MARKER}\n"
        f"Active task: {task_rel}\n\n"
        f"# {role} Agent Task\n\n"
        f"You are the `{role}` agent in the pkqcode Multi-Agent Pipeline.\n"
        f"Do the work directly. Do not re-spawn `{role}` or another implement/frontend/check.\n\n"
        f"## Context\n\n"
        f"{context}\n\n"
        f"---\n\n"
        f"## Your Task\n\n"
        f"{original}\n"
    )


def _maybe_inject(original_prompt: str, tool_input: dict, repo_root: str | None) -> str | None:
    role = _normalize_role(_extract_subagent_type(tool_input))
    if not role or not repo_root:
        return None
    task_rel = resolve_task_rel(repo_root, original_prompt)
    if not task_rel:
        return None
    context, missing = collect_context(repo_root, task_rel)
    if missing:
        # Leave the call untouched: the role reads the declared task files and
        # reports the missing ones instead of working from injected emptiness.
        return None
    # The marker is caller-supplied text, so it may only skip re-injection
    # after required context is verified: a prompt can imitate the marker.
    if MARKER in (original_prompt or ""):
        return None
    return build_prompt(role, task_rel, original_prompt, context)


def main() -> None:
    if os.environ.get("PKQCODE_HOOKS") == "0" or os.environ.get("PKQCODE_DISABLE_HOOKS") == "1":
        sys.exit(0)

    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)
    if not isinstance(input_data, dict):
        sys.exit(0)

    # Context injection only; other hook events have no business here.
    event = _string(input_data.get("hook_event_name") or input_data.get("hookEventName")).lower()
    if event not in ("", "pretooluse"):
        sys.exit(0)

    original_prompt, tool_input = _parse_hook_input(input_data)
    tool_name = _string(input_data.get("tool_name") or input_data.get("toolName")).lower()
    if tool_name not in ("task", "agent", "subagent"):
        sys.exit(0)

    cwd = _string(input_data.get("cwd")) or os.getcwd()
    new_prompt = _maybe_inject(original_prompt, tool_input, find_repo_root(cwd))
    if new_prompt is None:
        sys.exit(0)

    # Context injection must not change the caller's workspace/dispatch choice.
    updated = dict(tool_input)
    updated["prompt"] = new_prompt
    _emit(updated)


def _emit(updated: dict) -> None:
    output = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "updatedInput": updated,
        },
        "updated_input": updated,
        "updatedInput": updated,
    }
    print(json.dumps(output, ensure_ascii=False))
    sys.exit(0)


if __name__ == "__main__":
    main()
