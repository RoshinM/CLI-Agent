import { execFile, spawn } from "child_process";
import { promisify } from "util";
import path from "path";
import type { ToolDefinition } from "../types/AgentTypes.ts";
import { getWorkspaceRoot, isWithinWorkspace } from "../core/workspace.ts";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_CHARS = 4000;
const INTERACTIVE_TIMEOUT_MS = 5 * 60 * 1000;
const INTERACTIVE_OUTPUT_PATTERNS = [
  /use arrow-keys/i,
  /return to submit/i,
  /would you like/i,
  /select an option/i,
  /choose an option/i,
  /^\?\s/m,
];

function ensureString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing or invalid "${fieldName}".`);
  }

  return value;
}

function resolveWorkingDirectory(cwd?: unknown): string {
  const workspaceRoot = getWorkspaceRoot();

  if (cwd === undefined) {
    return workspaceRoot;
  }

  if (typeof cwd !== "string" || !cwd.trim()) {
    throw new Error(`Invalid "cwd".`);
  }

  const resolved = path.resolve(workspaceRoot, cwd);
  if (!isWithinWorkspace(resolved)) {
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

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function previewLike(text: string): string {
  const normalized = stripAnsi(text).replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
}

function looksInteractive(text: string): boolean {
  const normalized = stripAnsi(text);
  return INTERACTIVE_OUTPUT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function buildFailurePayload(
  command: string,
  cwd: string,
  workspaceRoot: string,
  exitCode: number | null,
  stdout: string,
  stderr: string,
  outputWasTruncated: boolean,
  message: string,
) {
  const combinedOutput = [stdout, stderr].filter(Boolean).join("\n");
  const interactivePromptDetected = looksInteractive(combinedOutput);
  const promptPreview = previewLike(combinedOutput);

  return {
    type: interactivePromptDetected ? "interactive_prompt" : "command_error",
    summary: interactivePromptDetected
      ? "Command needs interactive input. You can rerun it in interactive mode to answer the prompts yourself."
      : previewLike(message) || promptPreview || "Shell command failed.",
    interactivePromptDetected,
    promptPreview,
    command,
    cwd: path.relative(workspaceRoot, cwd).replace(/\\/g, "/") || ".",
    exitCode,
    stdout,
    stderr,
    outputWasTruncated,
    message,
  };
}

function runInteractiveCommand(command: string, cwd: string, workspaceRoot: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell", ["-NoProfile", "-Command", command], {
      cwd,
      windowsHide: true,
      stdio: "inherit",
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(
        new Error(
          JSON.stringify(
            {
              type: "command_error",
              summary: "Interactive command timed out before completion.",
              interactivePromptDetected: false,
              command,
              cwd: path.relative(workspaceRoot, cwd).replace(/\\/g, "/") || ".",
              exitCode: null,
              message: `Interactive command timed out after ${timeoutMs / 1000} seconds.`,
            },
            null,
            2,
          ),
        ),
      );
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(
        new Error(
          JSON.stringify(
            {
              type: "command_error",
              summary: "Interactive command failed to start.",
              interactivePromptDetected: false,
              command,
              cwd: path.relative(workspaceRoot, cwd).replace(/\\/g, "/") || ".",
              exitCode: null,
              message: error.message,
            },
            null,
            2,
          ),
        ),
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      if (code === 0) {
        resolve(
          JSON.stringify(
            {
              command,
              cwd: path.relative(workspaceRoot, cwd).replace(/\\/g, "/") || ".",
              exitCode: 0,
              interactive: true,
              message: "Interactive command completed successfully.",
            },
            null,
            2,
          ),
        );
        return;
      }

      reject(
        new Error(
          JSON.stringify(
            {
              type: "command_error",
              summary: "Interactive command exited with an error.",
              interactivePromptDetected: false,
              command,
              cwd: path.relative(workspaceRoot, cwd).replace(/\\/g, "/") || ".",
              exitCode: typeof code === "number" ? code : null,
              message: "Interactive command exited with a non-zero status.",
            },
            null,
            2,
          ),
        ),
      );
    });
  });
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
    interactive: "boolean (optional) - when true, hand control to the user for interactive prompts",
  },
  async func(args: any): Promise<string> {
    const command = ensureString(args?.command, "command");
    const cwd = resolveWorkingDirectory(args?.cwd);
    const workspaceRoot = getWorkspaceRoot();
    const interactive = args?.interactive === true;
    const timeoutMsRaw = args?.timeoutMs;
    const timeoutMs =
      typeof timeoutMsRaw === "number" && Number.isFinite(timeoutMsRaw)
        ? Math.min(Math.max(timeoutMsRaw, 1000), interactive ? INTERACTIVE_TIMEOUT_MS : 60000)
        : interactive
          ? INTERACTIVE_TIMEOUT_MS
          : 10000;

    if (interactive) {
      return runInteractiveCommand(command, cwd, workspaceRoot, timeoutMs);
    }

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
          cwd: path.relative(workspaceRoot, cwd).replace(/\\/g, "/") || ".",
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
      const payload = buildFailurePayload(
        command,
        cwd,
        workspaceRoot,
        exitCode,
        limitedStdout.text,
        limitedStderr.text,
        limitedStdout.truncated || limitedStderr.truncated,
        error?.message ?? "Shell command failed.",
      );

      throw new Error(JSON.stringify({ ...payload, outputLimit: MAX_OUTPUT_CHARS }, null, 2));
    }
  },
};
