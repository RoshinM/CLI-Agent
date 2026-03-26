import readline from "readline";
import fs from "fs";
import { ToolRegistry } from "../src/core/ToolRegistry.ts";
import { fileTools } from "../src/tools/fileTools.ts";
import { calculatorTool } from "../src/tools/calculatorTool.ts";
import { systemInfoTool } from "../src/tools/systemInfoTool.ts";
import { searchFilesTool } from "../src/tools/searchFilesTool.ts";
import { undoTool } from "../src/tools/undoTool.ts";
import type { Message } from "../src/types/AgentTypes.ts";

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
  // Use the user's preferred combination: promptV2 + memory_dump + endPrompt
  const promptV2 = fs.readFileSync("prompts/promptV2.txt", "utf-8");
  const endPrompt = fs.readFileSync("prompts/endPrompt.txt", "utf-8");
  
  const payload = [
    "=== SYSTEM PROMPT (V2) ===",
    promptV2,
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
      
      // Look for JSON (pure JSON from promptV2)
      const jsonMatch = response.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          console.log(`\n${YELLOW}Executing tool: ${parsed.tool}...${RESET}`);
          const result = await registry.execute(parsed.tool, parsed);

          if (result.success) {
            const resText = `Tool Result: ${result.result}`;
            console.log(`\n${BLUE}${resText}${RESET}`);
            conversationHistory.push({ role: "assistant", content: resText });
            return processAIResponse("Tool executed. Determine the next step.");
          } else {
            const errText = `Tool Error: ${result.error}`;
            console.log(`\n${RED}${errText}${RESET}`);
            conversationHistory.push({ role: "assistant", content: errText });
            return processAIResponse(`Error: ${result.error}. Fix the JSON parameters.`);
          }
        } catch (e: any) {
          console.log(`\n${RED}JSON Parsing Error: ${e.message}${RESET}`);
          return processAIResponse(`Invalid JSON: ${e.message}. Ensure proper escaping.`);
        }
      } else {
        // Natural language response
        console.log(`\n${BLUE}AI Response:${RESET}\n${response}`);
        return startInteraction();
      }
    });
  };

  startInteraction();
}
