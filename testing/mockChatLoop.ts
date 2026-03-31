import readline from "readline";
import fs from "fs";
import { ToolRegistry } from "../src/core/ToolRegistry.ts";
import { fileTools } from "../src/tools/fileTools.ts";
import { calculatorTool } from "../src/tools/calculatorTool.ts";
import { systemInfoTool } from "../src/tools/systemInfoTool.ts";
import { searchFilesTool } from "../src/tools/searchFilesTool.ts";
import { undoTool } from "../src/tools/undoTool.ts";
import { shellTool } from "../src/tools/shellTool.ts";
import { MemoryManager } from "../src/core/memoryManager.ts";
import type { Message } from "../src/types/AgentTypes.ts";
import { parseModelResponse } from "../src/core/responseParser.ts";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const registry = new ToolRegistry();
fileTools.forEach(t => registry.register(t));
registry.register(calculatorTool);
registry.register(systemInfoTool);
registry.register(searchFilesTool);
registry.register(undoTool);
registry.register(shellTool);

const conversationHistory: Message[] = [];
const memoryManager = new MemoryManager();

function collectMultilineInput(cb: (text: string) => void) {
  const lines: string[] = [];
  let lastWasEmpty = false;
  const onLine = (line: string) => {
    if (line.trim() === "") {
      if (lastWasEmpty) {
        rl.removeListener("line", onLine);
        lines.pop(); 
        cb(lines.join("\n"));
      } else {
        lastWasEmpty = true;
        lines.push(line);
      }
    } else {
      lastWasEmpty = false;
      lines.push(line);
    }
  };
  rl.on("line", onLine);
}

function askForApproval(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(`${YELLOW}${question} (y/n): ${RESET}`, (answer) => {
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === "y" || normalized === "yes");
    });
  });
}

function generatePayload(history: Message[], errorContext?: string) {
  // Use strict JSON promptV3 + memory dump + end prompt
  const promptV3 = fs.readFileSync("prompts/promptV3.txt", "utf-8");
  const endPrompt = fs.readFileSync("prompts/endPrompt.txt", "utf-8");
  const longTermMemory = memoryManager.buildPromptContext();
  
  const payload = [
    "=== SYSTEM PROMPT (V3) ===",
    promptV3,
    "\n=== LONG-TERM THREAD MEMORY ===",
    longTermMemory,
    "\n=== CONVERSATION HISTORY (MEMORY DUMP) ===",
    JSON.stringify(history, null, 2),
    errorContext ? `\n=== ERROR FEEDBACK ===\n${errorContext}` : "",
    "\n=== END INSTRUCTION ===",
    endPrompt
  ].filter(Boolean).join("\n");
  
  fs.writeFileSync("mock_payload.txt", payload);
  memoryManager.persistWorkingMemory(history);
}

const BLUE = "\x1b[94m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

export async function mockChatLoop() {
  console.log("=== Simplified Mock CLI Agent (JSON Mode) ===");
  console.log("Type 'exit' to quit\n");

  const startInteraction = async () => {
    rl.question("\nYou: ", async (userInput) => {
      if (userInput.toLowerCase() === "exit") {
        rl.close();
        return;
      }

      conversationHistory.push({ role: "user", content: userInput });
      memoryManager.persistWorkingMemory(conversationHistory);
      await processAIResponse();
    });
  };

  const processAIResponse = async (context?: string) => {
    generatePayload(conversationHistory, context);

    console.log(`\n${BLUE}--- Action Required ---${RESET}`);
    console.log(`1. Copy payload from ${YELLOW}mock_payload.txt${RESET}`);
    console.log(`2. Paste to LLM (JSON Mode Active)`);
    console.log(`3. Paste LLM's response below and press Enter twice:`);

    collectMultilineInput(async (response) => {
      if (!response.trim()) {
        console.log(`${YELLOW}Empty response. Interaction reset.${RESET}`);
        return startInteraction();
      }

      conversationHistory.push({ role: "assistant", content: response });
      memoryManager.persistWorkingMemory(conversationHistory);
      
      const parsed = parseModelResponse(response);

      if (parsed.kind === "tool-call") {
        const tool = registry.getTool(parsed.toolCall.tool);
        if (!tool) {
          const errText = `Tool Error: Tool '${parsed.toolCall.tool}' not found.`;
          console.log(`\n${RED}${errText}${RESET}`);
          conversationHistory.push({ role: "assistant", content: errText });
          memoryManager.persistWorkingMemory(conversationHistory);
          return processAIResponse(`Error: ${errText}. Choose a valid tool and try again.`);
        }

        if (tool.requiresConfirmation) {
          const confirmationText =
            typeof tool.confirmationMessage === "function"
              ? tool.confirmationMessage(parsed.toolCall.args)
              : tool.confirmationMessage ?? `Allow ${tool.name} to run?`;
          const approved = await askForApproval(confirmationText);

          if (!approved) {
            const errText = `Tool Error: User denied approval for '${tool.name}'.`;
            console.log(`\n${RED}${errText}${RESET}`);
            conversationHistory.push({ role: "assistant", content: errText });
            memoryManager.persistWorkingMemory(conversationHistory);
            return processAIResponse(
              "The user denied the requested action. Choose a safer alternative or explain why approval is needed.",
            );
          }
        }

        console.log(`\n${YELLOW}Executing tool: ${parsed.toolCall.tool}...${RESET}`);
        const result = await registry.execute(parsed.toolCall.tool, parsed.toolCall.args);

        if (result.success) {
          const resText = `Tool Result: ${result.result}`;
          console.log(`\n${BLUE}${resText}${RESET}`);
          conversationHistory.push({ role: "assistant", content: resText });
          memoryManager.persistWorkingMemory(conversationHistory);
          return processAIResponse(
            "A tool returned successfully. If the user asked for information, present the relevant result in your final message instead of stopping at the tool call. For directory or project-structure requests, format the final answer as an indented bullet tree with / after directory names. If more work is still needed, choose the next tool.",
          );
        }

        const errText = `Tool Error: ${result.error}`;
        console.log(`\n${RED}${errText}${RESET}`);
        conversationHistory.push({ role: "assistant", content: errText });
        memoryManager.persistWorkingMemory(conversationHistory);
        return processAIResponse(`Error: ${result.error}. Fix the tool call arguments and try again.`);
      }

      if (parsed.kind === "invalid") {
        console.log(`\n${RED}Response Format Error: ${parsed.reason}${RESET}`);
        return processAIResponse(`Invalid response format: ${parsed.reason} Study the previous error, infer what went wrong, and return a corrected response.`);
      }

      memoryManager.finalizeTask(
        {
          history: [...conversationHistory],
          finalMessage: parsed.message,
          finalThought: parsed.thought,
        },
        conversationHistory,
      );

      console.log(`\n${BLUE}AI Response:${RESET}\n${parsed.message}`);
      return startInteraction();
    });
  };

  startInteraction();
}
