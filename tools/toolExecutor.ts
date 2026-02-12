import { fileTool } from '../tools/fileService.ts';
import calculatorTool from '../tools/calculatorTool.ts';
import echoTool from '../tools/echoTool.ts';
import extractJSON from '../tools/extractJSONTool.ts';



export default function toolExecutor(response: string): { success: boolean, result?:string, error?:string} | null {
  const jsonString = extractJSON(response);
  if (!jsonString) return null;

  try {
    const parsed = JSON.parse(jsonString);

    if (parsed.tool && tools[parsed.tool]) {
      const arg = JSON.stringify(parsed);
      const result = tools[parsed.tool](arg);
      return { success: true, result };
    } else {
      return { success: false, error: "Invalid tool name." };
    }
  } catch (err: any) {
    return { success: false, error: `JSON parsing error: ${err.message}` };
  }
}

const tools: Record<string, (arg: string) => string> = {
  calculate: calculatorTool,
  echo: echoTool,
  file_tool: (jsonString: string) => {
    const cmd = JSON.parse(jsonString);
    switch (cmd.action) {
      case "write":
        return fileTool.write(cmd.path, cmd.content);
      case "read":
        return fileTool.read(cmd.path);
      case "mkdir":
        return fileTool.mkdir(cmd.path);
      case "rename":
        return fileTool.rename(cmd.oldPath, cmd.newPath);
      default:
        return `Error: Unknown action "${cmd.action}"`;
    }
  }
};