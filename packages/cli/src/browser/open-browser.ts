import { spawn } from "node:child_process";

export type BrowserOpen = (url: string) => Promise<boolean>;

/** Best-effort platform launcher. Failure is intentionally non-fatal to the session. */
export const openBrowser: BrowserOpen = async (url) => {
  const command =
    process.platform === "darwin"
      ? { args: [url], file: "open" }
      : process.platform === "win32"
        ? { args: ["/c", "start", "", url], file: "cmd.exe" }
        : { args: [url], file: "xdg-open" };
  return await new Promise<boolean>((resolve) => {
    try {
      const child = spawn(command.file, command.args, {
        detached: true,
        stdio: "ignore",
      });
      child.once("error", () => resolve(false));
      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
};
