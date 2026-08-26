import { randomBytes, timingSafeEqual } from "node:crypto";

export const BOOTSTRAP_TOKEN_TTL_MS = 5 * 60 * 1000;
export const SESSION_CREDENTIAL_TTL_MS = 10 * 60 * 1000;

export interface ExpiringToken {
  readonly expiresAt: number;
  readonly value: string;
}

export function createToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Does not disclose mismatch position or length through a direct comparison. */
export function tokensEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.byteLength === rightBuffer.byteLength &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function hasExpired(token: ExpiringToken, now: number): boolean {
  return token.expiresAt <= now;
}
