import { create, all } from 'mathjs';
import type { ToolDefinition } from "../types/AgentTypes.ts";

const math = create(all);

export const calculatorTool: ToolDefinition = {
  name: "calculate",
  description: "Securely evaluates a math expression. Usage: { expression: '2 + 2' }",
  func: async (args: any) => {
    try {
      const result = math.evaluate(args.expression);
      return result.toString();
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  },
};
