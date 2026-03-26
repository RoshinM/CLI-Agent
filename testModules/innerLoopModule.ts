import { conversationHistory } from "../context/memory";
import toolExecutor from "../tools/toolExecutor";
import { Message } from "../types/ConversationHistory";
import readline from "readline";
import persistMemory from "./persistMemory";

export default async function innerLoopModule(
  answer: string,
  systemMessage: Message
) {
  let currentResponse = answer;
  let retries = 0;
  const MAX_RETRIES = 3;

  while (retries < MAX_RETRIES) {

    // Save the assistant response (tool call)
    conversationHistory.push({
      role: "assistant",
      content: currentResponse,
    });

    await persistMemory(conversationHistory);

    const toolExecution = toolExecutor(currentResponse);

    // No tool detected → final answer
    if (!toolExecution) {
      console.log("\nFinal Answer:\n", currentResponse, "\n");
      break;
    }

    // Tool succeeded
    if (toolExecution.success) {
      console.log(`\nTool executed. Result:\n${toolExecution.result}\n`);

      // Save tool output correctly
      conversationHistory.push({
        role: "tool",
        content: toolExecution.result!,
      });

    await persistMemory(conversationHistory);


      // Ask LLM to continue reasoning
      console.log("\n--- Paste next LLM response (continue reasoning) ---");
      console.log("(Finish with empty line)\n");

      await new Promise<void>((resolve) => {
        collectMultilineInput((response) => {
          currentResponse = response;
          resolve();
        });
      });

      // Reset retry counter after successful tool execution
      retries = 0;
      continue;
    }

    // Tool failed
    retries++;

    console.log(`\nTool failed: ${toolExecution.error}\n`);

    const errorPrompt = `
The previous tool call failed with this error:
${toolExecution.error}

Fix the JSON and resend ONLY valid tool JSON.
`;

    conversationHistory.push({
      role: "user",
      content: errorPrompt,
    });

    console.log("\n--- Paste corrected LLM response ---");
    console.log("(Finish with empty line)\n");

    await new Promise<void>((resolve) => {
      collectMultilineInput((response) => {
        currentResponse = response;
        resolve();
      });
    });
  }

  if (retries >= MAX_RETRIES) {
    console.log("\n Max retries reached. Stopping.\n");
  }
}

function collectMultilineInput(cb: (text: string) => void) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const lines: string[] = [];

  const onLine = (line: string) => {
    if (line.trim() === "") {
      rl.removeListener("line", onLine);
      rl.close();
      cb(lines.join("\n"));
      return;
    }

    lines.push(line);
  };

  rl.on("line", onLine);
}