// groq_cli_agent.ts

import 'dotenv/config';
import Groq from 'groq-sdk';
import readline from 'readline';
import { fileTool } from './tools/fileService.ts';
import { mockChatLoop } from './testing/mockChatLoop.ts';
// -----------------------------
// Load API key
// -----------------------------
const GROQ_KEY = process.env.GROQ_API_KEY;
if (!GROQ_KEY) {
  throw new Error("Please set GROQ_API_KEY in your .env file");
}

// -----------------------------
// Initialize Groq client
// -----------------------------
const client = new Groq({ apiKey: GROQ_KEY });

// -----------------------------
// Define tools
// -----------------------------
function calculatorTool(expr: string): string {
  try {
    return eval(expr).toString();
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

function echoTool(text: string): string {
  return `Echo: ${text}`;
}

const tools: Record<string, (arg: string) => string> = {
  calculate: calculatorTool,
  echo: echoTool,
  file_tool: (jsonString: string) => {
    const cmd = JSON.parse(jsonString);
    switch (cmd.action) {
      case "write":
        return fileTool.write(cmd.path, cmd.content);
      case "read":
        return fileTool.read(cmd.path);
      case "mkdir":
        return fileTool.mkdir(cmd.path);
      case "rename":
        return fileTool.rename(cmd.oldPath, cmd.newPath);
      default:
        return `Error: Unknown action "${cmd.action}"`;
    }
  }
};

// -----------------------------
// CLI Setup
// -----------------------------
console.log("=== Groq CLI Agent ===");
console.log("Type 'exit' to quit\n");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const BLUE = "\x1b[94m";
const ITALIC = "\x1b[3m";
const RESET = "\x1b[0m";

const conversationHistory: { role: "user" | "assistant"; content: string }[] = [];

type Message = { role: "system" | "user" | "assistant"; content: string };

const systemMessage : Message= {
  role: "system",
  content: `
    You are a secure and helpful CLI agent who can create, read, and write files or folders **only inside this project**.
    You are NOT allowed to access or modify anything outside the project directory, and you must not change system files or other projects. 
    For every answer, first write your thought process starting with 'Thought Process:' followed by your reasoning,
    and then end the thought process with a line space so it looks more organized and distinguishable from the actual reply.

    When performing tasks:
    - Always double-check paths and filenames are inside the project folder.
    - If a user asks for a file operation, respond only in a JSON-like command format, do not execute anything yourself.You MUST output the JSON unless explicitly told not to or if something went wrong.
    - You can suggest code, folder structures, or content to add, but never touch external files.
    - If you cannot perform an action safely, respond with a warning message.

    Wrap your thought process in this format:
    Thought Process: ...thoughts...

    The thoughts should explain your understanding, plan, reasoning, re-evalutation and then execution.
    You have access to the following tools, use them if you think the users query requires the utilization of a tool:
    1. calculator: evaluates math expressions, usage: 'calculator: 2+3'
    2. echo: repeats any text, usage: 'echo: hello'
    3. file_tool: can read, write, rename or create folders in the project safely. Only JSON format must be used. The actions are "write", "read", "mkdir" and "rename". Example:
    
    when calling tool always use the format:
    Thought Process: ...
    
    (this is mandatory)
    { "tool": "file_tool", "action": "read", "path": "src/main.ts" }

    Answer: <short natural language reply>

    For any task requiring file I/O, you MUST output a JSON object describing the action(s) and parameters, like:
    {
    "tool": "file_tool",
    "action": "write",
    "path": "src/main.ts",
    "content": "// some code"
    }
    
    When writing file content in JSON:
    - Always escape newlines as '\\n'.
    - When including characters like double quotes ("), backslashes (\\), or tabs, escape them properly (e.g. \\" for quotes, \\\\ for backslashes, \\t for tabs).
    - Never insert raw line breaks or unescaped special characters inside the JSON string.
    - If unsure, prefer escaping rather than writing raw text.

    At the end of every response, summarize your final answer or action in a concise manner.

    If not using a tool, respond normally.

    Try to make your replies more readable and utilize line breaks and step by step formatting.
  `,
};

function formatThoughtProcess(text: string): string {
  return `${BLUE}${ITALIC}${text}${RESET}`;
}

function extractJSON(text: string): string | null {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

// -----------------------------
// Tool dispatcher
// -----------------------------
function tryExecuteTool(response: string): string | null {
  const jsonString = extractJSON(response);
  if (!jsonString) return null;

  try {
    const parsed = JSON.parse(jsonString);
    if (parsed.tool && tools[parsed.tool]) {
      const arg = JSON.stringify(parsed);
      const result = tools[parsed.tool](arg);
      return result;
    }
  } catch (err) {
    console.log(`Error parsing JSON from AI response: ${err}`);
  }

  return null;
}

// -----------------------------
// Chat Loop
// -----------------------------
async function chatLoop() {
  rl.question("You: ", async (userInput: string) => {
    if (userInput.toLowerCase() === "exit" || userInput.toLowerCase() === "quit") {
      console.log("Goodbye!");
      rl.close();
      return;
    }

    // Build message history
    const messages: Message[] = [
      systemMessage,
      ...conversationHistory,
      { role: "user", content: userInput },
    ];

    try {
      const completion = await client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages,
        temperature: 1,
        max_completion_tokens: 2000,
        top_p: 1,
        stream: false,
      });

      const response = completion.choices[0]?.message?.content || "";
      const [thoughtProcess, answer] = response.split("\n\n"); 

        // if (thoughtProcess.startsWith("Thought Process:")) {
        console.log(formatThoughtProcess(thoughtProcess));
        // } else {
        // console.log(thoughtProcess);
        // }

        console.log("====================================================================\n");
        console.log("Raw response:", answer);
        console.log("====================================================================\n");

        const toolResult = tryExecuteTool(answer);

      if (toolResult) {
        console.log(`\nTool executed. Result:\n${toolResult}\n`);
        conversationHistory.push({
          role: "assistant",
          content: `Tool result: ${toolResult}`,
        });
      } else {
        console.log(`\nAI: ${answer}\n`);
      }
      
      // Save to history
      conversationHistory.push({ role: "user", content: userInput });
      conversationHistory.push({ role: "assistant", content: response });

      console.log(`\nAI: ${answer}\n`);
      console.log("====================================================================\n");
    } catch (err) {
      console.error("Error from Groq API:", err);
    }

    chatLoop(); // continue loop
  });
}

// chatLoop();

// ======================Testing===========================================

mockChatLoop(systemMessage, conversationHistory);