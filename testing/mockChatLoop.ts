// // ======================Testing===========================================

// function collectMultilineInput(cb: (text: string) => void) {
//   const lines: string[] = [];

//   const onLine = (line: string) => {
//     if (line === "") {
//       rl.removeListener("line", onLine);
//       cb(lines.join("\n"));
//     } else {
//       lines.push(line);
//     }
//   };

//   rl.on("line", onLine);
// }

// function handleResponse(
//   userInput: string,
//   response: string
// ) {
//   const separatorIndex = response.indexOf("\n\n");
//   const thoughtProcess =
//     separatorIndex !== -1 ? response.slice(0, separatorIndex) : "";
//   const answer =
//     separatorIndex !== -1 ? response.slice(separatorIndex + 2) : response;

//   if (thoughtProcess.startsWith("Thought Process:")) {
//     console.log(formatThoughtProcess(thoughtProcess));
//   }

//   console.log("====================================================================\n");
//   console.log("Raw response:", answer);
//   console.log("====================================================================\n");

//   const toolResult = tryExecuteTool(answer);

//   if (toolResult) {
//     console.log(`\nTool executed. Result:\n${toolResult}\n`);
//   } else {
//     console.log(`\nAI: ${answer}\n`);
//   }
// }

// export function mockChatLoop(
//   systemMessage: Message,
//   conversationHistory: Message[]
// ) {
//   console.log("=== Mock CLI Agent (No LLM) ===");
//   console.log("Type 'exit' to quit\n");

//   function loop() {
//     rl.question("You: ", (userInput: string) => {
//       if (
//         userInput.toLowerCase() === "exit" ||
//         userInput.toLowerCase() === "quit"
//       ) {
//         console.log("Goodbye!");
//         rl.close();
//         return;
//       }

//       console.log("\n--- Paste AI response below ---");
//       console.log("(Finish with an empty line)\n");

//       collectMultilineInput((response) => {
//         handleResponse(userInput, response);
//         loop();
//       });
//     });
//   }

//   loop();
// }

// mockChatLoop(systemMessage, conversationHistory);