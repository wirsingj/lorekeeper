const ACTIVITY_RULES = [
  {
    match: /generating locally|ollama generating|asking dm|waiting on chatgpt|(?:campaign|dm voice) chat is taking|sending turn to chatgpt dm|chatgpt dm answered/i,
    text: "DM is thinking...",
    phase: "dm_thinking",
  },
  {
    match: /preparing the dm turn|build(?:ing)? a table turn/i,
    text: "Preparing the table turn...",
    phase: "preparing_turn",
  },
  {
    match: /resuming unresolved player turn/i,
    text: "Recovering unresolved turn...",
    phase: "recovering_turn",
  },
  {
    match: /resolving .*enemy turn/i,
    text: (message) => message.replace(/^Resolving\s+/i, "DM resolving ").replace(/\s*$/i, "..."),
    phase: "enemy_turn",
  },
  {
    match: /waiting for (.+?)'?s combat turn/i,
    text: (message) => {
      const actor = message.match(/waiting for (.+?)'?s combat turn/i)?.[1] || "the active character";
      return `Waiting for ${actor}'s combat choice.`;
    },
    phase: "waiting_for_combat_actor",
  },
  {
    match: /waiting for (?:guest|player|remote).*action/i,
    text: "Waiting for the other player.",
    phase: "waiting_for_player",
  },
  {
    match: /host reviewing guest action|guest action.*approval/i,
    text: "Host reviewing guest action.",
    phase: "host_reviewing_guest_action",
  },
  {
    match: /combat input received|resolving staged remote action/i,
    text: "Resolving staged combat action...",
    phase: "resolving_remote_action",
  },
  {
    match: /guest actions received|sent an action; resolving/i,
    text: "Guest action received; DM is resolving it...",
    phase: "guest_action_resolving",
  },
  {
    match: /action sent to host/i,
    text: "Action sent to host table.",
    phase: "guest_action_sent",
  },
  {
    match: /party input staged|staged for the next send turn|party input is staged/i,
    text: "Party action staged for the next turn.",
    phase: "party_action_staged",
  },
  {
    match: /waiting for host (?:approval|review)/i,
    text: "Waiting for host review.",
    phase: "waiting_for_host",
  },
  {
    match: /repair needed|needs repair|model response needs repair/i,
    text: "DM response needs review.",
    phase: "dm_response_needs_review",
  },
  {
    match: /retrying/i,
    text: "DM is reconsidering the response...",
    phase: "retrying_dm",
  },
  {
    match: /local generation timed out|timed out/i,
    text: "DM response timed out; retry is available.",
    phase: "dm_timeout",
  },
  {
    match: /local generation canceled|canceled/i,
    text: "DM response canceled.",
    phase: "dm_cancelled",
  },
  {
    match: /response imported|local response imported|state updated from local response|imported provider response/i,
    text: "DM response received.",
    phase: "dm_response_received",
  },
  {
    match: /proposed changes awaiting review/i,
    text: "Host reviewing proposed changes.",
    phase: "host_review",
  },
  {
    match: /campaign opened|campaign ready|new campaign saved|local table started|connected as/i,
    text: (message) => message,
    phase: "ready",
  },
];

export function tableStatusForActivity(message, status = "idle") {
  const raw = String(message ?? "").trim();
  const rule = ACTIVITY_RULES.find((candidate) => candidate.match.test(raw));
  const text = typeof rule?.text === "function" ? rule.text(raw) : rule?.text;
  const normalizedText = text || fallbackStatusText(raw, status);
  return {
    text: normalizedText,
    phase: rule?.phase || fallbackPhase(status),
    raw,
    status,
  };
}

export function tableTimelineEvent(type, detail = {}) {
  const at = detail.at || new Date().toISOString();
  return {
    type,
    label: timelineLabel(type, detail),
    detail,
    at,
  };
}

function fallbackStatusText(raw, status) {
  if (!raw) {
    return "Table ready.";
  }
  if (status === "error") {
    return raw.replace(/^Ollama failed:/i, "DM could not answer:");
  }
  if (/provider|ollama|chatgpt|json|sqlite/i.test(raw)) {
    return raw
      .replace(/\bprovider\b/gi, "DM")
      .replace(/\bOllama\b/g, "local DM")
      .replace(/\bChatGPT\b/g, "DM chat")
      .replace(/\bJSON\b/g, "response");
  }
  return raw;
}

function fallbackPhase(status) {
  if (status === "working") return "working";
  if (status === "waiting") return "waiting";
  if (status === "error") return "error";
  return "idle";
}

function timelineLabel(type, detail) {
  const message = String(detail.message || detail.text || "").trim();
  if (message) {
    return message;
  }
  return String(type || "table_event").replace(/_/g, " ");
}
