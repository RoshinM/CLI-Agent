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
import {
  COLORS,
  SpinnerController,
  printBanner,
  printDivider,
  printSection,
  promptConfirm,
  promptMultiline,
  promptText,
  previewText,
} from "../src/cli/terminalUi.ts";

const registry = new ToolRegistry();
fileTools.forEach(t => registry.register(t));
registry.register(calculatorTool);
registry.register(systemInfoTool);
registry.register(searchFilesTool);
registry.register(undoTool);
registry.register(shellTool);

const conversationHistory: Message[] = [];
const memoryManager = new MemoryManager();
const loading = new SpinnerController();

function askForApproval(question: string): Promise<boolean> {
  loading.stop();
  return promptConfirm(question);
}

function needsConfirmation(requiresConfirmation: boolean | ((args: any) => boolean) | undefined, args: any): boolean {
  if (typeof requiresConfirmation === "function") {
    return requiresConfirmation(args);
  }

  return Boolean(requiresConfirmation);
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

export async function mockChatLoop() {
  printBanner("Mock Agent", "Zero-token testing mode. Type 'exit' to quit.");

  const startInteraction = async () => {
    const userInput = await promptText("You");
    if (userInput.toLowerCase() === "exit") {
      return;
    }

    conversationHistory.push({ role: "user", content: userInput });
    memoryManager.persistWorkingMemory(conversationHistory);
    await processAIResponse();
  };

  const processAIResponse = async (context?: string) => {
    loading.start("Preparing payload...");
    generatePayload(conversationHistory, context);
    loading.success("Payload updated.");

    printSection("Mock Mode", "Copy mock_payload.txt into your LLM, then paste the JSON response back here.", COLORS.cyan);
    printSection("Payload", "mock_payload.txt", COLORS.yellow);
    const response = await promptMultiline("Paste the model response");
    if (!response.trim()) {
      printSection("Warning", "Empty response. Interaction reset.", COLORS.yellow);
      return startInteraction();
    }

    loading.start("Processing response...");
    conversationHistory.push({ role: "assistant", content: response });
    memoryManager.persistWorkingMemory(conversationHistory);
    
    const parsed = parseModelResponse(response);
    loading.stop();

    if (parsed.kind === "tool-call") {
      const tool = registry.getTool(parsed.toolCall.tool);
      if (!tool) {
        const errText = `Tool Error: Tool '${parsed.toolCall.tool}' not found.`;
        printSection("Tool Error", errText, COLORS.red);
        conversationHistory.push({ role: "assistant", content: errText });
        memoryManager.persistWorkingMemory(conversationHistory);
        return processAIResponse(`Error: ${errText}. Choose a valid tool and try again.`);
      }

      if (needsConfirmation(tool.requiresConfirmation, parsed.toolCall.args)) {
        const confirmationText =
          typeof tool.confirmationMessage === "function"
            ? tool.confirmationMessage(parsed.toolCall.args)
            : tool.confirmationMessage ?? `Allow ${tool.name} to run?`;
        const approved = await askForApproval(confirmationText);

        if (!approved) {
          const errText = `Tool Error: User denied approval for '${tool.name}'.`;
          printSection("Tool Error", errText, COLORS.red);
          conversationHistory.push({ role: "assistant", content: errText });
          memoryManager.persistWorkingMemory(conversationHistory);
          return processAIResponse(
            "The user denied the requested action. Choose a safer alternative or explain why approval is needed.",
          );
        }
      }

      printSection("Tool", `Using ${parsed.toolCall.tool}`, COLORS.dim);
      loading.start(`Executing ${parsed.toolCall.tool}...`);
      const result = await registry.execute(parsed.toolCall.tool, parsed.toolCall.args);
      loading.stop();

      if (result.success) {
        const resText = `Tool Result: ${result.result}`;
        printSection("Tool Result", `${parsed.toolCall.tool} -> ${previewText(result.result)}`, COLORS.green);
        conversationHistory.push({ role: "assistant", content: resText });
        memoryManager.persistWorkingMemory(conversationHistory);
        return processAIResponse(
          "A tool returned successfully. If the user asked for information, present the relevant result in your final message instead of stopping at the tool call. For directory or project-structure requests, format the final answer as an indented bullet tree with / after directory names. If more work is still needed, choose the next tool.",
        );
      }

      const errText = `Tool Error: ${result.error}`;
      printSection("Tool Error", `${parsed.toolCall.tool} -> ${result.error ?? "Unknown tool error"}`, COLORS.red);
      conversationHistory.push({ role: "assistant", content: errText });
      memoryManager.persistWorkingMemory(conversationHistory);
      return processAIResponse(`Error: ${result.error}. Fix the tool call arguments and try again.`);
    }

    if (parsed.kind === "invalid") {
      printSection("Response Error", parsed.reason, COLORS.red);
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

    printSection("Thought", parsed.thought, COLORS.blue, true);
    printSection("Answer", parsed.message, COLORS.magenta);
    printDivider();
    console.log();
    return startInteraction();
  };

  await startInteraction();
}
