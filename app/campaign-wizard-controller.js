import { completeCharacterSeed } from "./character-autocomplete-controller.js";
import { clampLevel } from "../src/rules/character-seed.js";

export function normalizeWizardCharacter(input = {}) {
  const name = String(input.name ?? "").trim();
  const ancestry = String(input.ancestry ?? "").trim();
  const characterClass = String(input.characterClass ?? "").trim();
  const concept = String(input.concept ?? "").trim();
  const level = clampLevel(parseWizardNumber(input.level) ?? 1);

  return {
    name,
    ancestry,
    characterClass,
    level,
    concept,
    autoSheet: input.autoSheet !== false,
    controllerKind: input.controllerKind ? normalizeWizardControllerKind(input.controllerKind) : "",
  };
}

export function normalizeWizardJoiner(input = {}) {
  const seed = normalizeWizardCharacter(input);
  const integrationPrompt = String(input.integrationPrompt ?? "").trim();
  const hostIntegrationPrompt = String(input.hostIntegrationPrompt ?? "").trim();
  const hasAnyValue = [
    seed.name,
    seed.ancestry,
    seed.characterClass,
    seed.concept,
    integrationPrompt,
    hostIntegrationPrompt,
  ].some(Boolean);
  if (!hasAnyValue) {
    return null;
  }
  const completed = completeCharacterSeed({
    ...seed,
    integrationPrompt,
    hostIntegrationPrompt,
  });
  const controllerKind = normalizeWizardControllerKind(input.controllerKind || seed.controllerKind || "ai_companion");

  return {
    ...seed,
    ...completed,
    controllerKind,
    playerRole: wizardPlayerRoleForController(controllerKind),
    integrationPrompt: completed.integrationPrompt,
    hostIntegrationPrompt: completed.hostIntegrationPrompt,
  };
}

export function normalizeWizardJoiners(inputs = []) {
  return collection(inputs)
    .map((input) => normalizeWizardJoiner(input))
    .filter(Boolean);
}

export function buildOpeningSceneSummary({ premise, startingLocation, character, startingPartyMembers = [] }) {
  const joiners = collection(startingPartyMembers);
  const partyNames = [
    character?.name,
    ...joiners.map((member) => member.name),
  ].filter(Boolean);
  const placeLine = startingLocation
    ? `The table is set at ${startingLocation}.`
    : "The table is set for the first scene.";
  const details = [
    placeLine,
    partyNames.length
      ? `${partyNames.join(", ")} ${partyNames.length === 1 ? "is" : "are"} at the table.`
      : "",
    premise
      ? `Premise: ${premise}`
      : "",
    "Next: invite anyone else you want at the table, then press Start Adventure for the opening narration.",
  ].filter(Boolean);

  return details.join("\n\n");
}

export function formatCharacterBasics(character = {}) {
  const identity = [
    character.name,
    character.ancestry,
    character.characterClass,
    character.level ? `level ${character.level}` : "",
  ].filter(Boolean).join(", ");
  return [identity || "Unnamed player character", character.concept].filter(Boolean).join(" - ");
}

export function wizardControllerSheetFields(controllerKind, { primary = false } = {}) {
  const normalized = normalizeWizardControllerKind(controllerKind || (primary ? "host" : "ai_companion"));
  if (normalized === "host") {
    return {
      playerRole: primary ? "Host player character" : "Host-controlled party member",
      controllerKind: "host",
      controllerId: "host",
      fallbackControllerKind: "host",
    };
  }
  if (normalized === "remote_invite") {
    return {
      playerRole: "Remote invite seat",
      controllerKind: "unassigned",
      controllerId: null,
      fallbackControllerKind: "ai_companion",
      inviteIntent: "remote_player",
    };
  }
  return {
    playerRole: primary ? "AI party companion" : "AI party companion",
    controllerKind: "ai_companion",
    controllerId: null,
    fallbackControllerKind: "ai_companion",
  };
}

export function wizardPlayerRoleForController(controllerKind) {
  const normalized = normalizeWizardControllerKind(controllerKind);
  if (normalized === "host") {
    return "Host-controlled party member";
  }
  if (normalized === "remote_invite") {
    return "Remote invite seat";
  }
  return "AI party companion";
}

export function normalizeWizardControllerKind(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["ai_companion", "unassigned"].includes(normalized)) {
    return normalized;
  }
  if (["host", "player", "you"].includes(normalized)) {
    return "host";
  }
  if (["remote", "remote_player", "remote_invite", "invite", "friend"].includes(normalized)) {
    return "remote_invite";
  }
  return "ai_companion";
}

function collection(value) {
  return Array.isArray(value) ? value : [];
}

function parseWizardNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : text;
}
