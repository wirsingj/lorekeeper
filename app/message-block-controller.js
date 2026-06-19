import { structuredChoiceBlockFromMessageData } from "./choice-vote-controller.js";
import { dedupeMechanicsRows, splitMechanicsFromBlock } from "./mechanics-formatting.js";
import {
  cleanChoiceText,
  extractChoicePrompt,
  extractInlineNumberedChoicePanel,
  normalizeProviderChoiceFormattingForPlay,
  splitChoiceText,
} from "./provider-import-controller.js";

export function buildMessageBlocks(text, role = "dm", data = {}) {
  return mergeStructuredChoiceBlock(
    extractChoicePanel(normalizeMessageBlocks(text, role), role),
    structuredChoiceBlockFromMessageData(data),
  );
}

export function latestChoiceBlockFromMessages(messages = []) {
  for (const message of [...messages].reverse()) {
    if (message?.role !== "dm" && message?.role !== "provider") {
      continue;
    }
    const blocks = buildMessageBlocks(message.body, message.role, message.data);
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
      if (blocks[index]?.type === "choices") {
        return blocks[index];
      }
    }
  }
  return null;
}

export function normalizeMessageBlocks(text, role = "dm") {
  const normalizedText = role === "dm" || role === "provider"
    ? normalizeProviderChoiceFormattingForPlay(text)
    : String(text ?? "");
  const rawBlocks = normalizedText
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (!rawBlocks.length) {
    return [];
  }

  if (role !== "dm" && role !== "provider") {
    return rawBlocks.map(textBlockToRenderableBlock);
  }

  const trailingChoices = extractTrailingChoiceBlocks(rawBlocks);
  if (trailingChoices) {
    return [
      ...normalizeDmProseBlocks(rawBlocks.slice(0, trailingChoices.promptIndex)),
      {
        type: "choices",
        prompt: trailingChoices.prompt,
        items: trailingChoices.items,
      },
    ];
  }

  return normalizeDmProseBlocks(rawBlocks);
}

export function normalizeDmProseBlocks(rawBlocks = []) {
  const normalized = [];
  let proseGroup = [];
  const seenMechanics = new Set();

  rawBlocks.forEach((block, index) => {
    for (const part of splitMechanicsFromBlock(block)) {
      const renderable = part.type === "mechanics"
        ? { type: "mechanics", rows: dedupeMechanicsRows(part.rows, seenMechanics) }
        : textBlockToRenderableBlock(part.text);
      if (renderable.type === "mechanics" && !renderable.rows.length) {
        continue;
      }
      if (renderable.type === "list" || renderable.type === "choices" || renderable.type === "combat" || renderable.type === "mechanics") {
        flushProseGroup();
        if (renderable.type === "choices" && renderable.beforeText) {
          normalized.push({
            type: "paragraph",
            text: renderable.beforeText,
          });
        }
        normalized.push(renderable);
        continue;
      }

      if (shouldKeepDmBlockSeparate(renderable.text, index, rawBlocks.length)) {
        flushProseGroup();
        normalized.push(renderable);
        continue;
      }

      proseGroup.push(renderable.text);
      const joinedLength = proseGroup.join(" ").length;
      if (proseGroup.length >= 4 || joinedLength >= 480) {
        flushProseGroup();
      }
    }
  });

  flushProseGroup();
  return normalized;

  function flushProseGroup() {
    if (!proseGroup.length) {
      return;
    }

    normalized.push({
      type: "paragraph",
      text: proseGroup.join(" "),
    });
    proseGroup = [];
  }
}

export function extractTrailingChoiceBlocks(rawBlocks = []) {
  for (let index = rawBlocks.length - 2; index >= 0; index -= 1) {
    const prompt = extractChoicePrompt(rawBlocks[index]);
    if (!prompt) {
      continue;
    }

    const choices = rawBlocks.slice(index + 1)
      .map(cleanChoiceText)
      .filter(Boolean);
    if (choices.length >= 2 && choices.every(isLikelyChoiceText)) {
      return {
        promptIndex: index,
        prompt,
        items: choices,
      };
    }
  }

  return null;
}

export function mergeStructuredChoiceBlock(blocks = [], structuredChoiceBlock = null) {
  if (!structuredChoiceBlock?.items?.length) {
    return blocks;
  }
  const withoutParsedChoices = blocks.filter((block) => block.type !== "choices");
  return [...withoutParsedChoices, structuredChoiceBlock];
}

export function textBlockToRenderableBlock(block = "") {
  const lines = String(block).split(/\n/).map((line) => line.trim()).filter(Boolean);
  const isList = lines.length > 1 && lines.every((line) => /^[-*]\s+/.test(line));
  const numberedChoices = extractNumberedChoiceLines(lines);
  const isCombatBlock = lines.some((line) => /^Options:$/i.test(line)) &&
    lines.some((line) => /^(Chosen|Damage|Narration):/i.test(line));

  if (numberedChoices) {
    return numberedChoices;
  }

  if (isList) {
    return {
      type: "list",
      items: lines.map((line) => line.replace(/^[-*]\s+/, "")),
    };
  }

  if (isCombatBlock) {
    return {
      type: "combat",
      lines,
    };
  }

  return {
    type: "paragraph",
    text: lines.join(" "),
  };
}

export function extractChoicePanel(blocks = [], role = "dm") {
  if (role !== "dm" && role !== "provider") {
    return blocks;
  }

  if (blocks.length < 1) {
    return blocks;
  }

  const last = blocks.at(-1);
  const inlinePanel = extractInlineChoicePanel(last);
  if (inlinePanel) {
    const nextBlocks = blocks.slice(0, -1);
    if (inlinePanel.beforeText) {
      nextBlocks.push({
        ...last,
        text: inlinePanel.beforeText,
      });
    }
    nextBlocks.push({
      type: "choices",
      prompt: inlinePanel.prompt,
      items: inlinePanel.items,
    });
    return nextBlocks;
  }

  if (blocks.length < 2) {
    return blocks;
  }

  const previous = blocks.at(-2);
  if (last?.type !== "paragraph" || previous?.type !== "paragraph") {
    return blocks;
  }

  const prompt = extractChoicePrompt(previous.text);
  if (!prompt) {
    return blocks;
  }

  const choices = splitChoiceText(last.text);
  if (choices.length < 2) {
    return blocks;
  }

  const previousText = previous.text.slice(0, previous.text.length - prompt.length).trim();
  const nextBlocks = blocks.slice(0, -2);
  if (previousText) {
    nextBlocks.push({
      ...previous,
      text: previousText,
    });
  }

  nextBlocks.push({
    type: "choices",
    prompt,
    items: choices,
  });
  return nextBlocks;
}

function extractInlineChoicePanel(block) {
  if (block?.type !== "paragraph") {
    return null;
  }

  const text = block.text.trim();
  const numberedPanel = extractInlineNumberedChoicePanel(text);
  if (numberedPanel) {
    return numberedPanel;
  }

  const optionMarker = text.search(/\b(?:Options?|Choices?)\s*:/i);
  if (optionMarker === -1) {
    return null;
  }

  const beforeMarker = text.slice(0, optionMarker).trim();
  const optionText = text.slice(optionMarker).replace(/^\s*(?:Options?|Choices?)\s*:\s*/i, "").trim();
  const prompt = extractChoicePrompt(beforeMarker) || extractChoicePrompt(text) || "What do you do?";
  const promptStart = beforeMarker.lastIndexOf(prompt);
  const beforeText = promptStart >= 0 ? beforeMarker.slice(0, promptStart).trim() : beforeMarker;
  const choices = splitChoiceText(optionText);
  if (choices.length < 2) {
    return null;
  }

  return {
    beforeText,
    prompt,
    items: choices,
  };
}

function extractNumberedChoiceLines(lines = []) {
  if (lines.length < 2) {
    return null;
  }

  const promptLineIndex = lines.findIndex((line) => extractChoicePrompt(line));
  const firstChoiceIndex = lines.findIndex((line) => /^(?:\d+|[A-Ha-h])[.)]\s+/.test(line));
  if (firstChoiceIndex === -1) {
    return null;
  }

  const prompt = promptLineIndex >= 0 && promptLineIndex < firstChoiceIndex
    ? extractChoicePrompt(lines[promptLineIndex])
    : "What do you do?";
  const beforeText = promptLineIndex > 0 ? lines.slice(0, promptLineIndex).join(" ") : "";
  const choiceLines = lines.slice(firstChoiceIndex);
  const items = splitChoiceText(choiceLines.join(" "));

  if (items.length < 2) {
    return null;
  }

  return {
    type: "choices",
    prompt,
    beforeText,
    items,
  };
}

function isLikelyChoiceText(text = "") {
  return text.length <= 220 && !/^["'].+["']$/.test(text);
}

function shouldKeepDmBlockSeparate(text = "", index = 0, totalBlocks = 0) {
  if (text.length > 260) {
    return true;
  }

  if (index === totalBlocks - 1 && /\?\s*$/.test(text) && text.length <= 120) {
    return true;
  }

  if (/^(what do you do|what now|your move|choose|options?)\b/i.test(text)) {
    return true;
  }

  return false;
}
