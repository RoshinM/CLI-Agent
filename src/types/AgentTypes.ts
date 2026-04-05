export interface ToolResult {
  success: boolean;
  result?: string;
  error?: string;
}

export type ToolFunc = (args: any) => Promise<string> | string;

export interface ToolDefinition {
  name: string;
  description: string;
  func: ToolFunc;
  parameters?: any;
  requiresConfirmation?: boolean | ((args: any) => boolean);
  confirmationMessage?: string | ((args: any) => string);
}

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StructuredToolError {
  type?: string;
  summary?: string;
  interactivePromptDetected?: boolean;
  promptPreview?: string;
  command?: string;
  cwd?: string;
  message?: string;
  stdout?: string;
  stderr?: string;
  outputWasTruncated?: boolean;
}
