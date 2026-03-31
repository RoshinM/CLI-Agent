import fs from "fs";
import { Groq } from "groq-sdk";
import type { Message, ToolResult } from "../types/AgentTypes.ts";
import { ToolRegistry } from "./ToolRegistry.ts";
import { MemoryManager } from "./memoryManager.ts";
import { parseModelResponse, type ParsedResponse } from "./responseParser.ts";

type ApprovalHandler = (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
type AgentCallbacks = {
  onModelStart?: () => void;
  onModelComplete?: () => void;
  onToolStart?: (toolName: string, args: Record<string, unknown>) => void;
  onToolResult?: (toolName: string, result: ToolResult) => void;
  onApiKeySwitch?: (nextIndex: number, totalKeys: number) => void;
};

export class Agent {
  private client: Groq;
  private apiKeys: string[];
  private activeApiKeyIndex: number;
  private registry: ToolRegistry;
  private model: string;
  private conversationHistory: Message[] = [];
  private systemMessage: Message;
  private memoryManager: MemoryManager;
  private readonly maxRepairAttempts = 2;
  private readonly maxStepsPerRun = 6;
  private readonly debugPayloadPath = "mock_payload.txt";
  private readonly requestTimeoutMs = 45000;
  private approvalHandler?: ApprovalHandler;
  private callbacks?: AgentCallbacks;

  constructor(
    apiKey: string | string[],
    registry: ToolRegistry,
    systemContent: string,
    model: string = "llama-3.3-70b-versatile",
    approvalHandler?: ApprovalHandler,
    callbacks?: AgentCallbacks,
  ) {
    this.apiKeys = Array.isArray(apiKey) ? apiKey.filter(Boolean) : [apiKey];
    if (this.apiKeys.length === 0) {
      throw new Error("At least one API key is required.");
    }
    this.activeApiKeyIndex = 0;
    this.client = new Groq({ apiKey: this.apiKeys[this.activeApiKeyIndex] });
    this.registry = registry;
    this.model = model;
    this.systemMessage = { role: "system", content: systemContent };
    this.memoryManager = new MemoryManager();
    this.approvalHandler = approvalHandler;
    this.callbacks = callbacks;
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
    let continuationContext = "";
    let lastToolResult: ToolResult | undefined;

    for (let step = 0; step < this.maxStepsPerRun; step++) {
      const response = await this.getValidatedResponse(continuationContext);
      this.conversationHistory.push({ role: "assistant", content: response.raw });
      this.memoryManager.persistWorkingMemory(this.conversationHistory);

      if (response.kind === "final-answer") {
        this.memoryManager.finalizeTask(
          {
            history: [...this.conversationHistory],
            finalMessage: response.message,
            finalThought: response.thought,
          },
          this.conversationHistory,
        );

        return { answer: response.message, thought: response.thought, toolResult: lastToolResult };
      }

      const tool = this.registry.getTool(response.toolCall.tool);
      if (!tool) {
        lastToolResult = { success: false, error: `Tool '${response.toolCall.tool}' not found.` };
        this.conversationHistory.push({ role: "assistant", content: `Tool error: ${lastToolResult.error}` });
        this.memoryManager.persistWorkingMemory(this.conversationHistory);
        continuationContext = `The requested tool was not found: ${response.toolCall.tool}. Choose a valid tool or finish only if the task can truly be answered without another tool.`;
        continue;
      }

      if (this.needsConfirmation(tool.requiresConfirmation, response.toolCall.args) && this.approvalHandler) {
        const approved = await this.approvalHandler(response.toolCall.tool, response.toolCall.args);
        if (!approved) {
          lastToolResult = {
            success: false,
            error: `User denied approval for '${response.toolCall.tool}'.`,
          };
          this.conversationHistory.push({ role: "assistant", content: `Tool error: ${lastToolResult.error}` });
          this.memoryManager.persistWorkingMemory(this.conversationHistory);
          continuationContext =
            "The user denied approval for the requested tool. Choose a safer alternative or explain clearly why approval is still needed.";
          continue;
        }
      }

      this.callbacks?.onToolStart?.(response.toolCall.tool, response.toolCall.args);
      lastToolResult = await this.registry.execute(response.toolCall.tool, response.toolCall.args);
      this.callbacks?.onToolResult?.(response.toolCall.tool, lastToolResult);
      if (lastToolResult.success) {
        this.conversationHistory.push({ role: "assistant", content: `Tool result: ${lastToolResult.result}` });
        continuationContext =
          "A tool returned successfully. If the user asked for information, present the relevant result in your final message instead of stopping at the tool call. For directory or project-structure requests, format the final answer as an indented bullet tree with / after directory names. If more work is still needed, choose the next tool.";
      } else {
        this.conversationHistory.push({ role: "assistant", content: `Tool error: ${lastToolResult.error}` });
        continuationContext = `A tool failed with this error: ${lastToolResult.error}. Fix the issue, choose a better tool, or explain why the task cannot continue.`;
      }
      this.memoryManager.persistWorkingMemory(this.conversationHistory);
    }

    throw new Error("The agent reached the maximum number of internal steps before producing a final answer.");
  }

  private async getValidatedResponse(extraContext?: string): Promise<Exclude<ParsedResponse, { kind: "invalid" }>> {
    let repairFeedback = "";

    for (let attempt = 0; attempt <= this.maxRepairAttempts; attempt++) {
      const messages = this.buildMessages(repairFeedback, extraContext);
      this.persistDebugPayload(extraContext, repairFeedback);
      const completion = await this.createCompletionWithFailover(messages);

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

  private buildMessages(repairFeedback?: string, extraContext?: string): Message[] {
    const memoryContext: Message = {
      role: "system",
      content: `Long-term memory context:\n${this.memoryManager.buildPromptContext()}`,
    };
    const messages = [this.systemMessage, memoryContext, ...this.conversationHistory];

    if (extraContext) {
      messages.push({ role: "user", content: extraContext });
    }

    if (repairFeedback) {
      messages.push({ role: "user", content: repairFeedback });
    }

    return messages;
  }

  private persistDebugPayload(extraContext?: string, repairFeedback?: string) {
    let endPrompt = 'NOTE: You must respond in JSON every single time or the system will break.';

    try {
      endPrompt = fs.readFileSync("prompts/endPrompt.txt", "utf-8");
    } catch {
      // Keep fallback end prompt when the file is unavailable.
    }

    const payload = [
      "=== SYSTEM PROMPT (API) ===",
      this.systemMessage.content,
      "\n=== LONG-TERM THREAD MEMORY ===",
      this.memoryManager.buildPromptContext(),
      "\n=== CONVERSATION HISTORY (MEMORY DUMP) ===",
      JSON.stringify(this.conversationHistory, null, 2),
      extraContext ? `\n=== CONTINUATION CONTEXT ===\n${extraContext}` : "",
      repairFeedback ? `\n=== ERROR FEEDBACK ===\n${repairFeedback}` : "",
      "\n=== END INSTRUCTION ===",
      endPrompt,
    ].filter(Boolean).join("\n");

    fs.writeFileSync(this.debugPayloadPath, payload);
  }

  private needsConfirmation(
    requiresConfirmation: boolean | ((args: Record<string, unknown>) => boolean) | undefined,
    args: Record<string, unknown>,
  ): boolean {
    if (typeof requiresConfirmation === "function") {
      return requiresConfirmation(args);
    }

    return Boolean(requiresConfirmation);
  }

  private async createCompletionWithFailover(messages: Message[]) {
    const attemptsForThisCall = Math.max(this.apiKeys.length, 1);
    let lastError: unknown;

    for (let attempt = 0; attempt < attemptsForThisCall; attempt++) {
      this.callbacks?.onModelStart?.();
      try {
        return await Promise.race([
          this.client.chat.completions.create({
            model: this.model,
            messages,
            temperature: 0.2,
            max_completion_tokens: 2000,
          }),
          this.createTimeoutPromise(),
        ]);
      } catch (error) {
        lastError = error;
        if (!this.isRateLimitError(error) || this.apiKeys.length === 1) {
          throw error;
        }

        this.rotateApiKey();
        continue;
      } finally {
        this.callbacks?.onModelComplete?.();
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("All configured API keys hit rate limits for this request.");
  }

  private rotateApiKey() {
    this.activeApiKeyIndex = (this.activeApiKeyIndex + 1) % this.apiKeys.length;
    this.client = new Groq({ apiKey: this.apiKeys[this.activeApiKeyIndex] });
    this.callbacks?.onApiKeySwitch?.(this.activeApiKeyIndex, this.apiKeys.length);
  }

  private isRateLimitError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }

    const status = "status" in error ? (error as { status?: unknown }).status : undefined;
    if (status === 429) {
      return true;
    }

    const message =
      "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message.toLowerCase()
        : "";

    return message.includes("rate limit") || message.includes("too many requests") || message.includes("429");
  }

  private createTimeoutPromise(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Model request timed out after ${this.requestTimeoutMs / 1000} seconds.`));
      }, this.requestTimeoutMs);
    });
  }
}
