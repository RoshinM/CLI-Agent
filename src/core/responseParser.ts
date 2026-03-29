export interface ParsedToolCall {
  tool: string;
  args: Record<string, unknown>;
  thought: string;
}

export type ParsedResponse =
  | { kind: "tool-call"; toolCall: ParsedToolCall; raw: string }
  | { kind: "final-answer"; message: string; thought: string; raw: string }
  | { kind: "invalid"; reason: string; raw: string };

function extractThought(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNonEmptyToolField(value: Record<string, unknown>): value is Record<string, unknown> & { tool: string } {
  return typeof value.tool === "string" && value.tool.trim().length > 0;
}

function hasMessageField(value: Record<string, unknown>): value is Record<string, unknown> & { message: string } {
  return typeof value.message === "string";
}

export function parseModelResponse(text: string): ParsedResponse {
  const raw = text ?? "";
  const trimmed = raw.trim();

  if (!trimmed) {
    return {
      kind: "invalid",
      reason: "The response was empty. Return one valid JSON object.",
      raw,
    };
  }

  if (!trimmed.startsWith("{")) {
    return {
      kind: "invalid",
      reason: "Responses must always be a single JSON object. Plain text is not allowed.",
      raw,
    };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed);
  } catch (error: any) {
    return {
      kind: "invalid",
      reason: `The JSON was invalid: ${error.message}. Return a single valid JSON object with properly escaped strings.`,
      raw,
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      kind: "invalid",
      reason: "Responses must be a single JSON object. Arrays are not allowed.",
      raw,
    };
  }

  const thought = extractThought(parsed.thought);
  if (!thought) {
    return {
      kind: "invalid",
      reason: 'Every JSON response must include a non-empty string "thought" field.',
      raw,
    };
  }

  if (hasNonEmptyToolField(parsed)) {
    const { tool, thought: _thought, ...args } = parsed;
    return {
      kind: "tool-call",
      toolCall: {
        tool: tool.trim(),
        args,
        thought,
      },
      raw,
    };
  }

  if (hasMessageField(parsed)) {
    const message = parsed.message.trim();
    if (!message) {
      return {
        kind: "invalid",
        reason: 'Final responses must include a non-empty string "message" field.',
        raw,
      };
    }

    return {
      kind: "final-answer",
      message,
      thought,
      raw,
    };
  }

  return {
    kind: "invalid",
    reason: 'JSON responses must contain either a non-empty "tool" field or a non-empty "message" field.',
    raw,
  };
}
