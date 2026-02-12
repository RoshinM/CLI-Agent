export type Role = "system" | "user" | "assistant" | "tool";

export interface Message {
  role: Role;
  toolName?: string; // only for tool messages
  content: string;
};