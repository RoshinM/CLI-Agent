import "dotenv/config";
import readline from "readline";
import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { DynamicTool } from "@langchain/core/tools";
import { initializeAgentExecutorWithOptions } from "langchain/agents";

// -----------------------------
// Load API key
// -----------------------------
const GROQ_KEY = process.env.GROQ_API_KEY;
if (!GROQ_KEY) {
  throw new Error("Please set GROQ_API_KEY in your .env file");
}

// -----------------------------
// Define tools
// -----------------------------
const calculatorTool = new DynamicTool({
  name: "calculate",
  description: "Evaluates a math expression. Usage: 'calculator: 2+3'",
  func: async (expr: string) => {
    try {
      // ⚠️ eval is unsafe, just for demo
      return eval(expr).toString();
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  },
});

const echoTool = new DynamicTool({
  name: "echo",
  description: "Repeats back the given text. Usage: 'echo: hello'",
  func: async (text: string) => `Echo: ${text}`,
});

const tools = [calculatorTool, echoTool];

// -----------------------------
// Initialize Groq model
// -----------------------------
const model = new ChatGroq({
  apiKey: GROQ_KEY,
  model: "llama-3.3-70b-versatile",
  temperature: 1,
  maxTokens: 512,
});

// -----------------------------
// Initialize LangChain agent
// -----------------------------
const executor = await initializeAgentExecutorWithOptions(tools, model, {
  agentType: "chat-conversational-react-description",
  verbose: false,
});

// -----------------------------
// CLI Setup
// -----------------------------
console.log("=== Groq CLI Agent (LangChain) ===");
console.log("Type 'exit' to quit\n");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const BLUE = "\x1b[94m";
const ITALIC = "\x1b[3m";
const RESET = "\x1b[0m";

const conversationHistory: (SystemMessage | HumanMessage)[] = [
  new SystemMessage(
    `You are a helpful CLI agent. 
For every answer, first write your thought process starting with 'Thought Process:' 
followed by your reasoning, then leave a blank line, 
and finally give the actual reply.

You have access to the following tools:
1. calculator: evaluates math expressions, usage: 'calculator: 2+3'
2. echo: repeats any text, usage: 'echo: hello'

When using a tool, respond in this format:
Tool used: <tool_name>
<Short message + output>

If not using a tool, respond normally.
Use line breaks and step by step formatting.`
  ),
];

function formatThoughtProcess(text: string): string {
  return `${BLUE}${ITALIC}${text}${RESET}`;
}

async function chatLoop() {
  rl.question("You: ", async (userInput: string) => {
    if (userInput.toLowerCase() === "exit" || userInput.toLowerCase() === "quit") {
      console.log("Goodbye!");
      rl.close();
      return;
    }

    try {
      const response = await executor.invoke({
        input: userInput,
        chat_history: conversationHistory,
      });

      const output = response.output || response.output_text || "";
      const [thoughtProcess, answer] = output.split("\n\n");

      if (thoughtProcess?.startsWith("Thought Process:")) {
        console.log(formatThoughtProcess(thoughtProcess));
      }

      console.log(`\nAI: ${answer}\n`);
      console.log("====================================================================\n");

      console.log("RAW RESPONSE LOGGER:");
      console.log(response.output)
      console.log("====================================================================\n");

      conversationHistory.push(new HumanMessage(userInput));
    } catch (err) {
      console.error("Error:", err);
    }

    chatLoop();
  });
}

chatLoop();
