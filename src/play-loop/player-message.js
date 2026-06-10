export function parsePlayerMessage(rawMessage) {
  const raw = String(rawMessage ?? "").trim();
  const metaInstructions = [];
  let inWorldText = "";
  let depth = 0;
  let metaBuffer = "";

  for (const character of raw) {
    if (character === "(") {
      if (depth === 0) {
        if (inWorldText && !/\s$/.test(inWorldText)) {
          inWorldText += " ";
        }
      } else {
        metaBuffer += character;
      }
      depth += 1;
      continue;
    }

    if (character === ")" && depth > 0) {
      depth -= 1;
      if (depth === 0) {
        const meta = metaBuffer.trim();
        if (meta) {
          metaInstructions.push(meta);
        }
        metaBuffer = "";
      } else {
        metaBuffer += character;
      }
      continue;
    }

    if (depth > 0) {
      metaBuffer += character;
    } else {
      inWorldText += character;
    }
  }

  if (metaBuffer.trim()) {
    metaInstructions.push(metaBuffer.trim());
  }

  return {
    raw,
    inWorldText: normalizeWhitespace(inWorldText),
    metaInstructions,
  };
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}
