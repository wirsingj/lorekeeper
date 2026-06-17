import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendActiveCampaignError,
  createNewActiveCampaign,
  deleteCampaign,
  listCampaigns,
  loadActiveCampaign,
  loadImportedCampaign,
  selectCampaign,
  updateActiveCampaign,
} from "../src/storage/campaign-repository.js";
import { readCampaignErrorsFromSqliteFile } from "../src/storage/sqlite-store.js";
import { addChatMessage } from "../src/campaign-state/chat-history.js";
import { addCampaignRecord } from "../src/campaign-state/direct-records.js";
import { upsertProviderConversation } from "../src/campaign-state/provider-conversations.js";
import { commitReviewBatch } from "../src/storage/review-commit.js";
import { buildContextPack } from "../src/context-packs/build-context-pack.js";
import { contextPackKinds, normalizePlayerNotes } from "../src/campaign-state/schema.js";
import { parsePlayerMessage } from "../src/play-loop/player-message.js";
import {
  generateTurnWithProvider,
  getCampaignProviderSettings,
  getProviderStatusForCampaign,
  updateCampaignProviderSettings,
} from "../src/ai/provider-service.js";
import { OllamaProvider } from "../src/ai/ollama-provider.js";
import { updateCampaignOllamaContext } from "../src/ai/ollama-context-cache.js";
import { buildTableDebugSnapshot } from "../src/engine/table-debug-snapshot.js";
import {
  approveJoinRequest,
  clearPendingTurnInputs,
  createGuestSnapshot,
  createHostSnapshot,
  createJoinPreview,
  createCharacterRequestInvite,
  createInviteForPartyMember,
  denyJoinRequest,
  disconnectGuest,
  firstLanAddress,
  heartbeatWaitingGuest,
  passGuestAction,
  joinPartyMemberCombat,
  postTableTalk,
  registerWaitingGuest,
  requestJoin,
  returnToAiCompanion,
  revokeController,
  revokeInvite,
  seatWaitingGuest,
  setHostController,
  startLocalTable,
  stopLocalTable,
  submitGuestAction,
  submitGuestChoiceVote,
  updateMultiplayerSettings,
} from "../src/multiplayer/local-table.js";

// Local HTTP surface for both the desktop host and same-network guests.
// This file is still intentionally pragmatic: route handling, campaign loading,
// and local-table mutations meet here. When changing multiplayer behavior, keep
// identity checks close to the route and pure table logic in src/multiplayer.
const defaultProjectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const projectRoot = path.resolve(process.env.LOREKEEPER_PROJECT_ROOT || defaultProjectRoot);
const serverModulePath = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === serverModulePath;
const port = Number(process.env.PORT ?? process.argv[2] ?? 4173);
const bindHost = process.env.LOREKEEPER_BIND_HOST || process.env.HOST || "127.0.0.1";
const apiToken = process.env.LOREKEEPER_API_TOKEN || "";
const builtAppRoot = path.join(defaultProjectRoot, "dist", "app");
const startedAt = new Date().toISOString();
const maxJsonBodyBytes = 1024 * 1024;
let preTableLobby = null;

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

const securityHeaders = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-lorekeeper-api-token,x-lorekeeper-campaign-id,x-lorekeeper-sqlite-path",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    // Request gates are ordered from broadest to most stateful:
    // origin/auth first, then active-campaign pinning, then route handling.
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

    if (url.pathname === "/" || url.pathname === "/guest") {
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
        port: activeServerPort(),
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

    // Campaign CRUD still lives here because the desktop app and same-network
    // guest page share this local process. Future target: campaign routes module
    // that calls CampaignRepository without growing the main router.
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
        title: body.title,
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

    if (url.pathname === "/api/campaign/player-notes" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => updateCampaignPlayerNotes(campaign, body));
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

    // Provider streaming remains in this server so local Ollama tokens can flow
    // to the renderer. Future target: ProviderOrchestrator route module with
    // explicit campaign/table/session envelopes on every generation request.
    if (url.pathname === "/api/provider/generate-turn" && request.method === "POST") {
      await streamProviderTurn(request, response);
      return;
    }

    // Multiplayer routes intentionally keep identity validation near the HTTP
    // boundary. Future target: MultiplayerSessionEngine owns the route handlers
    // and exposes host/guest projections to this file.
    if (url.pathname === "/api/multiplayer/snapshot" && request.method === "GET") {
      const { campaign } = await loadActiveCampaign(projectRoot);
      sendJson(response, 200, createHostSnapshot(campaign));
      return;
    }

    if (url.pathname === "/api/pretable-lobby/publish" && request.method === "POST") {
      const body = await readJsonBody(request);
      preTableLobby = publishPreTableLobby(body);
      sendJson(response, 200, preTableLobbyHostSnapshot(preTableLobby));
      return;
    }

    if (url.pathname === "/api/pretable-lobby/close" && request.method === "POST") {
      preTableLobby = null;
      sendJson(response, 200, { open: false });
      return;
    }

    if (url.pathname === "/api/pretable-lobby/host-snapshot" && request.method === "GET") {
      sendJson(response, 200, preTableLobby ? preTableLobbyHostSnapshot(preTableLobby) : { open: false });
      return;
    }

    if (url.pathname === "/api/pretable-lobby/seat" && request.method === "POST") {
      const body = await readJsonBody(request);
      sendJson(response, 200, seatPreTableWaitingGuest(body));
      return;
    }

    if (url.pathname === "/api/pretable-lobby/adopt-active" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => {
        assertRequestOwnsActiveTable(campaign, body);
        return { campaign: adoptPreTableWaitingGuests(campaign) };
      });
      sendJson(response, 200, {
        ...payload,
        multiplayer: createHostSnapshot(payload.campaign),
      });
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
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => {
        assertRequestOwnsActiveTable(campaign, body);
        return { campaign: stopLocalTable(campaign) };
      });
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
        assertRequestOwnsActiveTable(campaign, body);
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

    if (url.pathname === "/api/multiplayer/invite-character" && request.method === "POST") {
      const body = await readJsonBody(request);
      let inviteResult = null;
      const payload = await updateActiveCampaign(projectRoot, (campaign) => {
        assertRequestOwnsActiveTable(campaign, body);
        inviteResult = createCharacterRequestInvite(campaign, {
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
      const payload = await updateActiveCampaign(projectRoot, (campaign) => {
        assertRequestOwnsActiveTable(campaign, body);
        return { campaign: revokeInvite(campaign, body.inviteId) };
      });
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
          proposedCharacter: body.proposedCharacter,
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

    if (url.pathname === "/api/multiplayer/join-preview" && request.method === "GET") {
      if (preTableLobby?.open && !url.searchParams.get("inviteLink")) {
        sendJson(response, 200, preTableLobbyGuestPreview(preTableLobby));
        return;
      }
      const { campaign } = await loadActiveCampaign(projectRoot);
      sendJson(response, 200, createJoinPreview(campaign, url.searchParams.get("inviteLink"), {
        campaignId: url.searchParams.get("campaignId") || url.searchParams.get("campaign") || "",
        tableId: url.searchParams.get("tableId") || url.searchParams.get("table") || "",
        sessionId: url.searchParams.get("sessionId") || url.searchParams.get("session") || "",
      }));
      return;
    }

    if (url.pathname === "/api/multiplayer/waiting-room/register" && request.method === "POST") {
      const body = await readJsonBody(request);
      if (preTableLobby?.open) {
        const result = registerPreTableWaitingGuest(preTableLobby, body);
        sendJson(response, 200, {
          waitingGuest: publicPreTableWaitingGuest(result.waitingGuest),
          waitingSecret: result.waitingSecret,
          campaignTitle: preTableLobby.title,
          campaignId: preTableLobby.campaignId,
          localTable: preTableLobby.localTable,
        });
        return;
      }
      let waitingResult = null;
      const payload = await updateActiveCampaign(projectRoot, (campaign) => {
        waitingResult = registerWaitingGuest(campaign, {
          playerName: body.playerName,
          clientId: body.clientId,
          campaignId: body.campaignId,
          tableId: body.tableId,
          sessionId: body.sessionId,
          tableSessionId: body.tableSessionId,
          preferredPartyMemberId: body.preferredPartyMemberId,
        });
        return { campaign: waitingResult.campaign };
      });
      sendJson(response, 200, {
        waitingGuest: {
          id: waitingResult.waitingGuest.id,
          displayName: waitingResult.waitingGuest.displayName,
          status: waitingResult.waitingGuest.status,
          preferredPartyMemberId: waitingResult.waitingGuest.preferredPartyMemberId ?? null,
        },
        waitingSecret: waitingResult.waitingSecret,
        campaignTitle: payload.campaign?.title ?? "",
        campaignId: payload.campaign?.id ?? "",
        localTable: payload.campaign?.multiplayer?.localTable ?? null,
      });
      return;
    }

    if (url.pathname === "/api/multiplayer/waiting-room/status" && request.method === "GET") {
      if (preTableLobby?.open && preTableLobby.waitingGuests?.some((guest) => guest.id === url.searchParams.get("waitingGuestId"))) {
        const snapshot = heartbeatPreTableWaitingGuest(preTableLobby, {
          waitingGuestId: url.searchParams.get("waitingGuestId"),
          clientId: url.searchParams.get("clientId"),
          waitingSecret: url.searchParams.get("waitingSecret"),
        });
        sendJson(response, 200, snapshot);
        return;
      }
      let heartbeatResult = null;
      await updateActiveCampaign(projectRoot, (campaign) => {
        const adoptedGuest = campaign.multiplayer?.waitingGuests?.find((guest) => guest.id === url.searchParams.get("waitingGuestId"));
        const identity = adoptedGuest
          ? {
              campaignId: campaign.id,
              tableId: campaign.multiplayer?.localTable?.tableId,
              sessionId: campaign.multiplayer?.localTable?.sessionId,
            }
          : {
              campaignId: url.searchParams.get("campaignId"),
              tableId: url.searchParams.get("tableId"),
              sessionId: url.searchParams.get("sessionId"),
              tableSessionId: url.searchParams.get("tableSessionId"),
            };
        heartbeatResult = heartbeatWaitingGuest(campaign, {
          waitingGuestId: url.searchParams.get("waitingGuestId"),
          clientId: url.searchParams.get("clientId"),
          waitingSecret: url.searchParams.get("waitingSecret"),
          ...identity,
        });
        return { campaign: heartbeatResult.campaign };
      });
      sendJson(response, 200, heartbeatResult.snapshot);
      return;
    }

    if (url.pathname === "/api/multiplayer/waiting-room/seat" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => {
        assertRequestOwnsActiveTable(campaign, body);
        return { campaign: seatWaitingGuest(campaign, {
          waitingGuestId: body.waitingGuestId,
          partyMemberId: body.partyMemberId,
        }) };
      });
      sendJson(response, 200, {
        ...payload,
        multiplayer: createHostSnapshot(payload.campaign),
      });
      return;
    }

    if (url.pathname === "/api/multiplayer/join/approve" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => {
        assertRequestOwnsActiveTable(campaign, body);
        return { campaign: approveJoinRequest(campaign, body.connectionId, {
          hostIntegrationPrompt: body.hostIntegrationPrompt,
        }) };
      });
      sendJson(response, 200, {
        ...payload,
        multiplayer: createHostSnapshot(payload.campaign),
      });
      return;
    }

    if (url.pathname === "/api/multiplayer/join/deny" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => {
        assertRequestOwnsActiveTable(campaign, body);
        return { campaign: denyJoinRequest(campaign, body.connectionId) };
      });
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
        campaignId: url.searchParams.get("campaignId"),
        tableId: url.searchParams.get("tableId"),
        sessionId: url.searchParams.get("sessionId"),
      }));
      return;
    }

    if (url.pathname === "/api/multiplayer/settings" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => {
        assertRequestOwnsActiveTable(campaign, body);
        return { campaign: updateMultiplayerSettings(campaign, body) };
      });
      sendJson(response, 200, {
        ...payload,
        multiplayer: createHostSnapshot(payload.campaign),
      });
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
          campaignId: body.campaignId,
          tableId: body.tableId,
          sessionId: body.sessionId,
        }),
      });
      return;
    }

    if (url.pathname === "/api/multiplayer/choice-vote" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => ({
        campaign: submitGuestChoiceVote(campaign, body),
      }));
      sendJson(response, 200, {
        snapshot: createGuestSnapshot(payload.campaign, body.connectionId, {
          clientId: body.clientId,
          connectionSecret: body.connectionSecret,
          campaignId: body.campaignId,
          tableId: body.tableId,
          sessionId: body.sessionId,
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
          campaignId: body.campaignId,
          tableId: body.tableId,
          sessionId: body.sessionId,
        }),
      });
      return;
    }

    if (url.pathname === "/api/multiplayer/combat/join" && request.method === "POST") {
      const body = await readJsonBody(request);
      if (!body.connectionId && apiToken && request.headers["x-lorekeeper-api-token"] !== apiToken) {
        sendText(response, 401, "Host combat join requires local app authorization.");
        return;
      }
      const payload = await updateActiveCampaign(projectRoot, (campaign) => ({
        campaign: joinPartyMemberCombat(campaign, body),
      }));
      sendJson(response, 200, {
        ...payload,
        multiplayer: createHostSnapshot(payload.campaign),
        snapshot: body.connectionId
          ? createGuestSnapshot(payload.campaign, body.connectionId, {
            clientId: body.clientId,
            connectionSecret: body.connectionSecret,
            campaignId: body.campaignId,
            tableId: body.tableId,
            sessionId: body.sessionId,
          })
          : null,
      });
      return;
    }

    if (url.pathname === "/api/multiplayer/table-talk" && request.method === "POST") {
      const body = await readJsonBody(request);
      if (!body.connectionId && apiToken && request.headers["x-lorekeeper-api-token"] !== apiToken) {
        sendText(response, 401, "Host table talk requires local app authorization.");
        return;
      }
      const payload = await updateActiveCampaign(projectRoot, (campaign) => {
        assertRequestOwnsActiveTable(campaign, body);
        return { campaign: postTableTalk(campaign, body) };
      });
      sendJson(response, 200, {
        ...payload,
        multiplayer: createHostSnapshot(payload.campaign),
        snapshot: body.connectionId
          ? createGuestSnapshot(payload.campaign, body.connectionId, {
            clientId: body.clientId,
            connectionSecret: body.connectionSecret,
            campaignId: body.campaignId,
            tableId: body.tableId,
            sessionId: body.sessionId,
          })
          : null,
      });
      return;
    }

    if (url.pathname === "/api/multiplayer/disconnect" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => {
        assertRequestOwnsActiveTable(campaign, body);
        return { campaign: disconnectGuest(campaign, body.connectionId, {
          clientId: body.clientId,
          connectionSecret: body.connectionSecret,
          requireConnectionSecret: true,
        }) };
      });
      sendJson(response, 200, {
        ...payload,
        multiplayer: createHostSnapshot(payload.campaign),
      });
      return;
    }

    if (url.pathname === "/api/multiplayer/controller/revoke" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => {
        assertRequestOwnsActiveTable(campaign, body);
        return { campaign: revokeController(campaign, body.partyMemberId) };
      });
      sendJson(response, 200, {
        ...payload,
        multiplayer: createHostSnapshot(payload.campaign),
      });
      return;
    }

    if (url.pathname === "/api/multiplayer/controller/ai" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => {
        assertRequestOwnsActiveTable(campaign, body);
        return { campaign: returnToAiCompanion(campaign, body.partyMemberId) };
      });
      sendJson(response, 200, {
        ...payload,
        multiplayer: createHostSnapshot(payload.campaign),
      });
      return;
    }

    if (url.pathname === "/api/multiplayer/controller/host" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => {
        assertRequestOwnsActiveTable(campaign, body);
        return { campaign: setHostController(campaign, body.partyMemberId) };
      });
      sendJson(response, 200, {
        ...payload,
        multiplayer: createHostSnapshot(payload.campaign),
      });
      return;
    }

    if (url.pathname === "/api/multiplayer/pending/clear" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => {
        assertRequestOwnsActiveTable(campaign, body);
        return { campaign: clearPendingTurnInputs(campaign, body.inputIds, {
          disposition: body.disposition,
        }) };
      });
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

    // Review commit is still a route-level mutation because provider import and
    // manual review can both reach it. Future target: CanonReview service.
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

if (isDirectRun) {
  server.listen(port, bindHost, () => {
    console.log(`Lorekeeper local app: http://${bindHost === "127.0.0.1" ? "localhost" : bindHost}:${activeServerPort()}`);
  });
}

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

function activeServerPort() {
  const address = server.address();
  return address && typeof address === "object" ? address.port : port;
}

function publishPreTableLobby(input = {}) {
  const existingWaiting = preTableLobby?.waitingGuests ?? [];
  const title = compactLobbyLine(input.title || "New Campaign", 120);
  const draftId = compactLobbyLine(input.draftId || `draft-${slugifyLobby(title)}`, 140);
  const party = normalizePreTableParty(input.party ?? []);
  const joinableSeatIds = new Set(party.filter((member) => member.inviteIntent === "remote_player").map((member) => member.id));
  return {
    open: true,
    kind: "pre_table_lobby",
    protocolVersion: 1,
    revision: `draft-${Date.now().toString(36)}`,
    campaignId: draftId,
    title,
    summary: compactLobbyLine(input.premise || input.summary || "", 1200),
    startingLocation: compactLobbyLine(input.startingLocation || "", 180),
    tone: compactLobbyLine(input.tone || "", 180),
    localTable: {
      running: true,
      campaignId: draftId,
      tableId: `draft-table-${draftId}`,
      sessionId: `draft-session-${draftId}`,
      host: "0.0.0.0",
      port: activeServerPort(),
      lanAddress: firstLanAddress() || "127.0.0.1",
      startedAt: preTableLobby?.localTable?.startedAt || new Date().toISOString(),
    },
    party,
    waitingGuests: existingWaiting
      .filter((guest) => !guest.preferredPartyMemberId || joinableSeatIds.has(guest.preferredPartyMemberId))
      .map((guest) => ({ ...guest, lastSeenAt: guest.lastSeenAt || new Date().toISOString() })),
    updatedAt: new Date().toISOString(),
  };
}

function preTableLobbyHostSnapshot(lobby) {
  return {
    open: Boolean(lobby?.open),
    campaignId: lobby?.campaignId || "",
    campaignTitle: lobby?.title || "",
    guestLink: lobby?.localTable ? localGuestUrl(lobby.localTable) : "",
    localTable: lobby?.localTable ?? null,
    joinableSeats: preTableJoinableSeats(lobby),
    waitingGuests: (lobby?.waitingGuests ?? []).filter(isFreshPreTableGuest).map(publicPreTableWaitingGuest),
  };
}

function preTableLobbyGuestPreview(lobby) {
  return {
    protocolVersion: 1,
    kind: "pre_table_lobby",
    revision: lobby.revision,
    campaignId: lobby.campaignId,
    campaignTitle: lobby.title,
    campaignSummary: lobby.summary,
    localTable: lobby.localTable,
    invite: null,
    scene: {
      status: "pre_table",
      immediateSituation: lobby.summary || "The host is preparing a new table.",
      currentPlaceId: lobby.startingLocation || "",
    },
    party: lobby.party.map(publicPreTablePartyMember),
    joinableSeats: preTableJoinableSeats(lobby),
    people: [],
    places: lobby.startingLocation ? [{ id: "draft-starting-place", name: lobby.startingLocation, summary: "Starting place" }] : [],
    quests: [],
    recentMessages: [],
  };
}

function registerPreTableWaitingGuest(lobby, input = {}) {
  const displayName = compactLobbyLine(input.playerName || "Guest Player", 80);
  const clientId = compactLobbyLine(input.clientId || "", 120);
  const preferredPartyMemberId = normalizePreTableSeatId(lobby, input.preferredPartyMemberId);
  const existing = clientId
    ? lobby.waitingGuests.find((guest) => guest.clientId === clientId && (guest.status === "waiting" || guest.status === "seated"))
    : null;
  if (existing) {
    existing.displayName = displayName;
    existing.preferredPartyMemberId = preferredPartyMemberId || existing.preferredPartyMemberId || null;
    existing.lastSeenAt = new Date().toISOString();
    existing.secret = existing.secret || randomLobbyToken(24);
    return { waitingGuest: existing, waitingSecret: existing.secret };
  }
  const waitingGuest = {
    id: `draft-wait-${randomLobbyToken(10)}`,
    campaignId: lobby.campaignId,
    tableId: lobby.localTable.tableId,
    sessionId: lobby.localTable.sessionId,
    displayName,
    clientId,
    status: "waiting",
    secret: randomLobbyToken(24),
    requestedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    preferredPartyMemberId,
  };
  lobby.waitingGuests = [...(lobby.waitingGuests ?? []), waitingGuest];
  return { waitingGuest, waitingSecret: waitingGuest.secret };
}

function heartbeatPreTableWaitingGuest(lobby, input = {}) {
  const waitingGuest = lobby.waitingGuests.find((guest) => guest.id === input.waitingGuestId);
  if (!waitingGuest) {
    throwPublicRouteError("Waiting room session expired. Ask the host for the guest link, then click Ask To Join again.", 404);
  }
  if (waitingGuest.secret && compactLobbyLine(input.waitingSecret, 200) !== waitingGuest.secret) {
    throwPublicRouteError("Waiting room session expired. Ask the host for the guest link, then click Ask To Join again.", 403);
  }
  const clientId = compactLobbyLine(input.clientId || "", 120);
  if (waitingGuest.clientId && clientId && waitingGuest.clientId !== clientId) {
    throwPublicRouteError("This waiting room session belongs to a different device.", 403);
  }
  waitingGuest.lastSeenAt = new Date().toISOString();
  return {
    protocolVersion: 1,
    kind: "pre_table_lobby",
    revision: lobby.revision,
    campaignId: lobby.campaignId,
    campaignTitle: lobby.title,
    localTable: lobby.localTable,
    waitingGuest: publicPreTableWaitingGuest(waitingGuest),
    seated: false,
    reservedSeat: waitingGuest.status === "seated" && waitingGuest.partyMemberId
      ? preTableJoinableSeats(lobby).find((seat) => seat.id === waitingGuest.partyMemberId) ?? null
      : null,
    connection: null,
    connectionSecret: "",
    snapshot: null,
  };
}

function seatPreTableWaitingGuest(input = {}) {
  if (!preTableLobby?.open) {
    throwPublicRouteError("No Host New guest lobby is open.", 409);
  }
  const waitingGuestId = compactLobbyLine(input.waitingGuestId || "", 120);
  const partyMemberId = normalizePreTableSeatId(preTableLobby, input.partyMemberId);
  if (!partyMemberId) {
    throwPublicRouteError("Choose an open Remote Invite seat for this guest.", 409);
  }
  const waitingGuest = preTableLobby.waitingGuests.find((guest) => guest.id === waitingGuestId);
  if (!waitingGuest || waitingGuest.status !== "waiting") {
    throwPublicRouteError("That guest is no longer waiting. Ask them to click Ask To Join again.", 409);
  }
  if (!isFreshPreTableGuest(waitingGuest)) {
    throwPublicRouteError(`${waitingGuest.displayName || "That guest"} is no longer connected to the waiting room.`, 409);
  }
  waitingGuest.status = "seated";
  waitingGuest.partyMemberId = partyMemberId;
  waitingGuest.preferredPartyMemberId = partyMemberId;
  waitingGuest.seatedAt = new Date().toISOString();
  waitingGuest.lastSeenAt = new Date().toISOString();
  preTableLobby.updatedAt = new Date().toISOString();
  preTableLobby.revision = `draft-${Date.now().toString(36)}`;
  return preTableLobbyHostSnapshot(preTableLobby);
}

function adoptPreTableWaitingGuests(campaign) {
  if (!preTableLobby?.open || !preTableLobby.waitingGuests?.length) {
    preTableLobby = null;
    return campaign;
  }
  const localTable = campaign.multiplayer?.localTable ?? {};
  const draftGuests = preTableLobby.waitingGuests
    .filter(isFreshPreTableGuest)
    .map((guest) => ({
      ...guest,
      campaignId: campaign.id,
      tableId: localTable.tableId || guest.tableId,
      sessionId: localTable.sessionId || guest.sessionId,
      status: "waiting",
      lastSeenAt: new Date().toISOString(),
      connectionId: null,
      partyMemberId: null,
      reservedPartyMemberId: guest.status === "seated" ? guest.partyMemberId || guest.preferredPartyMemberId || null : null,
    }));
  const seatedGuests = draftGuests.filter((guest) => guest.reservedPartyMemberId);
  preTableLobby = null;
  let adoptedCampaign = {
    ...campaign,
    multiplayer: {
      ...(campaign.multiplayer ?? {}),
      waitingGuests: mergeWaitingGuests(campaign.multiplayer?.waitingGuests ?? [], draftGuests),
    },
    updatedAt: new Date().toISOString(),
  };
  for (const guest of seatedGuests) {
    if (!adoptedCampaign.party?.some((member) => member.id === guest.reservedPartyMemberId)) {
      continue;
    }
    try {
      adoptedCampaign = seatWaitingGuest(adoptedCampaign, {
        waitingGuestId: guest.id,
        partyMemberId: guest.reservedPartyMemberId,
      });
    } catch {
      // Keep the guest waiting if the final party changed before launch.
    }
  }
  return adoptedCampaign;
}

function mergeWaitingGuests(existing = [], incoming = []) {
  const byId = new Map(existing.map((guest) => [guest.id, guest]));
  for (const guest of incoming) {
    byId.set(guest.id, guest);
  }
  return [...byId.values()];
}

function normalizePreTableParty(party = []) {
  return (Array.isArray(party) ? party : [])
    .map((member) => {
      const name = compactLobbyLine(member.name || "", 80);
      if (!name) return null;
      const controllerKind = compactLobbyLine(member.controllerKind || "ai_companion", 80);
      const inviteIntent = controllerKind === "remote_invite" || member.inviteIntent === "remote_player" ? "remote_player" : "";
      return {
        id: compactLobbyLine(member.id || `party-${slugifyLobby(name)}`, 120),
        name,
        ancestryClass: compactLobbyLine([member.ancestry, member.characterClass].filter(Boolean).join(" ") || member.ancestryClass || "adventurer", 160),
        level: member.level || "",
        playerRole: inviteIntent === "remote_player" ? "Remote invite seat" : controllerKind === "host" ? "Host-controlled party member" : "AI party companion",
        controllerKind: inviteIntent === "remote_player" ? "unassigned" : controllerKind,
        inviteIntent,
        summary: compactLobbyLine(member.concept || member.summary || "", 300),
      };
    })
    .filter(Boolean);
}

function preTableJoinableSeats(lobby) {
  return (lobby?.party ?? [])
    .filter((member) => member.inviteIntent === "remote_player")
    .map(publicPreTablePartyMember);
}

function normalizePreTableSeatId(lobby, preferredPartyMemberId) {
  const requested = compactLobbyLine(preferredPartyMemberId || "", 120);
  if (!requested) return null;
  return preTableJoinableSeats(lobby).some((seat) => seat.id === requested) ? requested : null;
}

function publicPreTablePartyMember(member) {
  return {
    id: member.id,
    name: member.name,
    ancestryClass: member.ancestryClass,
    level: member.level,
    playerRole: member.playerRole,
    summary: member.summary,
  };
}

function publicPreTableWaitingGuest(guest) {
  return {
    id: guest.id,
    displayName: guest.displayName,
    status: guest.status,
    preferredPartyMemberId: guest.preferredPartyMemberId ?? null,
    requestedAt: guest.requestedAt,
    lastSeenAt: guest.lastSeenAt,
  };
}

function isFreshPreTableGuest(guest) {
  const seenAt = Date.parse(guest?.lastSeenAt || guest?.requestedAt || "");
  return Number.isFinite(seenAt) && Date.now() - seenAt <= 20000;
}

function localGuestUrl(table = {}) {
  const host = table.lanAddress || "127.0.0.1";
  const localPort = table.port || activeServerPort();
  return localPort ? `http://${host}:${localPort}/guest` : `http://${host}/guest`;
}

function compactLobbyLine(value, limit = 240) {
  const compact = String(value ?? "").replace(/\s+/g, " ").trim();
  return compact.length <= limit ? compact : `${compact.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function randomLobbyToken(size = 12) {
  return randomBytes(Math.ceil(size * 0.75)).toString("base64url").slice(0, size);
}

function slugifyLobby(value) {
  return String(value || "table")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "table";
}

async function buildDiagnosticsBundle() {
  const active = await loadActiveCampaign(projectRoot).catch((error) => ({
    error: error instanceof Error ? error.message : "Active campaign load failed.",
  }));
  const campaign = active.campaign ?? null;
  const recentMessages = (campaign?.sessionLog?.messages ?? []).slice(-40);
  const recentReviews = (campaign?.reviewLog ?? []).slice(-8);
  const recentErrors = active.sqlitePath
    ? await readCampaignErrorsFromSqliteFile(active.sqlitePath, { limit: 80 }).catch((error) => [{
        severity: "error",
        source: "diagnostics",
        eventType: "error_log_read_failed",
        message: error instanceof Error ? error.message : "Unable to read campaign errors.",
        createdAt: new Date().toISOString(),
        data: {},
      }])
    : [];
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
    debugSnapshot: buildTableDebugSnapshot({
      campaign,
      multiplayer: campaign?.multiplayer,
      providerActivity: {
        state: "server_snapshot",
        text: "Server diagnostics snapshot; renderer may have newer provider activity.",
      },
      recentErrors,
    }),
    recentMessages,
    recentReviews,
    recentErrors,
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
  const active = await loadActiveCampaign(projectRoot);
  const { campaign } = active;
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
    ...securityHeaders,
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
    let ollamaContextStored = false;
    if (Array.isArray(result.ollamaContext) && result.ollamaContext.length) {
      let shouldMarkStored = false;
      try {
        await updateActiveCampaign(projectRoot, (latestCampaign) => {
          if (latestCampaign.id !== campaign.id) {
            return latestCampaign;
          }
          shouldMarkStored = true;
          return updateCampaignOllamaContext(latestCampaign, {
            settings,
            context: result.ollamaContext,
            tokenCounts: result.tokenCounts,
          });
        });
        ollamaContextStored = shouldMarkStored;
      } catch (error) {
        console.warn("Unable to store Ollama context cache:", error instanceof Error ? error.message : error);
        await logCampaignError({
          campaignId: campaign.id,
          severity: "warning",
          source: "provider",
          eventType: "ollama_context_store_failed",
          message: error instanceof Error ? error.message : "Unable to store Ollama context cache.",
          stack: error instanceof Error ? error.stack : "",
          providerId: result.providerId,
          model: result.model,
          data: {
            requestId: result.requestId,
            tokenCounts: result.tokenCounts,
          },
        });
      }
    }

    if (result.parseError || result.repairAttempt || /empty table response/i.test(result.text || "")) {
      await logCampaignError({
        campaignId: campaign.id,
        severity: result.parseError ? "error" : "warning",
        source: "provider",
        eventType: result.parseError ? "provider_response_parse_error" : "provider_response_repaired_or_suspicious",
        message: result.parseError || result.repairAttempt?.finalError || "Provider response needed repair or produced suspicious fallback text.",
        requestId: result.requestId,
        providerId: result.providerId,
        model: result.model,
        data: {
          validationErrors: result.validationErrors,
          validationWarnings: result.validationWarnings,
          repairAttempt: result.repairAttempt,
          recovery: result.recovery,
          rawTextPreview: String(result.rawText || "").slice(0, 4000),
          renderedTextPreview: String(result.text || "").slice(0, 1000),
        },
      });
    }

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
        ollamaContextUsed: Boolean(result.ollamaContextUsed),
        ollamaContextStored,
      },
    });
  } catch (error) {
    await logCampaignError({
      campaignId: campaign.id,
      severity: "error",
      source: "provider",
      eventType: "provider_generation_failed",
      message: error instanceof Error ? error.message : "Provider generation failed.",
      stack: error instanceof Error ? error.stack : "",
      providerId: settings.preferredProvider,
      model: settings.selectedModel,
      data: {
        fastMode: settings.fastMode,
        timeoutMs: settings.generationTimeoutMs,
      },
    });
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
    ...securityHeaders,
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

function updateCampaignPlayerNotes(campaign, patch = {}) {
  const expectedCampaignId = String(patch.campaignId || "").trim();
  if (expectedCampaignId && expectedCampaignId !== campaign.id) {
    const error = new Error("Player notes campaign mismatch.");
    error.statusCode = 409;
    error.publicMessage = "These notes belong to a different campaign. Reload and try again.";
    throw error;
  }

  return {
    campaign: {
      ...campaign,
      playerNotes: normalizePlayerNotes({
        ...(patch.notes ?? patch),
        updatedAt: new Date().toISOString(),
      }),
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
    ...securityHeaders,
    ...noCacheHeaders,
  });
  createReadStream(filePath).pipe(response);
}

function sendText(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    ...securityHeaders,
    ...corsHeaders,
    ...noCacheHeaders,
  });
  response.end(body);
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    ...securityHeaders,
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
  logCampaignError({
    severity: statusCode >= 500 ? "error" : "warning",
    source: "api",
    eventType: "http_error",
    message: error instanceof Error ? error.message : message,
    stack: error instanceof Error ? error.stack : "",
    data: {
      statusCode,
      publicMessage: message,
    },
  });
  sendText(response, statusCode, message);
}

async function logCampaignError(event) {
  try {
    await appendActiveCampaignError(projectRoot, event);
  } catch (error) {
    console.warn("Unable to persist campaign error:", error instanceof Error ? error.message : error);
  }
}

function isAuthorizedRequest(request, url) {
  return isAuthorizedRequestForToken(apiToken, {
    pathname: url.pathname,
    method: request.method,
    headers: request.headers,
    searchParams: url.searchParams,
  });
}

export function isAuthorizedRequestForToken(token, { pathname, method = "GET", headers = {}, searchParams = new URLSearchParams() } = {}) {
  const expectedToken = String(token || "");
  if (!expectedToken) {
    return true;
  }
  const headerToken = headers["x-lorekeeper-api-token"];
  const queryToken = typeof searchParams.get === "function" ? searchParams.get("lkToken") : "";
  if (pathname === "/local-asset") {
    return headerToken === expectedToken || queryToken === expectedToken;
  }
  if (!isProtectedApiPath(pathname, method)) {
    return true;
  }
  return headerToken === expectedToken;
}

export function isProtectedApiPath(pathname, method) {
  if (!pathname.startsWith("/api/")) {
    return false;
  }
  if (pathname === "/api/runtime") {
    return false;
  }
  if (pathname === "/api/multiplayer/join"
    || pathname === "/api/multiplayer/join-preview"
    || pathname === "/api/multiplayer/waiting-room/register"
    || pathname === "/api/multiplayer/waiting-room/status"
    || pathname === "/api/multiplayer/guest-snapshot"
    || pathname === "/api/multiplayer/action"
    || pathname === "/api/multiplayer/choice-vote"
    || pathname === "/api/multiplayer/pass"
    || pathname === "/api/multiplayer/disconnect"
    || pathname === "/api/multiplayer/combat/join"
    || pathname === "/api/multiplayer/table-talk") {
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

export function requiresCampaignPin(pathname) {
  return new Set([
    "/api/campaign/record",
    "/api/campaign/delete",
    "/api/campaign/hide",
    "/api/campaign/message",
    "/api/campaign/message/update",
    "/api/campaign/player-notes",
    "/api/provider/conversation",
    "/api/provider/settings",
    "/api/provider/generate-turn",
    "/api/multiplayer/start",
    "/api/multiplayer/stop",
    "/api/multiplayer/invite",
    "/api/multiplayer/invite-character",
    "/api/multiplayer/invite/revoke",
    "/api/multiplayer/join/approve",
    "/api/multiplayer/join/deny",
    "/api/multiplayer/waiting-room/seat",
    "/api/multiplayer/controller/revoke",
    "/api/multiplayer/controller/ai",
    "/api/multiplayer/controller/host",
    "/api/multiplayer/pending/clear",
    "/api/pretable-lobby/adopt-active",
    "/api/multiplayer/combat/join",
    "/api/multiplayer/table-talk",
    "/api/review/commit",
  ]).has(pathname);
}

function assertRequestOwnsActiveTable(campaign, identity = {}) {
  const expectedCampaignId = compactIdentity(identity.campaignId);
  if (expectedCampaignId && expectedCampaignId !== campaign.id) {
    throwPublicRouteError("That request belongs to a different campaign. Reload the table and try again.", 409);
  }

  const localTable = campaign.multiplayer?.localTable ?? {};
  const expectedTableId = compactIdentity(identity.tableId);
  if (expectedTableId && expectedTableId !== compactIdentity(localTable.tableId)) {
    throwPublicRouteError("That request belongs to a different table. Reload the table and try again.", 409);
  }

  const expectedSessionId = compactIdentity(identity.sessionId || identity.tableSessionId);
  if (expectedSessionId && expectedSessionId !== compactIdentity(localTable.sessionId)) {
    throwPublicRouteError("That table session is no longer active. Ask the host for a fresh link.", 409);
  }
}

function compactIdentity(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function throwPublicRouteError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicMessage = message;
  throw error;
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
