export const BOOTSTRAP_COOKIE = "skillpin_bootstrap";
export const SESSION_CREDENTIAL_COOKIE = "skillpin_session";

function strictHttpOnlyCookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
): string {
  return `${name}=${value}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

/** Creates a short-lived cookie that is available only to the local SkillPin origin. */
export function sessionCookieHeader(
  name: string,
  value: string,
  maxAgeSeconds: number,
): string {
  return strictHttpOnlyCookie(name, value, maxAgeSeconds);
}

/** Expires an HttpOnly local-session cookie without broadening its scope. */
export function clearSessionCookieHeader(name: string): string {
  return strictHttpOnlyCookie(name, "", 0);
}
