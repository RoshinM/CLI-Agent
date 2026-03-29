import { Message } from "../types/ConversationHistory";

export const conversationHistory : Message[] = [];

export function clearConversationHistory() {
  conversationHistory.length = 0;
}
