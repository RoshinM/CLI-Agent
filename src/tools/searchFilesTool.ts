import fs from "fs";
import path from "path";
import type { ToolDefinition } from "../types/AgentTypes.ts";
import { getWorkspaceRoot, isWithinWorkspace, toWorkspaceRelativePath } from "../core/workspace.ts";

export const searchFilesTool: ToolDefinition = {
  name: "search_files",
  description: "Search for a pattern in files within the project. Args: { pattern, directory? }",
  func: async (args: any) => {
    const pattern = new RegExp(args.pattern, "i");
    const workspaceRoot = getWorkspaceRoot();
    const directory = path.resolve(workspaceRoot, args.directory || ".");
    if (!isWithinWorkspace(directory)) {
      return "Error: directory is outside the workspace.";
    }
    
    function searchRecursive(dir: string): string[] {
      const matches: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules" && entry.name !== ".git") {
            matches.push(...searchRecursive(fullPath));
          }
        } else {
          const content = fs.readFileSync(fullPath, "utf-8");
          if (pattern.test(content)) {
            matches.push(toWorkspaceRelativePath(fullPath));
          }
        }
      }
      return matches;
    }
    
    try {
      const results = searchRecursive(directory);
      return results.length > 0 
        ? `Found matches in:\n${results.join("\n")}`
        : "No matches found.";
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  },
};
