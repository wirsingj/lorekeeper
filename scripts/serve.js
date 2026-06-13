import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createNewActiveCampaign,
  deleteCampaign,
  listCampaigns,
  loadActiveCampaign,
  loadImportedCampaign,
  selectCampaign,
  updateActiveCampaign,
} from "../src/storage/campaign-repository.js";
import { addChatMessage } from "../src/campaign-state/chat-history.js";
import { addCampaignRecord } from "../src/campaign-state/direct-records.js";
import { upsertProviderConversation } from "../src/campaign-state/provider-conversations.js";
import { commitReviewBatch } from "../src/storage/review-commit.js";
import { buildContextPack } from "../src/context-packs/build-context-pack.js";
import { contextPackKinds } from "../src/campaign-state/schema.js";
import { parsePlayerMessage } from "../src/play-loop/player-message.js";
import {
  generateTurnWithProvider,
  getCampaignProviderSettings,
  getProviderStatusForCampaign,
  updateCampaignProviderSettings,
} from "../src/ai/provider-service.js";
import { OllamaProvider } from "../src/ai/ollama-provider.js";
import {
  approveJoinRequest,
  clearPendingTurnInputs,
  createGuestSnapshot,
  createHostSnapshot,
  createInviteForPartyMember,
  denyJoinRequest,
  disconnectGuest,
  firstLanAddress,
  passGuestAction,
  requestJoin,
  returnToAiCompanion,
  revokeController,
  revokeInvite,
  setHostController,
  startLocalTable,
  stopLocalTable,
  submitGuestAction,
} from "../src/multiplayer/local-table.js";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT ?? process.argv[2] ?? 4173);
const bindHost = process.env.LOREKEEPER_BIND_HOST || process.env.HOST || "127.0.0.1";
const apiToken = process.env.LOREKEEPER_API_TOKEN || "";
const builtAppRoot = path.join(projectRoot, "dist", "app");
const startedAt = new Date().toISOString();
const maxJsonBodyBytes = 1024 * 1024;

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
]);

const noCacheHeaders = {
  "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  pragma: "no-cache",
  expires: "0",
};

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-lorekeeper-api-token,x-lorekeeper-campaign-id,x-lorekeeper-sqlite-path",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (!isAllowedRequestOrigin(request)) {
      sendText(response, 403, "Forbidden origin");
      return;
    }
    if (!isAuthorizedRequest(request, url)) {
      sendText(response, 401, "Unauthorized LoreKeeper API request");
      return;
    }
    const campaignGuard = await validateCampaignPin(request, url);
    if (!campaignGuard.ok) {
      sendText(response, 409, campaignGuard.message);
      return;
    }

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        ...corsHeaders,
        ...noCacheHeaders,
      });
      response.end();
      return;
    }

    if (url.pathname === "/") {
      const builtIndex = path.join(builtAppRoot, "index.html");
      if (existsSync(builtIndex)) {
        await serveFile(builtIndex, response);
      } else {
        sendText(response, 200, "Lorekeeper API is running. Start the React app with npm run dev.");
      }
      return;
    }

    if (url.pathname === "/api/runtime" && request.method === "GET") {
      sendJson(response, 200, {
        pid: process.pid,
        parentPid: process.ppid,
        projectRoot,
        port,
        bindHost,
        startedAt,
        authRequired: Boolean(apiToken),
      });
      return;
    }

    if (url.pathname === "/api/diagnostics" && request.method === "GET") {
      const diagnostics = await buildDiagnosticsBundle();
      sendJson(response, 200, url.searchParams.get("full") === "1" ? diagnostics : redactDiagnosticsBundle(diagnostics));
      return;
    }

    if (url.pathname === "/api/campaign" && request.method === "GET") {
      const payload = await loadActiveCampaign(projectRoot);
      sendJson(response, 200, {
        campaign: payload.campaign,
        source: payload.source,
        sqlitePath: payload.sqlitePath,
        campaigns: payload.campaigns,
      });
      return;
    }

    if (url.pathname === "/api/campaigns" && request.method === "GET") {
      sendJson(response, 200, await listCampaigns(projectRoot));
      return;
    }

    if (url.pathname === "/api/campaign/select" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await selectCampaign(projectRoot, body.sqlitePath);
      sendJson(response, 200, payload);
      return;
    }

    if (url.pathname === "/api/campaign/new" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await createNewActiveCampaign(projectRoot, {
        title: body.title ?? "New Campaign Binder",
        premise: body.premise ?? "A new D&D 5e-lite campaign ready to grow through play.",
        openingScene: body.openingScene,
        startingLocation: body.startingLocation,
        tone: body.tone,
        providerSettings: body.providerSettings,
      });
      sendJson(response, 200, payload);
      return;
    }

    if ((url.pathname === "/api/campaign/delete" || url.pathname === "/api/campaign/hide") && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await deleteCampaign(projectRoot, {
        sqlitePath: body.sqlitePath,
        campaignTitle: body.campaignTitle,
      });
      sendJson(response, 200, payload);
      return;
    }

    if (url.pathname === "/api/campaign/imported" && request.method === "POST") {
      const payload = await loadImportedCampaign(projectRoot);
      sendJson(response, 200, payload);
      return;
    }

    if (url.pathname === "/api/campaign/record" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => addCampaignRecord(campaign, body));
      sendJson(response, 200, payload);
      return;
    }

    if (url.pathname === "/api/campaign/message" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => addChatMessage(campaign, body));
      sendJson(response, 200, payload);
      return;
    }

    if (url.pathname === "/api/campaign/message/update" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => updateCampaignMessage(campaign, body));
      sendJson(response, 200, payload);
      return;
    }

    if (url.pathname === "/api/provider/conversation" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => upsertProviderConversation(campaign, body));
      sendJson(response, 200, payload);
      return;
    }

    if (url.pathname === "/api/provider/status" && request.method === "GET") {
      const { campaign } = await loadActiveCampaign(projectRoot);
      sendJson(response, 200, await getProviderStatusForCampaign(campaign));
      return;
    }

    if (url.pathname === "/api/provider/settings" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => ({
        campaign: updateCampaignProviderSettings(campaign, body),
      }));
      sendJson(response, 200, {
        ...payload,
        providerStatus: await getProviderStatusForCampaign(payload.campaign),
      });
      return;
    }

    if (url.pathname === "/api/provider/generate-turn" && request.method === "POST") {
      await streamProviderTurn(request, response);
      return;
    }

    if (url.pathname === "/api/multiplayer/snapshot" && request.method === "GET") {
      const { campaign } = await loadActiveCampaign(projectRoot);
      sendJson(response, 200, createHostSnapshot(campaign));
      return;
    }

    if (url.pathname === "/api/multiplayer/start" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => ({
        campaign: startLocalTable(campaign, {
          host: body.host,
          port: body.port || port,
          lanAddress: body.lanAddress || firstLanAddress(),
        }),
      }));
      sendJson(response, 200, {
        ...payload,
        multiplayer: createHostSnapshot(payload.campaign),
      });
      return;
    }

    if (url.pathname === "/api/multiplayer/stop" && request.method === "POST") {
      const payload = await updateActiveCampaign(projectRoot, (campaign) => ({
        campaign: stopLocalTable(campaign),
      }));
      sendJson(response, 200, {
        ...payload,
        multiplayer: createHostSnapshot(payload.campaign),
      });
      return;
    }

    if (url.pathname === "/api/multiplayer/invite" && request.method === "POST") {
      const body = await readJsonBody(request);
      let inviteResult = null;
      const payload = await updateActiveCampaign(projectRoot, (campaign) => {
        inviteResult = createInviteForPartyMember(campaign, {
          partyMemberId: body.partyMemberId,
          host: body.host,
          port: body.port || port,
        });
        return { campaign: inviteResult.campaign };
      });
      sendJson(response, 200, {
        ...payload,
        invite: inviteResult.invite,
        inviteLink: inviteResult.inviteLink,
        multiplayer: createHostSnapshot(payload.campaign),
      });
      return;
    }

    if (url.pathname === "/api/multiplayer/invite/revoke" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => ({
        campaign: revokeInvite(campaign, body.inviteId),
      }));
      sendJson(response, 200, {
        ...payload,
        multiplayer: createHostSnapshot(payload.campaign),
      });
      return;
    }

    if (url.pathname === "/api/multiplayer/join" && request.method === "POST") {
      const body = await readJsonBody(request);
      let joinResult = null;
      const payload = await updateActiveCampaign(projectRoot, (campaign) => {
        joinResult = requestJoin(campaign, {
          inviteLink: body.inviteLink,
          playerName: body.playerName,
          clientId: body.clientId,
        });
        return { campaign: joinResult.campaign };
      });
      sendJson(response, 200, {
        connection: joinResult.connection,
        connectionSecret: joinResult.connectionSecret,
        player: joinResult.player,
        approved: joinResult.approved,
        snapshot: joinResult.approved ? createGuestSnapshot(payload.campaign, joinResult.connection.id, {
          clientId: body.clientId,
          connectionSecret: joinResult.connectionSecret,
        }) : null,
      });
      return;
    }

    if (url.pathname === "/api/multiplayer/join/approve" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => ({
        campaign: approveJoinRequest(campaign, body.connectionId),
      }));
      sendJson(response, 200, {
        ...payload,
        multiplayer: createHostSnapshot(payload.campaign),
      });
      return;
    }

    if (url.pathname === "/api/multiplayer/join/deny" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => ({
        campaign: denyJoinRequest(campaign, body.connectionId),
      }));
      sendJson(response, 200, {
        ...payload,
        multiplayer: createHostSnapshot(payload.campaign),
      });
      return;
    }

    if (url.pathname === "/api/multiplayer/guest-snapshot" && request.method === "GET") {
      const { campaign } = await loadActiveCampaign(projectRoot);
      sendJson(response, 200, createGuestSnapshot(campaign, url.searchParams.get("connectionId"), {
        clientId: url.searchParams.get("clientId"),
        connectionSecret: url.searchParams.get("connectionSecret"),
      }));
      return;
    }

    if (url.pathname === "/api/multiplayer/action" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => ({
        campaign: submitGuestAction(campaign, body),
      }));
      sendJson(response, 200, {
        snapshot: createGuestSnapshot(payload.campaign, body.connectionId, {
          clientId: body.clientId,
          connectionSecret: body.connectionSecret,
        }),
      });
      return;
    }

    if (url.pathname === "/api/multiplayer/pass" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => ({
        campaign: passGuestAction(campaign, body),
      }));
      sendJson(response, 200, {
        snapshot: createGuestSnapshot(payload.campaign, body.connectionId, {
          clientId: body.clientId,
          connectionSecret: body.connectionSecret,
        }),
      });
      return;
    }

    if (url.pathname === "/api/multiplayer/disconnect" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => ({
        campaign: disconnectGuest(campaign, body.connectionId),
      }));
      sendJson(response, 200, {
        ...payload,
        multiplayer: createHostSnapshot(payload.campaign),
      });
      return;
    }

    if (url.pathname === "/api/multiplayer/controller/revoke" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => ({
        campaign: revokeController(campaign, body.partyMemberId),
      }));
      sendJson(response, 200, {
        ...payload,
        multiplayer: createHostSnapshot(payload.campaign),
      });
      return;
    }

    if (url.pathname === "/api/multiplayer/controller/ai" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => ({
        campaign: returnToAiCompanion(campaign, body.partyMemberId),
      }));
      sendJson(response, 200, {
        ...payload,
        multiplayer: createHostSnapshot(payload.campaign),
      });
      return;
    }

    if (url.pathname === "/api/multiplayer/controller/host" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => ({
        campaign: setHostController(campaign, body.partyMemberId),
      }));
      sendJson(response, 200, {
        ...payload,
        multiplayer: createHostSnapshot(payload.campaign),
      });
      return;
    }

    if (url.pathname === "/api/multiplayer/pending/clear" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => ({
        campaign: clearPendingTurnInputs(campaign, body.inputIds),
      }));
      sendJson(response, 200, {
        ...payload,
        multiplayer: createHostSnapshot(payload.campaign),
      });
      return;
    }

    if (url.pathname === "/api/ollama/pull" && request.method === "POST") {
      await streamOllamaPull(request, response);
      return;
    }

    if (url.pathname === "/api/ollama/test" && request.method === "POST") {
      const body = await readJsonBody(request);
      const { campaign } = await loadActiveCampaign(projectRoot);
      const settings = getCampaignProviderSettings(campaign);
      const provider = new OllamaProvider({ baseUrl: settings.ollamaBaseUrl });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), settings.generationTimeoutMs);
      response.on("close", () => {
        if (!response.writableEnded) {
          controller.abort();
        }
      });
      try {
        const result = await provider.testGeneration({
          model: body.model || settings.selectedModel,
          signal: controller.signal,
        });
        sendJson(response, 200, result);
      } finally {
        clearTimeout(timer);
      }
      return;
    }

    if (url.pathname === "/api/review/commit" && request.method === "POST") {
      const body = await readJsonBody(request);
      const result = await commitReviewBatch(projectRoot, body.reviewBatch);
      sendJson(response, 200, result);
      return;
    }

    if (url.pathname === "/local-asset") {
      await serveLocalAsset(url, response);
      return;
    }

    const builtAsset = path.resolve(builtAppRoot, decodeURIComponent(url.pathname.slice(1)));
    if (isPathInside(builtAsset, builtAppRoot) && existsSync(builtAsset)) {
      await serveFile(builtAsset, response);
      return;
    }

    sendText(response, 404, "Not found");
  } catch (error) {
    sendError(response, error);
  }
});

server.on("error", (error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

server.listen(port, bindHost, () => {
  console.log(`Lorekeeper local app: http://${bindHost === "127.0.0.1" ? "localhost" : bindHost}:${port}`);
});

if (process.channel) {
  process.on("disconnect", () => shutdownServer("parent-disconnect"));
}

const parentPid = Number(process.env.LOREKEEPER_PARENT_PID || 0);
if (parentPid > 0) {
  const parentMonitor = setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      shutdownServer("parent-exit");
    }
  }, 5000);
  parentMonitor.unref();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdownServer(signal));
}

function shutdownServer(signal) {
  console.log(`Lorekeeper local app shutting down (${signal}).`);
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2000).unref();
}

async function buildDiagnosticsBundle() {
  const active = await loadActiveCampaign(projectRoot).catch((error) => ({
    error: error instanceof Error ? error.message : "Active campaign load failed.",
  }));
  const campaign = active.campaign ?? null;
  const recentMessages = (campaign?.sessionLog?.messages ?? []).slice(-40);
  const recentReviews = (campaign?.reviewLog ?? []).slice(-8);
  const logFiles = [
    "launcher.log",
    "electron.log",
    "launcher-thin.log",
    "electron-thin.log",
  ];

  return {
    generatedAt: new Date().toISOString(),
    runtime: {
      pid: process.pid,
      parentPid: process.ppid,
      projectRoot,
      port,
      bindHost,
      startedAt,
      node: process.version,
      platform: process.platform,
      authRequired: Boolean(apiToken),
    },
    activeCampaign: campaign ? {
      id: campaign.id,
      title: campaign.title,
      sqlitePath: active.sqlitePath,
      source: active.source,
      updatedAt: campaign.updatedAt,
      scene: campaign.scene,
      combat: campaign.combat,
      providerSettings: campaign.providerSettings,
      counts: {
        party: campaign.party?.length ?? 0,
        people: campaign.people?.length ?? 0,
        places: campaign.places?.length ?? 0,
        items: campaign.items?.length ?? 0,
        threads: campaign.quests?.length ?? 0,
        messages: campaign.sessionLog?.messages?.length ?? 0,
        reviews: campaign.reviewLog?.length ?? 0,
      },
    } : {
      error: active.error ?? "No active campaign loaded.",
    },
    recentMessages,
    recentReviews,
    logs: Object.fromEntries(await Promise.all(logFiles.map(async (name) => [
      name,
      await readLogTail(path.join(projectRoot, "data", name)),
    ]))),
  };
}

function redactDiagnosticsBundle(bundle) {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const redacted = redactValue(bundle, [
    [apiToken, "[redacted-api-token]"],
    [home, "[home]"],
    [projectRoot, "[project-root]"],
  ].filter(([value]) => value));
  return {
    ...redacted,
    redacted: true,
    note: "Default diagnostics redact local paths and launch secrets. Use /api/diagnostics?full=1 from the desktop app for a full local-only dump.",
  };
}

function redactValue(value, replacements) {
  if (typeof value === "string") {
    return replacements.reduce((text, [needle, replacement]) => text.split(needle).join(replacement), value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, replacements));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redactValue(entry, replacements)]),
    );
  }
  return value;
}

async function readLogTail(logPath, maxChars = 24000) {
  if (!existsSync(logPath)) {
    return "";
  }
  try {
    const text = await readFile(logPath, "utf8");
    return text.length > maxChars ? text.slice(-maxChars) : text;
  } catch (error) {
    return `Unable to read ${path.basename(logPath)}: ${error instanceof Error ? error.message : error}`;
  }
}

async function streamProviderTurn(request, response) {
  const body = await readJsonBody(request);
  const { campaign } = await loadActiveCampaign(projectRoot);
  const settings = getCampaignProviderSettings(campaign);
  const parsedMessage = parsePlayerMessage(body.playerMessage ?? "");
  const contextPack = buildContextPack(campaign, {
    purpose: settings.fastMode ? "fast_player_turn" : "player_turn",
    includeCombatDetail: isCombatRelevant(parsedMessage),
    kinds: settings.fastMode ? fastContextKinds() : undefined,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.generationTimeoutMs);
  response.on("close", () => {
    if (!response.writableEnded) {
      controller.abort();
    }
  });

  response.writeHead(200, {
    "content-type": "application/x-ndjson; charset=utf-8",
    ...corsHeaders,
    ...noCacheHeaders,
  });

  try {
    writeNdjson(response, {
      type: "start",
      provider: settings.preferredProvider,
      model: settings.selectedModel,
      fastMode: settings.fastMode,
      contextSections: contextPack.sections.length,
    });

    const result = await generateTurnWithProvider({
      campaign,
      contextPack,
      playerTurn: parsedMessage.inWorldText || body.playerMessage || "",
      parsedMessage: {
        ...parsedMessage,
        playerInputs: Array.isArray(body.playerInputs) ? body.playerInputs : [],
      },
      providerSettings: settings,
      signal: controller.signal,
      onToken: (token) => writeNdjson(response, { type: "token", text: token }),
    });

    writeNdjson(response, {
      type: "done",
      result: {
        providerId: result.providerId,
        model: result.model,
        durationMs: result.durationMs,
        contextSize: result.contextSize,
        tokenCounts: result.tokenCounts,
        text: result.text,
        structured: result.structured,
        parseError: result.parseError,
        validationErrors: result.validationErrors,
        repairAttempt: result.repairAttempt,
      },
    });
  } catch (error) {
    writeNdjson(response, {
      type: "error",
      error: error instanceof Error ? error.message : "Provider generation failed.",
    });
  } finally {
    clearTimeout(timer);
    response.end();
  }
}

async function streamOllamaPull(request, response) {
  const body = await readJsonBody(request);
  const { campaign } = await loadActiveCampaign(projectRoot);
  const settings = getCampaignProviderSettings(campaign);
  const model = body.model || settings.selectedModel;
  const provider = new OllamaProvider({ baseUrl: settings.ollamaBaseUrl });
  const controller = new AbortController();
  response.on("close", () => {
    if (!response.writableEnded) {
      controller.abort();
    }
  });

  response.writeHead(200, {
    "content-type": "application/x-ndjson; charset=utf-8",
    ...corsHeaders,
    ...noCacheHeaders,
  });

  try {
    writeNdjson(response, { type: "start", model });
    const result = await provider.pullModel({
      model,
      signal: controller.signal,
      onProgress: (progress) => writeNdjson(response, { type: "progress", progress }),
    });
    writeNdjson(response, { type: "done", result });
  } catch (error) {
    writeNdjson(response, {
      type: "error",
      error: error instanceof Error ? error.message : "Ollama model pull failed.",
    });
  } finally {
    response.end();
  }
}

function writeNdjson(response, payload) {
  response.write(`${JSON.stringify(payload)}\n`);
}

function updateCampaignMessage(campaign, patch = {}) {
  const messageId = String(patch.id || "").trim();
  if (!messageId) {
    const error = new Error("Message id is required.");
    error.statusCode = 400;
    error.publicMessage = "Message id is required";
    throw error;
  }

  const messages = campaign.sessionLog?.messages ?? [];
  let found = false;
  const updatedMessages = messages.map((message) => {
    if (message.id !== messageId) {
      return message;
    }
    found = true;
    return {
      ...message,
      body: typeof patch.body === "string" ? patch.body : message.body,
      meta: typeof patch.meta === "string" ? patch.meta : message.meta,
      data: {
        ...(message.data ?? {}),
        ...(patch.data ?? {}),
      },
    };
  });

  if (!found) {
    const error = new Error("Message not found.");
    error.statusCode = 404;
    error.publicMessage = "Message not found";
    throw error;
  }

  return {
    campaign: {
      ...campaign,
      sessionLog: {
        ...(campaign.sessionLog ?? {}),
        messages: updatedMessages,
      },
    },
  };
}

function isCombatRelevant(parsedMessage) {
  const haystack = [
    parsedMessage.inWorldText,
    ...(parsedMessage.metaInstructions ?? []),
  ].join(" ").toLowerCase();

  return /\b(combat|fight|attack|attacks|attacking|spell|damage|hp|initiative|roll|enemy|monster|creature|beast|wolf|weapon|crossbow|bow|arrow|cast|shoot|shot|fire|fires|firing|stab|strike|wounded|under attack)\b/.test(haystack);
}

function fastContextKinds() {
  return [
    contextPackKinds.SCENE,
    contextPackKinds.HISTORY,
    contextPackKinds.PARTY,
    contextPackKinds.THREADS,
    contextPackKinds.COMBAT,
    contextPackKinds.STYLE,
  ];
}

async function serveLocalAsset(url, response) {
  const assetPath = url.searchParams.get("path");
  const assetName = url.searchParams.get("name");

  if (assetPath) {
    const resolved = path.resolve(assetPath);
    const allowed = await isAllowedLocalAssetPath(resolved);
    if (!allowed) {
      sendText(response, 403, "Forbidden asset");
      return;
    }
    await serveFile(resolved, response);
    return;
  }

  if (assetName) {
    const bundlePath = path.join(projectRoot, "data", "imports", "veil-of-the-towers.bundle.json");
    if (!existsSync(bundlePath)) {
      sendText(response, 404, "No campaign bundle found");
      return;
    }

    const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
    const match = bundle.campaign.assets.find((asset) => asset.name === assetName);
    if (!match) {
      sendText(response, 404, "Asset not found");
      return;
    }

    const resolved = path.resolve(match.path);
    const allowed = await isAllowedLocalAssetPath(resolved);
    if (!allowed) {
      sendText(response, 403, "Forbidden asset");
      return;
    }
    await serveFile(resolved, response);
    return;
  }

  sendText(response, 400, "Missing asset path");
}

async function isAllowedLocalAssetPath(assetPath) {
  const allowedRoots = [
    path.join(projectRoot, "public"),
    path.join(projectRoot, "app", "assets"),
    path.join(projectRoot, "data", "imports"),
  ];
  if (allowedRoots.some((root) => isPathInside(assetPath, root))) {
    return true;
  }

  try {
    const { campaign } = await loadActiveCampaign(projectRoot);
    const allowedPaths = [
      ...(campaign.assets ?? []).map((asset) => asset.path),
      ...(campaign.sourceDocuments ?? []).map((document) => document.path),
    ]
      .filter(Boolean)
      .map((item) => path.resolve(item));
    return allowedPaths.some((allowedPath) => allowedPath === assetPath);
  } catch {
    return false;
  }
}

async function serveFile(filePath, response) {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    sendText(response, 404, "Not found");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "content-type": mimeTypes.get(extension) ?? "application/octet-stream",
    "content-length": fileStat.size,
    ...noCacheHeaders,
  });
  createReadStream(filePath).pipe(response);
}

function sendText(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    ...corsHeaders,
    ...noCacheHeaders,
  });
  response.end(body);
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    ...corsHeaders,
    ...noCacheHeaders,
  });
  response.end(JSON.stringify(body, null, 2));
}

function sendError(response, error) {
  const statusCode = Number(error?.statusCode) || 500;
  const message = typeof error?.publicMessage === "string"
    ? error.publicMessage
    : statusCode >= 500
      ? "Server error"
      : "Request failed";
  console.error(error instanceof Error ? error.stack || error.message : error);
  sendText(response, statusCode, message);
}

function isAuthorizedRequest(request, url) {
  if (!apiToken) {
    return true;
  }
  if (!isProtectedApiPath(url.pathname, request.method)) {
    return true;
  }
  return request.headers["x-lorekeeper-api-token"] === apiToken;
}

function isProtectedApiPath(pathname, method) {
  if (!pathname.startsWith("/api/")) {
    return false;
  }
  if (pathname === "/api/runtime") {
    return false;
  }
  if (pathname === "/api/multiplayer/join"
    || pathname === "/api/multiplayer/guest-snapshot"
    || pathname === "/api/multiplayer/action"
    || pathname === "/api/multiplayer/pass") {
    return false;
  }
  if (method === "OPTIONS") {
    return false;
  }
  return true;
}

async function validateCampaignPin(request, url) {
  if (request.method !== "POST" || !requiresCampaignPin(url.pathname)) {
    return { ok: true };
  }

  const expectedCampaignId = String(request.headers["x-lorekeeper-campaign-id"] || "").trim();
  const expectedSqlitePath = String(request.headers["x-lorekeeper-sqlite-path"] || "").trim();
  if (!expectedCampaignId && !expectedSqlitePath) {
    return { ok: true };
  }

  const active = await loadActiveCampaign(projectRoot);
  if (expectedCampaignId && active.campaign?.id !== expectedCampaignId) {
    return {
      ok: false,
      message: "Active campaign changed before this request could be applied. Reload the campaign and try again.",
    };
  }
  if (expectedSqlitePath && path.resolve(active.sqlitePath || "") !== path.resolve(expectedSqlitePath)) {
    return {
      ok: false,
      message: "Active campaign file changed before this request could be applied. Reload the campaign and try again.",
    };
  }
  return { ok: true };
}

function requiresCampaignPin(pathname) {
  return new Set([
    "/api/campaign/record",
    "/api/campaign/delete",
    "/api/campaign/hide",
    "/api/campaign/message",
    "/api/campaign/message/update",
    "/api/provider/conversation",
    "/api/provider/settings",
    "/api/provider/generate-turn",
    "/api/multiplayer/start",
    "/api/multiplayer/stop",
    "/api/multiplayer/invite",
    "/api/multiplayer/invite/revoke",
    "/api/multiplayer/join/approve",
    "/api/multiplayer/join/deny",
    "/api/multiplayer/disconnect",
    "/api/multiplayer/controller/revoke",
    "/api/multiplayer/controller/ai",
    "/api/multiplayer/controller/host",
    "/api/multiplayer/pending/clear",
    "/api/review/commit",
  ]).has(pathname);
}

async function readJsonBody(request) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > maxJsonBodyBytes) {
      const error = new Error("JSON request body is too large.");
      error.statusCode = 413;
      error.publicMessage = "Request body too large";
      throw error;
    }
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("Malformed JSON request body.");
    error.statusCode = 400;
    error.publicMessage = "Invalid JSON body";
    throw error;
  }
}

function isAllowedRequestOrigin(request) {
  const origin = request.headers.origin;
  if (!origin || origin === "null") {
    return true;
  }

  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (isLoopbackHost(parsed.hostname)) {
      return true;
    }
    return isPrivateHost(parsed.hostname) && hostsMatch(parsed.hostname, request.headers.host);
  } catch {
    return false;
  }
}

function isLocalOrPrivateHost(hostname) {
  return isLoopbackHost(hostname) || isPrivateHost(hostname);
}

function isLoopbackHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "::1" || normalized === "127.0.0.1") {
    return true;
  }
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) {
    return true;
  }
  return false;
}

function isPrivateHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) {
    return true;
  }
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(normalized)) {
    return true;
  }
  const match172 = normalized.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  return Boolean(match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31);
}

function hostsMatch(originHostname, requestHostHeader) {
  if (!requestHostHeader) {
    return false;
  }
  const requestHostname = requestHostHeader
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/:\d+$/, "");
  return originHostname.toLowerCase().replace(/^\[|\]$/g, "") === requestHostname;
}

function isPathInside(childPath, parentPath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
