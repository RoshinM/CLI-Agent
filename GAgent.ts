import 'dotenv/config';
import readline from 'readline';
import { Agent } from './src/core/Agent.ts';
import { ToolRegistry } from './src/core/ToolRegistry.ts';
import { fileTools } from './src/tools/fileTools.ts';
import { calculatorTool } from './src/tools/calculatorTool.ts';
import { systemInfoTool } from './src/tools/systemInfoTool.ts';
import { searchFilesTool } from './src/tools/searchFilesTool.ts';
import { undoTool } from './src/tools/undoTool.ts';
import { shellTool } from './src/tools/shellTool.ts';

import { getSystemPrompt } from './src/prompts/systemPrompt.ts';

const GROQ_KEY = process.env.GROQ_API_KEY;
if (!GROQ_KEY) {
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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const BLUE = "\x1b[94m";
const ITALIC = "\x1b[3m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

function askForApproval(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(`${YELLOW}${question} (y/n): ${RESET}`, (answer) => {
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === "y" || normalized === "yes");
    });
  });
}

const agent = new Agent(
  GROQ_KEY,
  registry,
  systemPrompt,
  "llama-3.3-70b-versatile",
  async (toolName, args) => {
    const tool = registry.getTool(toolName);
    if (!tool?.requiresConfirmation) {
      return true;
    }

    const question =
      typeof tool.confirmationMessage === "function"
        ? tool.confirmationMessage(args)
        : tool.confirmationMessage ?? `Allow ${toolName} to run?`;

    return askForApproval(question);
  },
);

async function mainLoop() {
  rl.question("You: ", async (userInput) => {
    if (userInput.toLowerCase() === 'exit') {
      rl.close();
      return;
    }

    try {
      const { thought, answer, toolResult } = await agent.runStep(userInput);

      if (thought) console.log(`${BLUE}${ITALIC}${thought}${RESET}`);
      if (toolResult) {
        if (toolResult.success) {
          console.log(`\nTool result: ${toolResult.result}`);
        } else {
          console.log(`\nTool error: ${toolResult.error}`);
        }
      }
      console.log(`\nAI: ${answer}\n`);
      console.log("====================================================================\n");
    } catch (err: any) {
      console.error("Error:", err.message);
    }

    mainLoop();
  });
}

console.log("=== Enhanced CLI Agent ===");
console.log("Type 'exit' to quit\n");
mainLoop();
