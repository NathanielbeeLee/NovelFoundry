type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function responseStatus(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "completed";
}

function extractOutputTextFromItems(output: unknown): string {
  if (!Array.isArray(output)) {
    return "";
  }

  const chunks: string[] = [];
  for (const item of output) {
    if (!isRecord(item) || item.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }
    for (const part of item.content) {
      if (isRecord(part) && part.type === "output_text" && typeof part.text === "string") {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join("");
}

function normalizeMessageOutputItem(item: unknown, fallbackText = ""): unknown {
  if (!isRecord(item) || item.type !== "message") {
    return item;
  }

  const rawContent = Array.isArray(item.content) ? item.content : [];
  const content = rawContent.map((part) => {
    if (!isRecord(part) || part.type !== "output_text") {
      return part;
    }
    return {
      ...part,
      annotations: Array.isArray(part.annotations) ? part.annotations : [],
    };
  });

  if (content.length === 0 && fallbackText) {
    content.push({
      type: "output_text",
      text: fallbackText,
      annotations: [],
    });
  }

  return {
    ...item,
    content,
  };
}

function buildFallbackMessage(response: UnknownRecord, text: string): UnknownRecord {
  const responseId = typeof response.id === "string" && response.id ? response.id : "compat";
  return {
    id: `msg_${responseId}`,
    type: "message",
    status: responseStatus(response.status),
    role: "assistant",
    content: text
      ? [{ type: "output_text", text, annotations: [] }]
      : [],
  };
}

export function normalizeResponsesApiResponse<T>(response: T, streamedText = ""): T {
  if (!isRecord(response)) {
    return response;
  }

  const declaredOutputText = typeof response.output_text === "string" ? response.output_text : "";
  const fallbackText = streamedText || declaredOutputText;
  const rawOutput = Array.isArray(response.output) ? response.output : [];
  const normalizedOutput = rawOutput.map((item) => normalizeMessageOutputItem(item, fallbackText));

  if (fallbackText && !extractOutputTextFromItems(normalizedOutput)) {
    normalizedOutput.push(buildFallbackMessage(response, fallbackText));
  }

  return {
    ...response,
    output: normalizedOutput,
  } as T;
}

export function extractResponsesApiOutputText(response: unknown): string {
  if (!isRecord(response)) {
    return "";
  }
  if (typeof response.output_text === "string" && response.output_text) {
    return response.output_text;
  }
  return extractOutputTextFromItems(response.output);
}

function normalizeResponseEventItem(event: UnknownRecord): UnknownRecord {
  if (!isRecord(event.item)) {
    return event;
  }
  return {
    ...event,
    item: normalizeMessageOutputItem(event.item),
  };
}

export async function* normalizeResponsesApiStream(
  source: AsyncIterable<unknown>,
): AsyncGenerator<unknown> {
  const textByContentIndex = new Map<number, string>();
  let createdResponse: UnknownRecord | null = null;
  let sawTextDelta = false;

  for await (const rawEvent of source) {
    if (!isRecord(rawEvent)) {
      yield rawEvent;
      continue;
    }

    if (rawEvent.type === "response.created" && isRecord(rawEvent.response)) {
      createdResponse = rawEvent.response;
      yield rawEvent;
      continue;
    }

    if (
      rawEvent.type === "response.output_text.delta"
      && typeof rawEvent.delta === "string"
    ) {
      const contentIndex = typeof rawEvent.content_index === "number" ? rawEvent.content_index : 0;
      textByContentIndex.set(
        contentIndex,
        `${textByContentIndex.get(contentIndex) ?? ""}${rawEvent.delta}`,
      );
      sawTextDelta = true;
      yield rawEvent;
      continue;
    }

    if (["response.completed", "response.incomplete", "response.failed", "response.cancelled"].includes(String(rawEvent.type))) {
      const streamedText = [...textByContentIndex.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, text]) => text)
        .join("");
      const completedResponse = {
        ...(createdResponse ?? {}),
        ...(isRecord(rawEvent.response) ? rawEvent.response : {}),
        status: isRecord(rawEvent.response)
          ? responseStatus(rawEvent.response.status ?? String(rawEvent.type).slice("response.".length))
          : String(rawEvent.type).slice("response.".length),
      };
      const normalizedResponse = normalizeResponsesApiResponse(completedResponse, streamedText);
      const finalText = extractResponsesApiOutputText(normalizedResponse);

      if (!sawTextDelta && finalText) {
        yield {
          type: "response.output_text.delta",
          delta: finalText,
          content_index: 0,
          output_index: 0,
        };
      }

      yield {
        ...rawEvent,
        // The installed converter only reads terminal metadata through this event name.
        // Preserve the actual response.status/incomplete_details; never infer success from the envelope.
        type: "response.completed",
        response: normalizedResponse,
      };
      continue;
    }

    if (
      rawEvent.type === "response.output_item.added"
      || rawEvent.type === "response.output_item.done"
    ) {
      yield normalizeResponseEventItem(rawEvent);
      continue;
    }

    yield rawEvent;
  }
}
