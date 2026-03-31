import { Groq } from "groq-sdk";
import type { Message, ToolResult } from "../types/AgentTypes.ts";
import { ToolRegistry } from "./ToolRegistry.ts";
import { MemoryManager } from "./memoryManager.ts";
import { parseModelResponse, type ParsedResponse } from "./responseParser.ts";

type ApprovalHandler = (toolName: string, args: Record<string, unknown>) => Promise<boolean>;

export class Agent {
  private client: Groq;
  private registry: ToolRegistry;
  private model: string;
  private conversationHistory: Message[] = [];
  private systemMessage: Message;
  private memoryManager: MemoryManager;
  private readonly maxRepairAttempts = 2;
  private readonly maxStepsPerRun = 6;
  private approvalHandler?: ApprovalHandler;

  constructor(
    apiKey: string,
    registry: ToolRegistry,
    systemContent: string,
    model: string = "llama-3.3-70b-versatile",
    approvalHandler?: ApprovalHandler,
  ) {
    this.client = new Groq({ apiKey });
    this.registry = registry;
    this.model = model;
    this.systemMessage = { role: "system", content: systemContent };
    this.memoryManager = new MemoryManager();
    this.approvalHandler = approvalHandler;
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

      if (tool.requiresConfirmation && this.approvalHandler) {
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

      lastToolResult = await this.registry.execute(response.toolCall.tool, response.toolCall.args);
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
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: this.buildMessages(repairFeedback, extraContext),
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
}
