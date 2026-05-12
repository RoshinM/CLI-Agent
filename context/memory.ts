import { Message } from "../types/ConversationHistory.ts";

export const conversationHistory : Message[] = [];

export function clearConversationHistory() {
  conversationHistory.length = 0;
}
