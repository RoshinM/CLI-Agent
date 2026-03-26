import type { ToolDefinition, ToolResult } from "../types/AgentTypes.ts";

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  async execute(name: string, args: any): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `Tool '${name}' not found.` };
    }

    try {
      const result = await tool.func(args);
      return { success: true, result };
    } catch (err: any) {
      return { success: false, error: `Tool '${name}' execution failed: ${err.message}` };
    }
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }
}
