const secretKeyPattern = /(?:token|secret|password|authorization|cookie|apikey|api_key|lkToken|inviteLink|connectionSecret|waitingSecret)/i;
const previewKeyPattern = /(?:promptPreview|textPreview|rawTextPreview|requestPreview|responsePreview|bodyPreview)/i;

export function createTraceLog({ limit = 500, now = () => new Date().toISOString() } = {}) {
  const maxEvents = Math.max(10, Math.min(Number(limit) || 500, 5000));
  const events = [];
  let sequence = 0;

  function record(type, detail = {}, options = {}) {
    const event = {
      sequence: ++sequence,
      at: options.at || now(),
      level: options.level || "info",
      type: String(type || "event"),
      detail: sanitizeTraceValue(detail, { redact: false, maxStringLength: 8000, depth: 0 }),
    };
    events.push(event);
    if (events.length > maxEvents) {
      events.splice(0, events.length - maxEvents);
    }
    return event;
  }

  function snapshot({ redact = true, limit: requestedLimit = maxEvents } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(requestedLimit) || maxEvents, maxEvents));
    const maxStringLength = redact ? 900 : 8000;
    return {
      limit: maxEvents,
      size: events.length,
      nextSequence: sequence + 1,
      redacted: Boolean(redact),
      events: events.slice(-safeLimit).map((event) => sanitizeTraceValue(event, {
        redact,
        maxStringLength,
        depth: 0,
      })),
    };
  }

  function clear() {
    events.splice(0, events.length);
    sequence = 0;
  }

  return { record, snapshot, clear };
}

export function sanitizeTraceValue(value, { redact = true, maxStringLength = 900, depth = 0 } = {}) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return compactTraceString(value, maxStringLength);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: compactTraceString(value.message, maxStringLength),
      stack: compactTraceString(value.stack || "", maxStringLength * 2),
    };
  }
  if (depth >= 8) {
    return "[depth-limit]";
  }
  if (Array.isArray(value)) {
    return value.slice(0, 120).map((entry) => sanitizeTraceValue(entry, {
      redact,
      maxStringLength,
      depth: depth + 1,
    }));
  }
  if (typeof value === "object") {
    const output = {};
    for (const [key, entry] of Object.entries(value).slice(0, 120)) {
      if (redact && secretKeyPattern.test(key)) {
        output[key] = "[redacted]";
        continue;
      }
      if (redact && previewKeyPattern.test(key)) {
        output[key] = "[redacted-preview]";
        continue;
      }
      output[key] = sanitizeTraceValue(entry, {
        redact,
        maxStringLength,
        depth: depth + 1,
      });
    }
    return output;
  }
  return String(value);
}

export function summarizeForTrace(value, maxStringLength = 900, { redact = false } = {}) {
  return sanitizeTraceValue(value, { redact, maxStringLength, depth: 0 });
}

function compactTraceString(value, maxStringLength) {
  const text = String(value ?? "");
  if (text.length <= maxStringLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxStringLength - 3))}...`;
}
