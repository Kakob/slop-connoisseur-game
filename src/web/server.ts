/**
 * Minimal node:http server (no frameworks): static client + JSON API over
 * GameSession. Pre-reveal endpoints expose labels/texts only (§33).
 */

import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { MachineGenerationError } from "../engine/machines.js";
import { listRounds, roundReport } from "../lab/report.js";
import { GameSession, type GameEnv } from "./session.js";

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(payload);
}

async function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.trim().length === 0) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function serveStatic(res: http.ServerResponse, relPath: string): void {
  const file = path.join(PUBLIC_DIR, relPath);
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file)) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  res.end(fs.readFileSync(file));
}

/** Creates the game server; the caller listens and prints the URL. */
export function createGameServer(env: GameEnv): http.Server {
  const session = new GameSession(env);

  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const route = `${req.method} ${url.pathname}`;

    try {
      if (route === "GET /") return serveStatic(res, "index.html");
      if (route === "GET /lab") return serveStatic(res, "lab.html");
      if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
        return serveStatic(res, url.pathname.slice(1));
      }

      // Slop Lab (developer-only debug surface, §28).
      if (route === "GET /api/lab/rounds") {
        return json(res, 200, listRounds(env.store));
      }
      const labMatch = url.pathname.match(/^\/api\/lab\/round\/([^/]+)$/);
      if (req.method === "GET" && labMatch) {
        return json(res, 200, roundReport(env.store, labMatch[1]!, env.tunables));
      }

      if (route === "POST /api/round") {
        return json(res, 200, session.startRound());
      }

      const roundMatch = url.pathname.match(/^\/api\/round\/([^/]+)\/(typing|submit|taste)$/);
      if (req.method === "POST" && roundMatch) {
        const [, roundId, action] = roundMatch;
        if (action === "typing") {
          session.typingStarted(roundId!);
          return json(res, 200, { ok: true });
        }
        const body = await readBody(req);
        if (action === "submit") {
          const text = typeof body.text === "string" ? body.text : null;
          return json(res, 200, await session.submit(roundId!, text));
        }
        if (action === "taste") {
          if (typeof body.label !== "string") return json(res, 400, { error: "label required" });
          return json(res, 200, await session.castTaste(roundId!, body.label));
        }
      }

      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = error instanceof MachineGenerationError ? 502 : 500;
      json(res, status, { error: message });
    }
  });
}
