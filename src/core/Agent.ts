import { Groq } from "groq-sdk";
import type { Message, ToolResult } from "../types/AgentTypes.ts";
import { ToolRegistry } from "./ToolRegistry.ts";

export class Agent {
  private client: Groq;
  private registry: ToolRegistry;
  private model: string;
  private conversationHistory: Message[] = [];
  private systemMessage: Message;

  constructor(apiKey: string, registry: ToolRegistry, systemContent: string, model: string = "llama-3.3-70b-versatile") {
    this.client = new Groq({ apiKey });
    this.registry = registry;
    this.model = model;
    this.systemMessage = { role: "system", content: systemContent };
  }

  getHistory(): Message[] {
    return this.conversationHistory;
  }

  setHistory(history: Message[]) {
    this.conversationHistory = history;
  }

  async runStep(userInput: string): Promise<{ answer: string; thought: string; toolResult?: ToolResult }> {
    this.conversationHistory.push({ role: "user", content: userInput });

    const messages = [this.systemMessage, ...this.conversationHistory];

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.7,
      max_completion_tokens: 2000,
    });

    const response = completion.choices[0]?.message?.content || "";
    this.conversationHistory.push({ role: "assistant", content: response });

    const { thought, answer, toolCall } = this.parseResponse(response);

    if (toolCall) {
      const toolResult = await this.registry.execute(toolCall.tool, toolCall.args);
      if (toolResult.success) {
        this.conversationHistory.push({ role: "assistant", content: `Tool result: ${toolResult.result}` });
      } else {
        this.conversationHistory.push({ role: "assistant", content: `Tool error: ${toolResult.error}` });
      }
      return { answer, thought, toolResult };
    }

    return { answer, thought };
  }

  private parseResponse(text: string): { thought: string; answer: string; toolCall?: { tool: string; args: any } } {
    // Robust parsing for Thought Process and Tool Call
    const thoughtMatch = text.match(/Thought Process:\s*([\s\S]*?)(\n\n|$)/i);
    const thought = thoughtMatch ? thoughtMatch[1].trim() : "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    let toolCall;
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.tool) {
          const { tool, ...args } = parsed;
          toolCall = { tool, args };
        }
      } catch (e) {
        // Silently fail if not valid tool JSON
      }
    }

    // The answer is whatever is left after the thought process and JSON
    let answer = text
      .replace(/Thought Process:\s*[\s\S]*?(\n\n|$)/i, "")
      .replace(/\{[\s\S]*\}/, "")
      .trim();

    if (!answer && !toolCall) {
      answer = text;
    }

    return { thought, answer, toolCall };
  }
}
