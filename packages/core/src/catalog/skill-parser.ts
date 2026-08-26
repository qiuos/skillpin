import { TextDecoder } from "node:util";

import { parseDocument } from "yaml";

import type { SkillParseWarning } from "../domain/skill-candidate.js";

import { fingerprintSkillContent } from "./link-name.js";

export const MISSING_SKILL_DESCRIPTION = "未提供说明";

export interface ParsedSkillDocument {
  readonly contentFingerprint: string;
  readonly displayName: string;
  readonly markdownBody: string;
  readonly parseWarning: SkillParseWarning | null;
  readonly summary: string;
}

function warning(
  code: SkillParseWarning["code"],
  message: string,
): SkillParseWarning {
  return { code, message };
}

function firstReadableParagraph(markdownBody: string): string | null {
  const lines = markdownBody.replaceAll("\r\n", "\n").split("\n");
  const paragraph: string[] = [];
  let inCodeFence = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("```")) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence || line === "") {
      if (paragraph.length > 0) {
        break;
      }
      continue;
    }
    if (/^(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|---+$)/u.test(line)) {
      continue;
    }
    paragraph.push(line);
  }

  const value = paragraph.join(" ").trim();
  return value === "" ? null : value;
}

function parseFrontMatter(text: string): {
  readonly body: string;
  readonly description: string | null;
  readonly displayName: string | null;
  readonly parseWarning: SkillParseWarning | null;
} {
  const frontMatter = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(
    text,
  );
  if (frontMatter === null) {
    return {
      body: text,
      description: null,
      displayName: null,
      parseWarning: null,
    };
  }

  const document = parseDocument(frontMatter[1] ?? "");
  const body = text.slice(frontMatter[0].length);
  if (document.errors.length > 0) {
    return {
      body,
      description: null,
      displayName: null,
      parseWarning: warning(
        "INVALID_FRONT_MATTER",
        "SKILL.md front matter could not be parsed as YAML.",
      ),
    };
  }

  const contents = document.toJS();
  if (
    contents === null ||
    typeof contents !== "object" ||
    Array.isArray(contents)
  ) {
    return { body, description: null, displayName: null, parseWarning: null };
  }
  const metadata = contents as Record<string, unknown>;
  const name = metadata.name;
  const description = metadata.description;
  if (
    (name !== undefined && typeof name !== "string") ||
    (description !== undefined && typeof description !== "string")
  ) {
    return {
      body,
      description: null,
      displayName: null,
      parseWarning: warning(
        "INVALID_FRONT_MATTER",
        "SKILL.md front matter name and description must be strings.",
      ),
    };
  }

  return {
    body,
    description:
      typeof description === "string" ? description.trim() || null : null,
    displayName: typeof name === "string" ? name.trim() || null : null,
    parseWarning: null,
  };
}

/** Parses one already-recognized SKILL.md file without making parser failures fatal. */
export function parseSkillDocument(
  content: Uint8Array,
  directoryName: string,
): ParsedSkillDocument {
  const contentFingerprint = fingerprintSkillContent(content);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    return {
      contentFingerprint,
      displayName: directoryName,
      markdownBody: "",
      parseWarning: warning(
        "INVALID_TEXT_ENCODING",
        "SKILL.md is not valid UTF-8 text.",
      ),
      summary: MISSING_SKILL_DESCRIPTION,
    };
  }

  const metadata = parseFrontMatter(text);
  const fallbackSummary = firstReadableParagraph(metadata.body);
  const summary =
    metadata.description ?? fallbackSummary ?? MISSING_SKILL_DESCRIPTION;
  return {
    contentFingerprint,
    displayName: metadata.displayName ?? directoryName,
    markdownBody: metadata.body,
    parseWarning:
      metadata.parseWarning ??
      (metadata.description === null && fallbackSummary === null
        ? warning(
            "MISSING_DESCRIPTION",
            "SKILL.md does not provide a readable description.",
          )
        : null),
    summary,
  };
}
