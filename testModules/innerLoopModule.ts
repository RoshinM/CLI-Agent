import { conversationHistory } from "../context/memory";
import toolExecutor from "../tools/toolExecutor";
import { Message } from "../types/ConversationHistory";
import readline from "readline";

export default async function innerLoopModule(
  answer: string,
  systemMessage: Message
) {
  let currentResponse = answer;
  let retries = 0;
  const MAX_RETRIES = 3;

  while (retries < MAX_RETRIES) {
    const toolExecution = toolExecutor(currentResponse);

    if (!toolExecution) break;

    if (toolExecution.success) {
      console.log(`\nTool executed. Result:\n${toolExecution.result}\n`);

      conversationHistory.push({
        role: "assistant",
        content: `Tool result: ${toolExecution.result}`,
      });

      break;
    } else {
      retries++;

      console.log(`\nTool failed: ${toolExecution.error}\n`);

      const errorPrompt = `
The previous tool call failed with this error:
${toolExecution.error}

Fix the JSON and resend ONLY valid tool JSON.
`;

      conversationHistory.push({ role: "assistant", content: currentResponse });
      conversationHistory.push({ role: "user", content: errorPrompt });

      console.log("\n--- Paste corrected LLM response below ---");
      console.log("(Finish with empty line)\n");

      await new Promise<void>((resolve) => {
        collectMultilineInput((response) => {
          currentResponse = response;
          resolve();
        });
      });
    }
  }
}

function collectMultilineInput(cb: (text: string) => void) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const lines: string[] = [];

  const onLine = (line: string) => {
    // Stop when user presses Enter on empty line
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

