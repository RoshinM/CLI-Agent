import { fileTool } from "./fileService.ts";
import type { ToolDefinition } from "../types/AgentTypes.ts";

export const fileTools: ToolDefinition[] = [
  {
    name: "file_tool",
    description: "Perform file operations: read, write, replace, mkdir, rename, delete, list. Use replace for localized edits and write for full rewrites. Delete requires user approval. Large dependency/cache/build directories may be summarized during list and blocked from read. Args: { action, path, content?, find?, replaceWith?, replaceAll?, expectedCount?, oldPath?, newPath? }",
    requiresConfirmation: (args: any) => args?.action === "delete",
    confirmationMessage: (args: any) => `Allow deleting "${typeof args?.path === "string" ? args.path : "unknown file"}"?`,
    func: async (args: any) => {
      switch (args.action) {
        case "write":
          return fileTool.write(args.path, args.content);
        case "read":
          return fileTool.read(args.path);
        case "replace":
          return fileTool.replace(args.path, args.find, args.replaceWith, args.replaceAll, args.expectedCount);
        case "mkdir":
          return fileTool.mkdir(args.path);
        case "rename":
          return fileTool.rename(args.oldPath, args.newPath);
        case "delete":
          return fileTool.delete(args.path);
        case "list":
          return JSON.stringify(fileTool.list(args.path || "."), null, 2);
        default:
          throw new Error(`Unknown action "${args.action}"`);
      }
    },
  },
];
