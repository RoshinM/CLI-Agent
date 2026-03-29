import fs from "fs";
import path from "path";
import type { Message } from "../types/AgentTypes.ts";

interface MemoryEntry {
  entryId: string;
  timestamp: string;
  userRequest: string;
  summary: string;
  outcome: string;
  finalMessage: string;
  filesTouched: string[];
  toolsUsed: string[];
  turnCount: number;
}

interface ThreadMemory {
  threadId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastTaskAt: string;
  compressedSummary: string;
  recentFiles: string[];
  entries: MemoryEntry[];
}

interface MemoryStore {
  version: number;
  activeThreadId: string | null;
  updatedAt: string;
  threads: ThreadMemory[];
}

interface FinalizeTaskInput {
  history: Message[];
  finalMessage: string;
  finalThought: string;
}

const DEFAULT_STORE: MemoryStore = {
  version: 1,
  activeThreadId: null,
  updatedAt: new Date(0).toISOString(),
  threads: [],
};

export class MemoryManager {
  private readonly storePath: string;
  private readonly dumpPath: string;
  private readonly maxEntriesPerThread = 8;
  private readonly maxCompressedSummaryLength = 3000;
  private readonly maxContextEntries = 4;

  constructor(
    storePath: string = "context/long_term_memory.json",
    dumpPath: string = "memory_dump.json",
  ) {
    this.storePath = storePath;
    this.dumpPath = dumpPath;
    this.ensureStore();
    this.ensureDump();
  }

  persistWorkingMemory(history: Message[]) {
    fs.writeFileSync(this.dumpPath, JSON.stringify(history, null, 2));
  }

  clearWorkingMemory(history: Message[]) {
    history.length = 0;
    this.persistWorkingMemory(history);
  }

  finalizeTask(input: FinalizeTaskInput, historyToClear?: Message[]) {
    const store = this.loadStore();
    const now = new Date().toISOString();
    const thread = this.getOrCreateActiveThread(store, input.history, now);
    const entry = this.buildEntry(input.history, input.finalMessage, input.finalThought, now);

    thread.entries.push(entry);
    thread.updatedAt = now;
    thread.lastTaskAt = now;
    thread.recentFiles = Array.from(new Set([...entry.filesTouched, ...thread.recentFiles])).slice(0, 12);

    this.compressThreadIfNeeded(thread);

    store.updatedAt = now;
    this.saveStore(store);

    if (historyToClear) {
      this.clearWorkingMemory(historyToClear);
    }
  }

  buildPromptContext(): string {
    const store = this.loadStore();
    const activeThread = store.activeThreadId
      ? store.threads.find((thread) => thread.threadId === store.activeThreadId)
      : undefined;

    if (!activeThread) {
      return "No long-term memory yet.";
    }

    const recentEntries = activeThread.entries
      .slice(-this.maxContextEntries)
      .map((entry) => {
        const files = entry.filesTouched.length ? ` | files: ${entry.filesTouched.join(", ")}` : "";
        return `- ${entry.timestamp}: ${entry.summary}${files}`;
      })
      .join("\n");

    const recentFiles = activeThread.recentFiles.length
      ? activeThread.recentFiles.join(", ")
      : "none";

    return [
      "Important: Long-term memory is advisory only and may be stale after later edits.",
      "If the user's request depends on the current contents of a file, read the file and trust the current file contents over memory summaries.",
      `Active thread: ${activeThread.threadId}`,
      `Title: ${activeThread.title}`,
      `Last task at: ${activeThread.lastTaskAt}`,
      `Compressed summary: ${activeThread.compressedSummary || "none"}`,
      `Recent files: ${recentFiles}`,
      `Recent task entries:`,
      recentEntries || "- none",
    ].join("\n");
  }

  private ensureStore() {
    const dir = path.dirname(this.storePath);
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(this.storePath)) {
      fs.writeFileSync(this.storePath, JSON.stringify(DEFAULT_STORE, null, 2));
    }
  }

  private ensureDump() {
    const dir = path.dirname(this.dumpPath);
    if (dir && dir !== "." && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(this.dumpPath)) {
      fs.writeFileSync(this.dumpPath, "[]");
    }
  }

  private loadStore(): MemoryStore {
    try {
      const raw = fs.readFileSync(this.storePath, "utf-8");
      const parsed = JSON.parse(raw) as MemoryStore;
      return {
        version: parsed.version ?? 1,
        activeThreadId: parsed.activeThreadId ?? null,
        updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
        threads: Array.isArray(parsed.threads) ? parsed.threads : [],
      };
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_STORE)) as MemoryStore;
    }
  }

  private saveStore(store: MemoryStore) {
    fs.writeFileSync(this.storePath, JSON.stringify(store, null, 2));
  }

  private getOrCreateActiveThread(store: MemoryStore, history: Message[], now: string): ThreadMemory {
    const existing = store.activeThreadId
      ? store.threads.find((thread) => thread.threadId === store.activeThreadId)
      : undefined;

    if (existing) {
      return existing;
    }

    const title = this.buildThreadTitle(history);
    const thread: ThreadMemory = {
      threadId: `thread-${Date.now()}`,
      title,
      createdAt: now,
      updatedAt: now,
      lastTaskAt: now,
      compressedSummary: "",
      recentFiles: [],
      entries: [],
    };

    store.activeThreadId = thread.threadId;
    store.threads.push(thread);
    return thread;
  }

  private buildThreadTitle(history: Message[]): string {
    const firstUserMessage = history.find((message) => message.role === "user")?.content?.trim() || "Untitled task thread";
    return firstUserMessage.length > 80 ? `${firstUserMessage.slice(0, 77)}...` : firstUserMessage;
  }

  private buildEntry(history: Message[], finalMessage: string, finalThought: string, timestamp: string): MemoryEntry {
    const userMessages = history.filter((message) => message.role === "user").map((message) => message.content.trim());
    const assistantMessages = history.filter((message) => message.role === "assistant").map((message) => message.content.trim());
    const userRequest = userMessages[0] || "";
    const toolsUsed = this.extractToolsUsed(assistantMessages);
    const filesTouched = this.extractFilesTouched(assistantMessages);
    const summary = this.buildSummary({
      userRequest,
      finalMessage,
      finalThought,
      toolsUsed,
      filesTouched,
      turnCount: history.length,
    });

    return {
      entryId: `entry-${Date.now()}`,
      timestamp,
      userRequest,
      summary,
      outcome: finalMessage,
      finalMessage,
      filesTouched,
      toolsUsed,
      turnCount: history.length,
    };
  }

  private buildSummary(input: {
    userRequest: string;
    finalMessage: string;
    finalThought: string;
    toolsUsed: string[];
    filesTouched: string[];
    turnCount: number;
  }): string {
    const parts = [
      `Request: ${input.userRequest || "unknown request"}`,
      input.filesTouched.length ? `Files: ${input.filesTouched.join(", ")}` : "",
      input.toolsUsed.length ? `Tools: ${input.toolsUsed.join(", ")}` : "",
      input.finalThought ? `Approach: ${input.finalThought}` : "",
      `Outcome: ${input.finalMessage}`,
      `Turns: ${input.turnCount}`,
    ].filter(Boolean);

    return parts.join(" | ");
  }

  private extractToolsUsed(assistantMessages: string[]): string[] {
    const tools = assistantMessages.flatMap((content) => {
      try {
        const parsed = JSON.parse(content);
        if (typeof parsed.tool === "string" && parsed.tool.trim()) {
          return [parsed.tool.trim()];
        }
      } catch {
        return [];
      }
      return [];
    });

    return Array.from(new Set(tools));
  }

  private extractFilesTouched(assistantMessages: string[]): string[] {
    const files = assistantMessages.flatMap((content) => {
      try {
        const parsed = JSON.parse(content);
        if (parsed.tool !== "file_tool") {
          return [];
        }

        const candidates = [parsed.path, parsed.oldPath, parsed.newPath]
          .filter((value) => typeof value === "string" && value.trim())
          .map((value) => value.trim());

        return candidates;
      } catch {
        return [];
      }
    });

    return Array.from(new Set(files));
  }

  private compressThreadIfNeeded(thread: ThreadMemory) {
    if (thread.entries.length <= this.maxEntriesPerThread) {
      return;
    }

    const entriesToCompress = thread.entries.slice(0, thread.entries.length - this.maxEntriesPerThread);
    const compressedLines = entriesToCompress.map((entry) => {
      const files = entry.filesTouched.length ? ` [files: ${entry.filesTouched.join(", ")}]` : "";
      return `${entry.timestamp}: ${entry.outcome}${files}`;
    });

    const mergedSummary = [thread.compressedSummary, ...compressedLines].filter(Boolean).join("\n");
    thread.compressedSummary = mergedSummary.slice(-this.maxCompressedSummaryLength);
    thread.entries = thread.entries.slice(-this.maxEntriesPerThread);
  }
}
