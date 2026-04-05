import { stdin as input, stdout as output } from "node:process";
import readline from "readline";
import figlet from "figlet";
import { confirm, input as textInput } from "@inquirer/prompts";
import { createSpinner } from "nanospinner";
import type { StructuredToolError } from "../types/AgentTypes.ts";

export const COLORS = {
  blue: "\x1b[94m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  italic: "\x1b[3m",
};

export function printDivider() {
  console.log(`${COLORS.dim}${"=".repeat(68)}${COLORS.reset}`);
}

export function printSection(label: string, content: string, color: string, italic = false) {
  const styledLabel = `${color}${COLORS.bold}${label}:${COLORS.reset}`;
  const styledContent = italic
    ? `${color}${COLORS.italic}${content}${COLORS.reset}`
    : content;
  console.log();
  console.log(`${styledLabel} ${styledContent}`);
}

export function previewText(result: string | undefined): string {
  const text = (result ?? "").trim();
  if (!text) {
    return "No output.";
  }

  const singleLine = text.replace(/\s+/g, " ");
  return singleLine.length > 180 ? `${singleLine.slice(0, 177)}...` : singleLine;
}

function extractJsonSuffix(text: string): string | null {
  const startIndex = text.indexOf("{");
  if (startIndex === -1) {
    return null;
  }

  return text.slice(startIndex);
}

export function parseStructuredToolError(errorText: string | undefined): StructuredToolError | null {
  const text = (errorText ?? "").trim();
  if (!text) {
    return null;
  }

  const directCandidate = text.startsWith("{") ? text : extractJsonSuffix(text);
  if (!directCandidate) {
    return null;
  }

  try {
    const parsed = JSON.parse(directCandidate);
    return typeof parsed === "object" && parsed !== null ? (parsed as StructuredToolError) : null;
  } catch {
    return null;
  }
}

export function summarizeToolError(errorText: string | undefined): string {
  const structured = parseStructuredToolError(errorText);
  if (structured?.summary) {
    return structured.summary;
  }

  if (structured?.message) {
    return previewText(structured.message);
  }

  return previewText(errorText);
}

export async function promptText(message: string) {
  return textInput({ message });
}

export async function promptConfirm(message: string) {
  return confirm({ message, default: false });
}

export async function promptMultiline(message: string) {
  console.log(`${COLORS.cyan}${COLORS.bold}${message}${COLORS.reset}`);
  console.log(`${COLORS.dim}Finish by pressing Enter twice.${COLORS.reset}`);

  return new Promise<string>((resolve) => {
    const rl = readline.createInterface({ input, output });
    const lines: string[] = [];
    let lastWasEmpty = false;

    const onLine = (line: string) => {
      if (line.trim() === "") {
        if (lastWasEmpty) {
          rl.removeListener("line", onLine);
          rl.close();
          if (lines.length > 0 && lines[lines.length - 1] === "") {
            lines.pop();
          }
          resolve(lines.join("\n"));
          return;
        }

        lastWasEmpty = true;
        lines.push("");
        return;
      }

      lastWasEmpty = false;
      lines.push(line);
    };

    rl.on("line", onLine);
  });
}

export function printBanner(title: string, subtitle?: string) {
  const banner = figlet.textSync(title, {
    horizontalLayout: "default",
    verticalLayout: "default",
  });

  console.log(`${COLORS.cyan}${banner}${COLORS.reset}`);
  if (subtitle) {
    console.log(`${COLORS.dim}${subtitle}${COLORS.reset}`);
  }
  printDivider();
  console.log();
}

export class SpinnerController {
  private spinner: ReturnType<typeof createSpinner> | null = null;
  private activeText = "";

  start(text: string) {
    if (this.spinner) {
      this.stop();
    }

    this.activeText = text;
    this.spinner = createSpinner(text).start();
  }

  stop() {
    if (!this.spinner) {
      return;
    }

    const spinner = this.spinner as any;
    if (typeof spinner.stop === "function") {
      spinner.stop();
    } else if (typeof spinner.clear === "function") {
      spinner.clear();
    }

    this.spinner = null;
    this.activeText = "";
  }

  success(text: string) {
    if (!this.spinner) {
      return;
    }

    (this.spinner as any).success({ text });
    this.spinner = null;
    this.activeText = "";
  }

  error(text: string) {
    if (!this.spinner) {
      return;
    }

    (this.spinner as any).error({ text });
    this.spinner = null;
    this.activeText = "";
  }

  resetWithMessage(text: string) {
    if (!this.spinner) {
      return;
    }

    this.stop();
    console.log(`${COLORS.dim}${text}${COLORS.reset}`);
  }

  isActive() {
    return this.spinner !== null;
  }
}
