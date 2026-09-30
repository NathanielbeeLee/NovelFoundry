type ErrorRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ErrorRecord {
  return typeof value === "object" && value !== null;
}

function normalizeBaseURL(baseURL: string): string {
  return baseURL.trim().replace(/\/+$/u, "");
}

export function getOpenAICompatibleBaseUrlCandidates(baseURL: string): string[] {
  const primary = normalizeBaseURL(baseURL);
  if (!primary) {
    return [];
  }

  try {
    const parsed = new URL(primary);
    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    const lastSegment = pathSegments.at(-1) ?? "";
    if (/^v\d+(?:beta\d*)?$/iu.test(lastSegment)) {
      return [primary];
    }

    parsed.pathname = `${parsed.pathname.replace(/\/+$/u, "")}/v1`;
    parsed.search = "";
    parsed.hash = "";
    const versioned = normalizeBaseURL(parsed.toString());
    return versioned && versioned !== primary ? [primary, versioned] : [primary];
  } catch {
    const versioned = `${primary}/v1`;
    return versioned === primary ? [primary] : [primary, versioned];
  }
}

function readStatus(error: unknown): number | null {
  if (!isRecord(error)) {
    return null;
  }
  const direct = error.status ?? error.statusCode;
  if (typeof direct === "number") {
    return direct;
  }
  if (typeof direct === "string" && /^\d{3}$/u.test(direct)) {
    return Number(direct);
  }
  return readStatus(error.cause);
}

export function isOpenAIEndpointNotFoundError(error: unknown): boolean {
  const status = readStatus(error);
  if (status === 404 || status === 405) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  return /(?:^|\s)(?:404|405)(?:\s|$)/u.test(error.message);
}
