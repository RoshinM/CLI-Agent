import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import type { ToolDefinition } from "../types/AgentTypes.ts";

const execFileAsync = promisify(execFile);
const projectRoot = process.cwd();
const MAX_OUTPUT_CHARS = 4000;

function ensureString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing or invalid "${fieldName}".`);
  }

  return value;
}

function resolveWorkingDirectory(cwd?: unknown): string {
  if (cwd === undefined) {
    return projectRoot;
  }

  if (typeof cwd !== "string" || !cwd.trim()) {
    throw new Error(`Invalid "cwd".`);
  }

  const resolved = path.resolve(projectRoot, cwd);
  const relative = path.relative(projectRoot, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Shell tool may only run inside the current project directory.");
  }

  return resolved;
}

function buildConfirmationMessage(args: any): string {
  const command = typeof args?.command === "string" ? args.command.trim() : "";
  const cwd = typeof args?.cwd === "string" && args.cwd.trim() ? args.cwd.trim() : ".";
  return `Allow shell command "${command}" in "${cwd}"?`;
}

function limitText(value: unknown): { text: string; truncated: boolean; originalLength: number } {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length <= MAX_OUTPUT_CHARS) {
    return {
      text: normalized,
      truncated: false,
      originalLength: normalized.length,
    };
  }

  return {
    text: `${normalized.slice(0, MAX_OUTPUT_CHARS)}\n...[truncated]`,
    truncated: true,
    originalLength: normalized.length,
  };
}

export const shellTool: ToolDefinition = {
  name: "shell_tool",
  description:
    "Run a shell command inside the project directory. Requires user approval before execution.",
  requiresConfirmation: true,
  confirmationMessage: buildConfirmationMessage,
  parameters: {
    command: "string (required) - command to run in PowerShell",
    cwd: "string (optional) - working directory relative to the project root",
    timeoutMs: "number (optional) - timeout in milliseconds, default 10000, max 60000",
  },
  async func(args: any): Promise<string> {
    const command = ensureString(args?.command, "command");
    const cwd = resolveWorkingDirectory(args?.cwd);
    const timeoutMsRaw = args?.timeoutMs;
    const timeoutMs =
      typeof timeoutMsRaw === "number" && Number.isFinite(timeoutMsRaw)
        ? Math.min(Math.max(timeoutMsRaw, 1000), 60000)
        : 10000;

    try {
      const { stdout, stderr } = await execFileAsync(
        "powershell",
        ["-NoProfile", "-Command", command],
        {
          cwd,
          timeout: timeoutMs,
          windowsHide: true,
          maxBuffer: 512 * 1024,
        },
      );

      const limitedStdout = limitText(stdout);
      const limitedStderr = limitText(stderr);

      return JSON.stringify(
        {
          command,
          cwd: path.relative(projectRoot, cwd) || ".",
          exitCode: 0,
          stdout: limitedStdout.text,
          stderr: limitedStderr.text,
          outputWasTruncated: limitedStdout.truncated || limitedStderr.truncated,
          outputLimit: MAX_OUTPUT_CHARS,
        },
        null,
        2,
      );
    } catch (error: any) {
      const limitedStdout = limitText(error?.stdout);
      const limitedStderr = limitText(error?.stderr);
      const exitCode = typeof error?.code === "number" ? error.code : null;

      throw new Error(
        JSON.stringify(
          {
            command,
            cwd: path.relative(projectRoot, cwd) || ".",
            exitCode,
            stdout: limitedStdout.text,
            stderr: limitedStderr.text,
            outputWasTruncated: limitedStdout.truncated || limitedStderr.truncated,
            outputLimit: MAX_OUTPUT_CHARS,
            message: error?.message ?? "Shell command failed.",
          },
          null,
          2,
        ),
      );
    }
  },
};
