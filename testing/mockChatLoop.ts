// ======================Testing===========================================

import readline from "readline";
import fs from "fs";
import toolExecutor from "../tools/toolExecutor.ts";
import type { Message } from "../types/ConversationHistory.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// ====================== Helpers =========================================

function collectMultilineInput(cb: (text: string) => void) {
  const lines: string[] = [];

  const onLine = (line: string) => {
    if (line.trim() === "") {
      rl.removeListener("line", onLine);
      cb(lines.join("\n"));
    } else {
      lines.push(line);
    }
  };

  rl.on("line", onLine);
}

function persistMemory(conversationHistory: Message[]) {
  fs.writeFileSync(
    "memory_dump.json",
    JSON.stringify(conversationHistory, null, 2)
  );
}

const BLUE = "\x1b[94m";
const ITALIC = "\x1b[3m";
const RESET = "\x1b[0m";

function formatThoughtProcess(text: string): string {
  return `${BLUE}${ITALIC}${text}${RESET}`;
}

// ====================== Inner Agent Loop ================================

async function handleResponse(
  userInput: string,
  response: string,
  conversationHistory: Message[]
) {
  let currentResponse = response;
  let stepCounter = 0;
  const MAX_STEPS = 10; // safety guard

  // Save initial user message
  conversationHistory.push({
    role: "user",
    content: userInput,
  });

  persistMemory(conversationHistory);

  while (stepCounter < MAX_STEPS) {
    stepCounter++;

    const separatorIndex = currentResponse.indexOf("\n\n");
    const thoughtProcess =
      separatorIndex !== -1
        ? currentResponse.slice(0, separatorIndex)
        : "";
    const answer =
      separatorIndex !== -1
        ? currentResponse.slice(separatorIndex + 2)
        : currentResponse;

    if (thoughtProcess.startsWith("Thought Process:")) {
      console.log(formatThoughtProcess(thoughtProcess));
    }

    // Save assistant raw response
    conversationHistory.push({
      role: "assistant",
      content: currentResponse,
    });

    persistMemory(conversationHistory);

    const toolResult = toolExecutor(answer);

    // 🚀 No tool detected → final answer
    if (!toolResult) {
      console.log(`\nAI: ${answer}\n`);
      break;
    }

    // 🛠 Tool success
    if (toolResult.success) {
      console.log(`\nTool executed. Result:\n${toolResult.result}\n`);

      conversationHistory.push({
        role: "assistant",
        content: `Tool result: ${toolResult.result}`,
      });

      persistMemory(conversationHistory);

      console.log("\n--- Paste next AI response (continue reasoning) ---");
      console.log("(Finish with empty line)\n");

      currentResponse = await new Promise<string>((resolve) => {
        collectMultilineInput((nextResponse) => {
          resolve(nextResponse);
        });
      });

      continue;
    }

    // ❌ Tool failed
    console.log(`\nTool failed: ${toolResult.error}\n`);

    conversationHistory.push({
      role: "assistant",
      content: `Tool error: ${toolResult.error}`,
    });

    persistMemory(conversationHistory);

    console.log("\n--- Paste corrected AI tool JSON ---");
    console.log("(Finish with empty line)\n");

    currentResponse = await new Promise<string>((resolve) => {
      collectMultilineInput((retryResponse) => {
        resolve(retryResponse);
      });
    });
  }

  if (stepCounter >= MAX_STEPS) {
    console.log("\n⚠️ Max steps reached. Stopping loop.\n");
  }
}

// ====================== Outer CLI Loop ==================================

export function mockChatLoop(
  systemMessage: Message,
  conversationHistory: Message[]
) {
  console.log("=== Mock CLI Agent (No LLM) ===");
  console.log("Type 'exit' to quit\n");

  function loop() {
    rl.question("You: ", async (userInput: string) => {
      if (
        userInput.toLowerCase() === "exit" ||
        userInput.toLowerCase() === "quit"
      ) {
        console.log("Goodbye!");
        rl.close();
        return;
      }

      console.log("\n--- Paste AI response below ---");
      console.log("(Finish with an empty line)\n");

      collectMultilineInput(async (response) => {
        await handleResponse(userInput, response, conversationHistory);
        loop(); // restart outer loop AFTER inner loop completes
      });
    });
  }

  loop();
}
