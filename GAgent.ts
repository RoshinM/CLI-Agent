import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Agent } from './src/core/Agent.ts';
import { ToolRegistry } from './src/core/ToolRegistry.ts';
import { fileTools } from './src/tools/fileTools.ts';
import { calculatorTool } from './src/tools/calculatorTool.ts';
import { systemInfoTool } from './src/tools/systemInfoTool.ts';
import { searchFilesTool } from './src/tools/searchFilesTool.ts';
import { undoTool } from './src/tools/undoTool.ts';
import { shellTool } from './src/tools/shellTool.ts';

import { getSystemPrompt } from './src/prompts/systemPrompt.ts';

function getGroqApiKeys(): string[] {
  const keys: string[] = [];
  const primary = process.env.GROQ_API_KEY?.trim();
  if (primary) {
    keys.push(primary);
  }

  const numberedKeys = Object.entries(process.env)
    .filter(([name, value]) => /^GROQ_API_KEY\d+$/.test(name) && typeof value === "string" && value.trim())
    .sort((a, b) => {
      const aIndex = Number(a[0].replace("GROQ_API_KEY", ""));
      const bIndex = Number(b[0].replace("GROQ_API_KEY", ""));
      return aIndex - bIndex;
    })
    .map(([, value]) => value!.trim());

  keys.push(...numberedKeys);
  return Array.from(new Set(keys));
}

const GROQ_KEYS = getGroqApiKeys();
if (GROQ_KEYS.length === 0) {
  throw new Error("Please set GROQ_API_KEY in your .env file");
}

const registry = new ToolRegistry();
fileTools.forEach(t => registry.register(t));
registry.register(calculatorTool);
registry.register(systemInfoTool);
registry.register(searchFilesTool);
registry.register(undoTool);
registry.register(shellTool);

const toolList = registry.getAllTools().map(t => `- ${t.name}: ${t.description}`).join('\n');
const systemPrompt = getSystemPrompt(toolList);

const rl = readline.createInterface({ input, output });

const BLUE = "\x1b[94m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const ITALIC = "\x1b[3m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

function clearCurrentLine() {
  if (output.isTTY) {
    output.write("\r\x1b[2K");
  }
}

class LoadingIndicator {
  private readonly frames = ["|", "/", "-", "\\"];
  private frameIndex = 0;
  private timer: NodeJS.Timeout | null = null;
  private text = "Thinking";

  start(text = "Thinking") {
    this.text = text;
    if (this.timer) {
      return;
    }

    this.render();
    this.timer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      this.render();
    }, 100);
  }

  update(text: string) {
    this.text = text;
    if (this.timer) {
      this.render();
    }
  }

  stop(finalText?: string) {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    clearCurrentLine();
    if (finalText) {
      console.log(`${DIM}${finalText}${RESET}`);
    }
  }

  private render() {
    output.write(`\r${CYAN}${this.frames[this.frameIndex]} ${this.text}${RESET}`);
  }
}

function previewToolResult(result: string | undefined): string {
  const text = (result ?? "").trim();
  if (!text) {
    return "No output.";
  }

  const singleLine = text.replace(/\s+/g, " ");
  return singleLine.length > 180 ? `${singleLine.slice(0, 177)}...` : singleLine;
}

function needsConfirmation(requiresConfirmation: boolean | ((args: any) => boolean) | undefined, args: any): boolean {
  if (typeof requiresConfirmation === "function") {
    return requiresConfirmation(args);
  }

  return Boolean(requiresConfirmation);
}

const loading = new LoadingIndicator();

async function askForApproval(question: string): Promise<boolean> {
  loading.stop();
  const answer = await rl.question(`${YELLOW}${question} (y/n): ${RESET}`);
  const normalized = answer.trim().toLowerCase();
  return normalized === "y" || normalized === "yes";
}

const agent = new Agent(
  GROQ_KEYS,
  registry,
  systemPrompt,
  "llama-3.3-70b-versatile",
  async (toolName, args) => {
    const tool = registry.getTool(toolName);
    if (!tool || !needsConfirmation(tool.requiresConfirmation, args)) {
      return true;
    }

    const question =
      typeof tool.confirmationMessage === "function"
        ? tool.confirmationMessage(args)
        : tool.confirmationMessage ?? `Allow ${toolName} to run?`;

    return askForApproval(question);
  },
  {
    onModelStart: () => {
      loading.start("Thinking...");
    },
    onModelComplete: () => {
      loading.stop();
    },
    onToolStart: (toolName) => {
      console.log(`${DIM}Using tool: ${toolName}${RESET}`);
    },
    onToolResult: (toolName, result) => {
      if (result.success) {
        console.log(`${GREEN}Tool result from ${toolName}:${RESET} ${previewToolResult(result.result)}`);
      } else {
        console.log(`${RED}Tool error from ${toolName}:${RESET} ${result.error}`);
      }
    },
    onApiKeySwitch: (nextIndex, totalKeys) => {
      loading.stop();
      console.log(`${YELLOW}Rate limit hit. Switching to Groq API key ${nextIndex + 1} of ${totalKeys}.${RESET}`);
    },
  },
);

async function mainLoop() {
  while (true) {
    const userInput = await rl.question("You: ");
    if (userInput.trim().toLowerCase() === 'exit') {
      break;
    }

    if (!userInput.trim()) {
      continue;
    }

    try {
      const { thought, answer } = await agent.runStep(userInput);

      if (thought) {
        console.log(`${BLUE}${ITALIC}${thought}${RESET}`);
      }
      console.log(`\nAI: ${answer}\n`);
      console.log("====================================================================\n");
    } catch (err: any) {
      loading.stop();
      console.error(`${RED}Error:${RESET} ${err.message}`);
      console.log("====================================================================\n");
    }
  }

  rl.close();
}

console.log("=== Enhanced CLI Agent ===");
console.log("Type 'exit' to quit\n");
mainLoop().catch((err: any) => {
  loading.stop();
  console.error(`${RED}Fatal error:${RESET} ${err.message}`);
  rl.close();
});
