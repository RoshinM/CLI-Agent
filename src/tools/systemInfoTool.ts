import os from "os";
import type { ToolDefinition } from "../types/AgentTypes.ts";
import { getWorkspaceRoot } from "../core/workspace.ts";

export const systemInfoTool: ToolDefinition = {
  name: "system_info",
  description: "Returns information about the current system and environment.",
  func: async () => {
    return JSON.stringify({
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cwd: process.cwd(),
      workspaceRoot: getWorkspaceRoot(),
      uptime: os.uptime(),
      freeMemory: os.freemem(),
      totalMemory: os.totalmem(),
    }, null, 2);
  },
};
