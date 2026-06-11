import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createNewActiveCampaign,
  listCampaigns,
  loadActiveCampaign,
  loadImportedCampaign,
  hideCampaign,
  selectCampaign,
  updateActiveCampaign,
} from "../src/storage/campaign-repository.js";
import { addChatMessage } from "../src/campaign-state/chat-history.js";
import { addCampaignRecord } from "../src/campaign-state/direct-records.js";
import { upsertProviderConversation } from "../src/campaign-state/provider-conversations.js";
import { commitReviewBatch } from "../src/storage/review-commit.js";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT ?? process.argv[2] ?? 4173);

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

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/") {
      await serveFile(path.join(projectRoot, "app", "index.html"), response);
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
      });
      sendJson(response, 200, payload);
      return;
    }

    if (url.pathname === "/api/campaign/hide" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await hideCampaign(projectRoot, {
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

    if (url.pathname === "/api/provider/conversation" && request.method === "POST") {
      const body = await readJsonBody(request);
      const payload = await updateActiveCampaign(projectRoot, (campaign) => upsertProviderConversation(campaign, body));
      sendJson(response, 200, payload);
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

    const resolved = path.resolve(projectRoot, decodeURIComponent(url.pathname.slice(1)));
    if (!resolved.startsWith(projectRoot)) {
      sendText(response, 403, "Forbidden");
      return;
    }

    await serveFile(resolved, response);
  } catch (error) {
    sendText(response, 500, error instanceof Error ? error.message : "Server error");
  }
});

server.listen(port, () => {
  console.log(`Lorekeeper local app: http://localhost:${port}`);
});

async function serveLocalAsset(url, response) {
  const assetPath = url.searchParams.get("path");
  const assetName = url.searchParams.get("name");

  if (assetPath) {
    await serveFile(path.resolve(assetPath), response);
    return;
  }

  if (assetName) {
    const bundlePath = path.join(projectRoot, "data", "imports", "veil-of-the-towers.bundle.json");
    if (!existsSync(bundlePath)) {
      sendText(response, 404, "No campaign bundle found");
      return;
    }

    const bundle = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(bundlePath, "utf8")));
    const match = bundle.campaign.assets.find((asset) => asset.name === assetName);
    if (!match) {
      sendText(response, 404, "Asset not found");
      return;
    }

    await serveFile(match.path, response);
    return;
  }

  sendText(response, 400, "Missing asset path");
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
    ...noCacheHeaders,
  });
  response.end(body);
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    ...noCacheHeaders,
  });
  response.end(JSON.stringify(body, null, 2));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}
