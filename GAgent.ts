import 'dotenv/config';
import { Agent } from './src/core/Agent.ts';
import { ToolRegistry } from './src/core/ToolRegistry.ts';
import { fileTools } from './src/tools/fileTools.ts';
import { calculatorTool } from './src/tools/calculatorTool.ts';
import { systemInfoTool } from './src/tools/systemInfoTool.ts';
import { searchFilesTool } from './src/tools/searchFilesTool.ts';
import { undoTool } from './src/tools/undoTool.ts';
import { shellTool } from './src/tools/shellTool.ts';

import { getSystemPrompt } from './src/prompts/systemPrompt.ts';
import { getWorkspaceRoot } from './src/core/workspace.ts';
import {
  COLORS,
  parseStructuredToolError,
  SpinnerController,
  previewText,
  printBanner,
  printDivider,
  printSection,
  promptConfirm,
  promptText,
  summarizeToolError,
} from './src/cli/terminalUi.ts';

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
const workspaceRoot = getWorkspaceRoot();

function needsConfirmation(requiresConfirmation: boolean | ((args: any) => boolean) | undefined, args: any): boolean {
  if (typeof requiresConfirmation === "function") {
    return requiresConfirmation(args);
  }

  return Boolean(requiresConfirmation);
}

const loading = new SpinnerController();

async function askForApproval(question: string): Promise<boolean> {
  loading.stop();
  return promptConfirm(question);
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
      printSection("Tool", `Using ${toolName}`, COLORS.dim);
    },
    onToolResult: (toolName, result) => {
      if (result.success) {
        printSection("Tool Result", `${toolName} -> ${previewText(result.result)}`, COLORS.green);
      } else {
        printSection("Tool Error", `${toolName} -> ${summarizeToolError(result.error)}`, COLORS.red);
      }
    },
    onApiKeySwitch: (nextIndex, totalKeys) => {
      loading.stop();
      printSection("Rate Limit", `Switching to Groq API key ${nextIndex + 1} of ${totalKeys}`, COLORS.yellow);
    },
    onToolErrorRecovery: async (toolName, args, result) => {
      if (toolName !== "shell_tool" || args.interactive === true) {
        return undefined;
      }

      const structuredError = parseStructuredToolError(result.error);
      if (!structuredError?.interactivePromptDetected) {
        return undefined;
      }

      loading.stop();
      if (structuredError.promptPreview) {
        printSection("Interactive Prompt", structuredError.promptPreview, COLORS.yellow);
      }

      const rerunInteractively = await promptConfirm(
        "This command needs interactive input. Run it interactively so you can answer the prompts yourself?",
      );

      if (!rerunInteractively) {
        return undefined;
      }

      printSection("Tool", "Re-running shell_tool in interactive mode", COLORS.dim);
      return registry.execute("shell_tool", { ...args, interactive: true });
    },
  },
);

async function mainLoop() {
  while (true) {
    const userInput = await promptText("You");
    if (userInput.trim().toLowerCase() === 'exit') {
      break;
    }

    if (!userInput.trim()) {
      continue;
    }

    try {
      const { thought, answer } = await agent.runStep(userInput);

      if (thought) {
        printSection("Thought", thought, COLORS.blue, true);
      }
      printSection("Answer", answer, COLORS.magenta);
      printDivider();
      console.log();
    } catch (err: any) {
      loading.stop();
      printSection("Error", err.message, COLORS.red);
      printDivider();
      console.log();
    }
  }
}

printBanner("TS Agent", `Groq-backed CLI agent. Workspace: ${workspaceRoot}`);
mainLoop().catch((err: any) => {
  loading.stop();
  printSection("Fatal Error", err.message, COLORS.red);
});
