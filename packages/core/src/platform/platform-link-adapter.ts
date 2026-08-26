import { type Result, SkillPinError } from "../index.js";

export type PlatformLinkType = "symlink" | "junction";

export interface ManagedDirectoryLink {
  readonly linkPath: string;
  readonly linkType: PlatformLinkType;
  readonly targetFingerprint: string;
  readonly targetPath: string;
}

export type LinkInspection =
  | {
      readonly kind: "missing";
    }
  | {
      readonly kind: "directory" | "file" | "other";
    }
  | {
      readonly kind: "link";
      readonly dangling: boolean;
      readonly linkType: PlatformLinkType | "unknown";
      readonly rawTarget: string | null;
      readonly targetFingerprint: string | null;
      readonly targetPath: string | null;
    };

export interface PlatformLinkErrorDetails {
  readonly linkPath?: string;
  readonly targetPath?: string;
  readonly recoveryPaths?: readonly string[];
  readonly systemCode?: string | undefined;
}

export class PlatformLinkError extends SkillPinError {
  public constructor(
    message: string,
    code: string,
    public readonly details: PlatformLinkErrorDetails = {},
  ) {
    super(message, code);
  }
}

export interface CreateDirectoryLinkInput {
  readonly linkPath: string;
  readonly targetPath: string;
}

export interface ExpectedManagedLink {
  readonly linkType: PlatformLinkType;
  readonly targetFingerprint: string;
  readonly targetPath: string;
}

export interface PlatformLinkAdapter {
  createDirectoryLink(
    input: CreateDirectoryLinkInput,
  ): Promise<Result<ManagedDirectoryLink, PlatformLinkError>>;
  inspectLink(
    linkPath: string,
  ): Promise<Result<LinkInspection, PlatformLinkError>>;
  renameLink(
    sourcePath: string,
    destinationPath: string,
  ): Promise<Result<void, PlatformLinkError>>;
  removeManagedLink(
    linkPath: string,
    expected: ExpectedManagedLink,
  ): Promise<Result<void, PlatformLinkError>>;
}
