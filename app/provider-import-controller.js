import { createReviewBatch } from "../src/canon-review/proposals.js";
import { stripLorekeeperUpdates } from "../src/canon-review/extract-updates.js";
import {
  createImplicitCombatAdvanceChange,
  createImplicitCombatEnemySyncChange,
  createImplicitCombatStartChange,
} from "./combat-import-controller.js";
import { createImplicitCombatActorPromptChange } from "./combat-prompt-repair-controller.js";
import { createImplicitSceneProgressChange } from "./scene-import-controller.js";

// Provider import policy projections. Keep table-facing wording, import
// planning, and auto-commit decisions here so app.js can execute the policy
// without owning it.
export function buildProviderImportPlan({
  campaign,
  responseText = "",
  cleanedText = "",
  extraction = {},
  tableMessages = [],
  options = {},
  labelForActor = () => "",
} = {}) {
  const proposedBase = Array.isArray(extraction.proposedChanges) ? extraction.proposedChanges : [];
  const autoCommit = Boolean(options.autoCommit);
  const implicitSceneChange = autoCommit
    ? createImplicitSceneProgressChange({
      tableMessages,
      proposedChanges: proposedBase,
    })
    : null;
  const implicitCombatChange = autoCommit
    ? createImplicitCombatStartChange({
      campaign,
      tableMessages,
      proposedChanges: proposedBase,
      turnResponse: options.data?.turnResponse,
    })
    : null;
  const combatContextChanges = implicitCombatChange
    ? [...proposedBase, implicitCombatChange]
    : proposedBase;
  const implicitCombatEnemyChange = autoCommit
    ? createImplicitCombatEnemySyncChange({
      campaign,
      tableMessages,
      proposedChanges: combatContextChanges,
      turnResponse: options.data?.turnResponse,
    })
    : null;
  const implicitCombatAdvanceChange = autoCommit
    ? createImplicitCombatAdvanceChange({
      campaign,
      proposedChanges: proposedBase,
      turnResponse: options.data?.turnResponse,
      submittedTurn: options.data?.turn,
      labelForActor,
    })
    : null;
  const actorPromptContextChanges = [
    ...proposedBase,
    ...(implicitCombatChange ? [implicitCombatChange] : []),
    ...(implicitCombatEnemyChange ? [implicitCombatEnemyChange] : []),
    ...(implicitCombatAdvanceChange ? [implicitCombatAdvanceChange] : []),
  ];
  const implicitCombatActorPromptChange = autoCommit
    ? createImplicitCombatActorPromptChange({
      campaign,
      tableMessages,
      proposedChanges: actorPromptContextChanges,
      turnResponse: options.data?.turnResponse,
    })
    : null;
  const proposedChanges = [
    ...proposedBase,
    ...(implicitSceneChange ? [implicitSceneChange] : []),
    ...(implicitCombatChange ? [implicitCombatChange] : []),
    ...(implicitCombatEnemyChange ? [implicitCombatEnemyChange] : []),
    ...(implicitCombatAdvanceChange ? [implicitCombatAdvanceChange] : []),
    ...(implicitCombatActorPromptChange ? [implicitCombatActorPromptChange] : []),
  ];
  const importData = {
    source: options.source || "manual_import",
    responseChars: responseText.length,
    cleanedChars: cleanedText.length,
    proposedChanges: proposedChanges.length,
    extractionError: extraction.error || "",
  };
  const choiceOwnerIndex = choiceOwnerMessageIndex(tableMessages);
  const messagePlans = tableMessages.map((message, messageIndex) => ({
    message,
    data: providerMessageData({
      message,
      messageIndex,
      options,
      choiceOwnerIndex,
      import: importData,
    }),
  }));
  const reviewBatch = createReviewBatch({
    campaignId: campaign?.id,
    source: options.source || "manual_import",
    rawResponse: responseText,
    proposedChanges,
  });

  return {
    proposedChanges,
    messagePlans,
    reviewBatch,
    importData,
  };
}

export function cleanProviderResponseForPlay(text) {
  const withoutUpdates = stripLorekeeperUpdates(text);
  const withoutRolePrefix = stripProviderRolePrefix(withoutUpdates);
  const withoutMarkdownNoise = stripProviderMarkdownNoise(withoutRolePrefix);
  const withoutJsonTail = stripInlineResponseJsonTail(withoutMarkdownNoise);
  const withReadableChoices = normalizeChoiceFormattingForPlay(withoutJsonTail);
  return stripTrailingStatusBlock(withReadableChoices).trim() || "The DM response was imported for review.";
}

export function normalizeProviderChoiceFormattingForPlay(text) {
  return normalizeChoiceFormattingForPlay(text);
}

export function splitProviderTableMessages(text, campaign, proposedChanges = [], options = {}) {
  const speakerLookup = buildPartySpeakerLookup(campaign, proposedChanges);
  const isHostControlled = options.isHostControlledPartyRecord ?? (() => false);
  const controllerKindForParty = options.partyControllerKind ?? (() => "ai_companion");
  const onHostCharacterSuppressed = options.onHostCharacterSuppressed ?? (() => {});
  if (!text.trim()) {
    return [
      {
        role: "dm",
        title: "DM",
        body: "The DM response was imported for review.",
        source: "provider_response",
      },
    ];
  }

  const messages = [];
  let dmLines = [];
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    if (isChoiceLikeLine(line)) {
      dmLines.push(line);
      continue;
    }

    const speakerLine = parseSpeakerLine(line, speakerLookup);
    if (speakerLine) {
      if (isHostControlled(speakerLine.record)) {
        onHostCharacterSuppressed({
          name: speakerLine.name,
          body: speakerLine.body,
          record: speakerLine.record,
        });
        continue;
      }

      flushDmLines();
      messages.push({
        role: "party",
        title: speakerLine.name,
        body: speakerLine.body || "Acts at the table.",
        source: "provider_response",
        meta: "Companion beat waiting for host",
        data: {
          status: "pending_party_approval",
          characterId: speakerLine.record?.id ?? null,
          characterName: speakerLine.name,
          controllerKind: controllerKindForParty(speakerLine.record),
          suggestedByProvider: true,
        },
      });
      continue;
    }

    dmLines.push(line);
  }

  flushDmLines();

  return messages.length
    ? messages
    : [
        {
          role: "dm",
          title: "DM",
          body: text,
          source: "provider_response",
        },
      ];

  function flushDmLines() {
    if (!dmLines.length) {
      return;
    }

    messages.push({
      role: "dm",
      title: "DM",
      body: dmLines.join("\n\n"),
      source: "provider_response",
    });
    dmLines = [];
  }
}

export function buildProviderImportOutcome({
  extractionError = "",
  autoCommitAppliedCount = 0,
  proposedChangesCount = 0,
  source = "provider",
} = {}) {
  if (extractionError) {
    return {
      state: "imported_with_warning",
      bridgeStatus: `DM response imported; ${extractionError}`,
      activityText: "DM response added; no table changes saved",
      activityState: "waiting",
    };
  }
  if (autoCommitAppliedCount > 0) {
    return {
      state: "state_saved",
      bridgeStatus: `${autoCommitAppliedCount} table change${autoCommitAppliedCount === 1 ? "" : "s"} saved`,
      activityText: source === "local" ? "Table updated from local response" : "Table updated from DM response",
      activityState: "idle",
    };
  }
  if (proposedChangesCount > 0) {
    return {
      state: "review_pending",
      bridgeStatus: `${proposedChangesCount} proposed table change${proposedChangesCount === 1 ? "" : "s"} awaiting review`,
      activityText: "DM response added; proposed changes awaiting review",
      activityState: "waiting",
    };
  }
  return {
    state: "imported",
    bridgeStatus: "DM response imported with no proposed changes",
    activityText: "DM response added",
    activityState: "idle",
  };
}

export function decideLatestProviderImport({
  latestText = "",
  newerThanText = "",
  lastImportedProviderText = "",
  requireNewerThanLastImport = false,
} = {}) {
  const trimmedLatest = latestText.trim();
  if (!trimmedLatest) {
    return {
      action: "skip",
      reason: "empty",
      bridgeStatus: "No DM response found",
      activityText: "No DM response found",
      activityState: "idle",
    };
  }

  if (newerThanText && trimmedLatest === newerThanText.trim()) {
    return {
      action: "skip",
      reason: "unchanged",
      bridgeStatus: "Latest DM response has not changed",
      activityText: "Latest DM response has not changed",
      activityState: "idle",
    };
  }

  if (requireNewerThanLastImport && trimmedLatest === lastImportedProviderText.trim()) {
    return {
      action: "skip",
      reason: "duplicate",
      bridgeStatus: "Latest DM response is already in the table",
      activityText: "Latest DM response is already in the table",
      activityState: "idle",
    };
  }

  return {
    action: "import",
    reason: "new",
    bridgeStatus: "Adding latest DM response...",
    activityText: "Adding latest DM response...",
    activityState: "working",
    text: trimmedLatest,
  };
}

export function prepareAutoCommitReviewBatch(reviewBatch) {
  if (!reviewBatch?.proposedChanges?.length) {
    return null;
  }

  const safeBatch = {
    ...reviewBatch,
    proposedChanges: reviewBatch.proposedChanges.map((change) => ({
      ...change,
      status: shouldAutoApproveProviderChange(change) ? "approved" : change.status,
    })),
  };

  return safeBatch.proposedChanges.some((change) => change.status === "approved")
    ? safeBatch
    : null;
}

export function shouldAutoApproveProviderChange(change = {}) {
  if (change.validation?.valid === false || change.status === "rejected") {
    return false;
  }
  if (isHiddenStoryChange(change)) {
    return true;
  }
  if (change.importance === "major" || change.visibility === "dm_only" || change.visibility === "system_only") {
    return false;
  }
  return true;
}

export function choiceOwnerMessageIndex(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "dm" || messages[index].role === "provider") {
      return index;
    }
  }
  return Math.max(0, messages.length - 1);
}

export function providerMessageData({ message, messageIndex, options = {}, choiceOwnerIndex, import: importData }) {
  const base = {
    ...(message?.data || {}),
    import: importData,
  };
  const structuredChoices = options.data?.choices ?? null;
  const ownsChoices = structuredChoices?.options?.length && messageIndex === choiceOwnerIndex;
  if (!ownsChoices) {
    return base;
  }

  return {
    ...base,
    choiceOwner: true,
    choices: structuredChoices,
    turnResponse: options.data?.turnResponse ?? null,
    providerRunId: options.data?.providerResult?.requestId ?? options.data?.providerResult?.request_id ?? null,
  };
}

export function extractChoicePrompt(text) {
  const match = String(text ?? "").match(/(?:^|\.|\?|!)\s*((?:What (?:does|do|would|will|should|can) .*?\?|What do you do|What now|Your move|Choose)[?!.]?)\s*$/i);
  return match?.[1]?.trim() ?? null;
}

export function cleanChoiceText(text) {
  const cleaned = String(text ?? "")
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/^(?:\d+|[A-Ha-h])[.)]\s*/, "")
    .trim();
  const duplicateSomethingElse = cleaned.match(/^(something else(?:\.\.\.|\.?)?)\s*:\s*something else(?:\.\.\.|\.?)?$/i);
  if (duplicateSomethingElse) {
    return "Something else.";
  }
  return cleaned;
}

export function extractInlineNumberedChoicePanel(text) {
  const raw = String(text ?? "");
  const firstNumberedChoice = raw.search(/\s(?:1|A)[.)]\s+/i);
  if (firstNumberedChoice === -1) {
    return null;
  }

  const beforeChoices = raw.slice(0, firstNumberedChoice).trim();
  const optionText = raw.slice(firstNumberedChoice).trim();
  const prompt = extractChoicePrompt(beforeChoices) || extractChoicePrompt(raw);
  if (!prompt) {
    return null;
  }

  const choices = splitChoiceText(optionText);
  if (choices.length < 2) {
    return null;
  }

  const promptStart = beforeChoices.lastIndexOf(prompt);
  const beforeText = promptStart >= 0 ? beforeChoices.slice(0, promptStart).trim() : beforeChoices;

  return {
    beforeText,
    prompt,
    items: choices,
  };
}

export function splitChoiceText(text) {
  const normalized = String(text ?? "")
    .replace(/\s*-\s*(?=(?:\d+[.)]\s+|[A-Z][^.!?]{8,120}(?:\.|$)))/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return [];
  }

  const numbered = normalized
    .split(/\s+(?=(?:\d+|[A-Ha-h])[.)]\s+)/)
    .map((item) => item.replace(/^(?:\d+|[A-Ha-h])[.)]\s*/, "").trim())
    .filter(Boolean);
  if (numbered.length >= 2) {
    return normalizeChoiceItems(numbered.map(cleanChoiceText).filter(Boolean));
  }

  const sentenceChoices = normalized
    .split(/\s+-\s+|(?<=\.)\s+(?=[A-Z])/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 12 && !/^something else\.?$/i.test(item));
  const hasFallback = /(?:^|\s)Something else\.?$/i.test(normalized);
  if (sentenceChoices.length >= 2) {
    return normalizeChoiceItems(hasFallback ? [...sentenceChoices, "Something else."] : sentenceChoices);
  }

  return [];
}

function stripProviderRolePrefix(text) {
  return String(text ?? "")
    .replace(/^\s*(?:\*\*)?\s*(?:DM|Dungeon Master|Lorekeeper|Assistant)\s*(?:\*\*)?\s*[:\-]\s*/i, "")
    .replace(/^\s*(?:#|##)\s*(?:DM|Dungeon Master|Lorekeeper|Assistant)\s*$/gim, "")
    .trim();
}

function stripProviderMarkdownNoise(text) {
  return String(text ?? "")
    .replace(/\*\*(DM|Dungeon Master|Options?|proposedChanges)\s*:\*\*/gi, "$1:")
    .replace(/\*\*([^*\n]{1,80})\*\*/g, "$1")
    .replace(/(?:^|\n)\s*proposedChanges\s*:\s*$/i, "")
    .trim();
}

function stripInlineResponseJsonTail(text) {
  const raw = String(text ?? "");
  const marker = raw.search(
    /\b(?:sceneStatus|choices|mechanics|flags|warnings|proposedChanges)\s*:\s*(?:\{|\[|true|false|null|"|\d)/i,
  );
  if (marker === -1) {
    return raw;
  }
  const before = raw.slice(0, marker).trim();
  return before || raw;
}

function stripTrailingStatusBlock(text) {
  const statusMarker = String(text ?? "").search(
    /(?:^|\n)\s*(?:Current Scene|Scene Status|Scene|Location|Time|Party Status|Immediate Tension|Choices Ahead|Next Choices)\s*:/i,
  );

  if (statusMarker === -1) {
    return text;
  }

  const narrativeBeforeMarker = text.slice(0, statusMarker).trim();
  return narrativeBeforeMarker.length >= 160 ? narrativeBeforeMarker : text;
}

function normalizeChoiceFormattingForPlay(text) {
  const blocks = String(text ?? "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const normalized = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const nextBlock = blocks[index + 1];
    const choiceBlock = normalizeInlineChoiceBlock(block, nextBlock);
    if (choiceBlock) {
      normalized.push(choiceBlock);
      if (isSomethingElseChoice(nextBlock)) {
        index += 1;
      }
      continue;
    }

    normalized.push(block);
  }

  return normalized.join("\n\n");
}

function normalizeInlineChoiceBlock(block, nextBlock = "") {
  if (!block) {
    return "";
  }

  const numberedPanel = extractInlineNumberedChoicePanel(block);
  if (!numberedPanel) {
    return null;
  }

  const items = isSomethingElseChoice(nextBlock)
    ? [...numberedPanel.items, cleanChoiceText(nextBlock)]
    : numberedPanel.items;
  const pieces = [];
  if (numberedPanel.beforeText) {
    pieces.push(numberedPanel.beforeText);
  }
  pieces.push(numberedPanel.prompt);
  pieces.push(items.map((item, index) => `${index + 1}. ${item}`).join("\n"));
  return pieces.join("\n\n");
}

function isSomethingElseChoice(text) {
  return /^something else\.?$/i.test(String(text ?? "").trim());
}

function buildPartySpeakerLookup(campaign, proposedChanges = []) {
  const records = [
    ...(campaign?.party ?? []),
    ...proposedChanges
      .filter((change) => normalizeChangeDomain(change.domain) === "party")
      .map((change) => change.data ?? {}),
  ];
  const names = records
    .map((record) => ({
      record,
      name: record.name || record.title,
    }))
    .filter((entry) => entry.name)
    .map((entry) => ({
      record: entry.record,
      name: String(entry.name).trim(),
    }))
    .filter((entry) => entry.name);
  const firstNames = new Map();

  names.forEach(({ name, record }) => {
    const first = name.split(/\s+/)[0];
    if (!first) {
      return;
    }
    const key = first.toLowerCase();
    firstNames.set(key, firstNames.has(key) ? null : { name, record });
  });

  const lookup = new Map();
  names.forEach(({ name, record }) => lookup.set(name.toLowerCase(), { name, record }));
  for (const [first, entry] of firstNames) {
    if (entry) {
      lookup.set(first, entry);
    }
  }

  return [...lookup.entries()]
    .sort((a, b) => b[0].length - a[0].length)
    .map(([alias, entry]) => ({ alias, name: entry.name, record: entry.record }));
}

function parseSpeakerLine(line, speakerLookup) {
  if (isChoiceLikeLine(line)) {
    return null;
  }
  const normalized = String(line ?? "").replace(/^[-*]\s+/, "").replace(/^\*\*(.+?)\*\*/, "$1").trim();
  for (const speaker of speakerLookup) {
    const escaped = escapeRegExp(speaker.alias);
    const pattern = new RegExp(`^(?:["â€œâ€']?)(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*[:\\-]\\s*(.+)$`, "i");
    const match = normalized.match(pattern);
    if (match) {
      return {
        name: speaker.name,
        body: match[1].trim(),
        record: speaker.record,
      };
    }
  }

  return null;
}

function normalizeChoiceItems(items) {
  const normalized = [];
  let hasSomethingElse = false;
  for (const item of items) {
    const cleaned = cleanChoiceText(item);
    if (!cleaned) {
      continue;
    }
    if (/^something else(?:\.\.\.|\.?)$/i.test(cleaned)) {
      if (!hasSomethingElse) {
        normalized.push("Something else.");
        hasSomethingElse = true;
      }
      continue;
    }
    normalized.push(cleaned);
  }
  return normalized;
}

function isChoiceLikeLine(line) {
  return /^\s*(?:[-*]\s*)?(?:[A-Ha-h]|\d{1,2})\s*[\).:-]\s+/.test(String(line ?? ""));
}

function isHiddenStoryChange(change = {}) {
  return (
    normalizeChangeDomain(change.domain) === "quests" &&
    change.visibility === "dm_only" &&
    (change.data?.threadType === "story_arc" ||
      change.data?.thread_type === "story_arc" ||
      change.data?.kind === "story_arc" ||
      change.data?.type === "story_arc")
  );
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeChangeDomain(domain) {
  if (domain === "party_member" || domain === "player_character") {
    return "party";
  }
  return domain;
}
