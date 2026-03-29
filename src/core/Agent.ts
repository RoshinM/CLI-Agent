import { Groq } from "groq-sdk";
import type { Message, ToolResult } from "../types/AgentTypes.ts";
import { ToolRegistry } from "./ToolRegistry.ts";
import { MemoryManager } from "./memoryManager.ts";
import { parseModelResponse, type ParsedResponse } from "./responseParser.ts";

export class Agent {
  private client: Groq;
  private registry: ToolRegistry;
  private model: string;
  private conversationHistory: Message[] = [];
  private systemMessage: Message;
  private memoryManager: MemoryManager;
  private readonly maxRepairAttempts = 2;

  constructor(apiKey: string, registry: ToolRegistry, systemContent: string, model: string = "llama-3.3-70b-versatile") {
    this.client = new Groq({ apiKey });
    this.registry = registry;
    this.model = model;
    this.systemMessage = { role: "system", content: systemContent };
    this.memoryManager = new MemoryManager();
  }

  getHistory(): Message[] {
    return this.conversationHistory;
  }

  setHistory(history: Message[]) {
    this.conversationHistory = history;
  }

  async runStep(userInput: string): Promise<{ answer: string; thought: string; toolResult?: ToolResult }> {
    this.conversationHistory.push({ role: "user", content: userInput });
    this.memoryManager.persistWorkingMemory(this.conversationHistory);
    const response = await this.getValidatedResponse();
    this.conversationHistory.push({ role: "assistant", content: response.raw });
    this.memoryManager.persistWorkingMemory(this.conversationHistory);

    if (response.kind === "tool-call") {
      const toolResult = await this.registry.execute(response.toolCall.tool, response.toolCall.args);
      if (toolResult.success) {
        this.conversationHistory.push({ role: "assistant", content: `Tool result: ${toolResult.result}` });
      } else {
        this.conversationHistory.push({ role: "assistant", content: `Tool error: ${toolResult.error}` });
      }
      this.memoryManager.persistWorkingMemory(this.conversationHistory);
      return { answer: "", thought: response.toolCall.thought, toolResult };
    }

    this.memoryManager.finalizeTask(
      {
        history: [...this.conversationHistory],
        finalMessage: response.message,
        finalThought: response.thought,
      },
      this.conversationHistory,
    );

    return { answer: response.message, thought: response.thought };
  }

  private async getValidatedResponse(): Promise<Exclude<ParsedResponse, { kind: "invalid" }>> {
    let repairFeedback = "";

    for (let attempt = 0; attempt <= this.maxRepairAttempts; attempt++) {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: this.buildMessages(repairFeedback),
        temperature: 0.2,
        max_completion_tokens: 2000,
      });

      const response = completion.choices[0]?.message?.content || "";
      const parsed = parseModelResponse(response);

      if (parsed.kind !== "invalid") {
        return parsed;
      }

      repairFeedback = [
        "Your previous response was invalid.",
        `Problem: ${parsed.reason}`,
        "Previous response:",
        response,
        "Return a corrected response now.",
        'If you need a tool, respond with one valid JSON object that includes "thought" and "tool".',
        'If the task is complete, respond with one valid JSON object that includes "thought" and "message".',
        "Do not output plain text outside JSON.",
      ].join("\n");
    }

    throw new Error("The model repeatedly returned invalid output and could not be repaired automatically.");
  }

  private buildMessages(repairFeedback?: string): Message[] {
    const memoryContext: Message = {
      role: "system",
      content: `Long-term memory context:\n${this.memoryManager.buildPromptContext()}`,
    };
    const messages = [this.systemMessage, memoryContext, ...this.conversationHistory];

    if (repairFeedback) {
      messages.push({ role: "user", content: repairFeedback });
    }

    return messages;
  }
}
