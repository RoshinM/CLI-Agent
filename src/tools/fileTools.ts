import { fileTool } from "./fileService.ts";
import type { ToolDefinition } from "../types/AgentTypes.ts";

export const fileTools: ToolDefinition[] = [
  {
    name: "file_tool",
    description: "Perform file operations: read, write, mkdir, rename. Args: { action, path, content?, oldPath?, newPath? }",
    func: async (args: any) => {
      switch (args.action) {
        case "write":
          return fileTool.write(args.path, args.content);
        case "read":
          return fileTool.read(args.path);
        case "mkdir":
          return fileTool.mkdir(args.path);
        case "rename":
          return fileTool.rename(args.oldPath, args.newPath);
        case "list":
          return JSON.stringify(fileTool.list(args.path || "."), null, 2);
        default:
          throw new Error(`Unknown action "${args.action}"`);
      }
    },
  },
];
