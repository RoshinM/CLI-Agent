import { undoManager } from "../core/UndoManager.ts";
import type { ToolDefinition } from "../types/AgentTypes.ts";

export const undoTool: ToolDefinition = {
  name: "undo",
  description: "Undoes the last file system action (write or rename). Takes no arguments.",
  func: async () => {
    return undoManager.undo();
  },
};
