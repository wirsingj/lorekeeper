import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadActiveCampaign } from "../src/storage/campaign-repository.js";
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
      });
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
  });
  createReadStream(filePath).pipe(response);
}

function sendText(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
  });
  response.end(body);
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
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
