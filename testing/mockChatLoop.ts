import readline from "readline";
import fs from "fs";
import { ToolRegistry } from "../src/core/ToolRegistry.ts";
import { fileTools } from "../src/tools/fileTools.ts";
import { calculatorTool } from "../src/tools/calculatorTool.ts";
import { systemInfoTool } from "../src/tools/systemInfoTool.ts";
import { searchFilesTool } from "../src/tools/searchFilesTool.ts";
import { undoTool } from "../src/tools/undoTool.ts";
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

const conversationHistory: Message[] = [];

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

function generatePayload(history: Message[], errorContext?: string) {
  // Use strict JSON promptV3 + memory dump + end prompt
  const promptV3 = fs.readFileSync("prompts/promptV3.txt", "utf-8");
  const endPrompt = fs.readFileSync("prompts/endPrompt.txt", "utf-8");
  
  const payload = [
    "=== SYSTEM PROMPT (V3) ===",
    promptV3,
    "\n=== CONVERSATION HISTORY (MEMORY DUMP) ===",
    JSON.stringify(history, null, 2),
    errorContext ? `\n=== ERROR FEEDBACK ===\n${errorContext}` : "",
    "\n=== END INSTRUCTION ===",
    endPrompt
  ].filter(Boolean).join("\n");
  
  fs.writeFileSync("mock_payload.txt", payload);
  fs.writeFileSync("memory_dump.json", JSON.stringify(history, null, 2));
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
      
      const parsed = parseModelResponse(response);

      if (parsed.kind === "tool-call") {
        console.log(`\n${YELLOW}Executing tool: ${parsed.toolCall.tool}...${RESET}`);
        const result = await registry.execute(parsed.toolCall.tool, parsed.toolCall.args);

        if (result.success) {
          const resText = `Tool Result: ${result.result}`;
          console.log(`\n${BLUE}${resText}${RESET}`);
          conversationHistory.push({ role: "assistant", content: resText });
          return processAIResponse("Tool executed. Determine the next step.");
        }

        const errText = `Tool Error: ${result.error}`;
        console.log(`\n${RED}${errText}${RESET}`);
        conversationHistory.push({ role: "assistant", content: errText });
        return processAIResponse(`Error: ${result.error}. Fix the tool call arguments and try again.`);
      }

      if (parsed.kind === "invalid") {
        console.log(`\n${RED}Response Format Error: ${parsed.reason}${RESET}`);
        return processAIResponse(`Invalid response format: ${parsed.reason} Study the previous error, infer what went wrong, and return a corrected response.`);
      }

      console.log(`\n${BLUE}AI Response:${RESET}\n${parsed.message}`);
      return startInteraction();
    });
  };

  startInteraction();
}
