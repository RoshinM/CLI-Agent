import fs from "fs";
import { Message } from "../types/ConversationHistory";

export default function persistMemory(conversationHistory: Message[]) {
  fs.writeFileSync(
    "memory_dump.json",
    JSON.stringify(conversationHistory, null, 2)
  );
}