/**
 * Minimal node:http server (no frameworks): static client + JSON API over
 * GameSession. Pre-reveal endpoints expose labels/texts only (§33).
 */

import { randomUUID } from "node:crypto";
import { defaultWebLimits } from "../config/tunables.js";
import { Challenges, HttpError } from "./challenges.js";
import { limitedProvider } from "./limits.js";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { MachineGenerationError } from "../engine/machines.js";
import { listRounds, roundReport } from "../lab/report.js";
import {
  createPrompt,
  editPrompt,
  listStudioPrompts,
  listStudioRuns,
  runStudioGeneration,
  setPromptActive,
} from "../lab/studio.js";
import { GameSession, type GameEnv } from "./session.js";

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(payload);
}

async function readBody(req: http.IncomingMessage, maxBytes = defaultWebLimits.maxBodyBytes): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new HttpError(413, "That request is too large.");
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.trim().length === 0) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new HttpError(400, "Invalid request body."); }
}

function serveStatic(res: http.ServerResponse, relPath: string): void {
  const file = path.join(PUBLIC_DIR, relPath);
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  res.end(fs.readFileSync(file));
}

/** Creates the game server; the caller listens and prints the URL. */
export function createGameServer(input: GameEnv, options: {
  developerTools?: boolean; secureCookies?: boolean; limits?: Partial<typeof defaultWebLimits>;
} = {}): http.Server {
  const limits = { ...defaultWebLimits, ...options.limits };
  const env = { ...input, deadlineGraceMs: limits.deadlineGraceMs, provider: limitedProvider(input.provider, limits.maxConcurrentModelCalls, limits.maxQueuedModelCalls) };
  const session = new GameSession(env);
  const challenges = new Challenges(env);
  function ownRound(id: string, playerId: string) {
    if (!env.store.has("round", id) || env.store.get("round", id).humanContestantId !== playerId) throw new HttpError(404, "Round not found in this browser.");
  }
  function allowGeneration(playerId: string) {
    const since = env.clock() - 3_600_000;
    const recent = env.store.where("round", r => Date.parse(r.createdAt) >= since);
    const studio = env.store.where("studioRun", r => Date.parse(r.createdAt) >= since);
    if (recent.length + studio.length >= limits.maxRoundsPerHour || recent.filter(r => r.humanContestantId === playerId).length >= limits.maxPlayerRoundsPerHour) {
      throw new HttpError(429, "The playtest limit has been reached. Try again in an hour.");
    }
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const route = `${req.method} ${url.pathname}`;

    try {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "same-origin");
      res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      if (req.method === "POST") {
        const origin = req.headers.origin;
        if ((origin && new URL(origin).host !== req.headers.host) || req.headers["sec-fetch-site"] === "cross-site") throw new HttpError(403, "Open the game before making changes.");
        if (!req.headers["content-type"]?.startsWith("application/json")) throw new HttpError(415, "Use a JSON request.");
        if (Number(req.headers["content-length"] ?? 0) > limits.maxBodyBytes) throw new HttpError(413, "That request is too large.");
      }
      const developerPath = /^\/(?:api\/)?(?:lab|studio)(?:[/.]|$)/.test(url.pathname);
      if (developerPath && !options.developerTools) throw new HttpError(404, "Not found.");
      let credential = req.headers.cookie?.split(";").map(c => c.trim()).find(c => c.startsWith("slop_session="))?.slice(13);
      if (!credential || !env.store.has("playerSession", credential)) {
        credential = randomUUID();
        env.store.insert("playerSession", { id: credential, humanId: randomUUID(), createdAt: new Date(env.clock()).toISOString() });
        res.setHeader("Set-Cookie", `slop_session=${credential}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${options.secureCookies || "encrypted" in req.socket ? "; Secure" : ""}`);
      }
      const playerId = env.store.get("playerSession", credential).humanId;
      if (req.method === "GET" && /^\/(challenge|results)\/[^/]+$/.test(url.pathname)) return serveStatic(res, "index.html");
      const challengeRoute = url.pathname.match(/^\/api\/challenge\/([^/]+)(?:\/(lock|reveal|owner|share))?$/);
      if (challengeRoute) {
        const id = challengeRoute[1]!;
        const action = challengeRoute[2];
        if (req.method === "GET" && !action) return json(res, 200, challenges.open(id, playerId));
        if (req.method === "GET" && action === "owner") return json(res, 200, challenges.owner(id, playerId));
        if (req.method === "POST" && action === "lock") {
          const body = await readBody(req, limits.maxBodyBytes);
          return json(res, 200, challenges.lock(id, playerId, body.detection, body.taste));
        }
        if (req.method === "POST" && action === "reveal") return json(res, 200, challenges.reveal(id, playerId));
        if (req.method === "POST" && action === "share") {
          const challenge = challenges.get(id);
          challenges.event(challenge.ownerId === playerId ? "creator_share_action" : "recipient_share_action", id, playerId, "share");
          return json(res, 200, { ok: true });
        }
      }
      const roundRead = url.pathname.match(/^\/api\/round\/([^/]+)$/);
      if (req.method === "GET" && roundRead) {
        ownRound(roundRead[1]!, playerId);
        return json(res, 200, session.read(roundRead[1]!));
      }
      if (route === "GET /api/stakes") {
        // Public tunables only: what each length tier could earn. No round or provenance data.
        const { riskTiers, maxResponseWords, scoring } = env.tunables;
        return json(res, 200, { riskTiers, deceptionBase: scoring.deceptionBase, maxWords: maxResponseWords });
      }
      if (route === "GET /api/me") {
        return json(res, 200, {
          rounds: env.store.where("round", r => r.humanContestantId === playerId).map(r => ({ roundId: r.id, phase: r.phase })),
          challenges: env.store.where("challenge", c => c.ownerId === playerId).map(c => ({ challengeId: c.id, url: `/challenge/${c.id}`, ownerUrl: `/results/${c.id}` })),
        });
      }
      const shareRound = url.pathname.match(/^\/api\/round\/([^/]+)\/challenge$/);
      if (req.method === "POST" && shareRound) return json(res, 200, challenges.create(shareRound[1]!, playerId));
      if (route === "GET /") return serveStatic(res, "index.html");
      if (route === "GET /lab") return serveStatic(res, "lab.html");
      if (route === "GET /studio") return serveStatic(res, "studio.html");
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

      // Studio (developer-only authoring/curation surface, D51/D52).
      if (route === "GET /api/studio/prompts") {
        return json(res, 200, listStudioPrompts(env.store));
      }
      if (route === "POST /api/studio/prompts") {
        const body = await readBody(req, limits.maxBodyBytes);
        if (typeof body.text !== "string") return json(res, 400, { error: "text required" });
        return json(res, 200, createPrompt(env.store, env.clock, env.idGen, body.text));
      }
      const studioPromptMatch = url.pathname.match(/^\/api\/studio\/prompt\/([^/]+)\/(edit|active)$/);
      if (req.method === "POST" && studioPromptMatch) {
        const [, promptId, action] = studioPromptMatch;
        const body = await readBody(req, limits.maxBodyBytes);
        if (action === "edit") {
          if (typeof body.text !== "string") return json(res, 400, { error: "text required" });
          return json(res, 200, editPrompt(env.store, env.clock, env.idGen, promptId!, body.text));
        }
        if (typeof body.active !== "boolean") return json(res, 400, { error: "active required" });
        return json(res, 200, setPromptActive(env.store, env.clock, env.idGen, promptId!, body.active));
      }
      if (route === "POST /api/studio/generate") {
        allowGeneration(playerId);
        const body = await readBody(req, limits.maxBodyBytes);
        if (typeof body.promptId !== "string") return json(res, 400, { error: "promptId required" });
        const deps = {
          store: env.store,
          provider: env.provider,
          tunables: env.tunables,
          clock: env.clock,
          idGen: env.idGen,
        };
        return json(res, 200, await runStudioGeneration(deps, body.promptId));
      }
      if (route === "GET /api/studio/runs") {
        return json(res, 200, listStudioRuns(env.store));
      }

      if (route === "POST /api/round") {
        const body = await readBody(req, limits.maxBodyBytes);
        const source = typeof body.sourceChallengeId === "string" ? body.sourceChallengeId : undefined;
        if (source) challenges.get(source);
        const requestId = typeof body.requestId === "string" && body.requestId.length <= 100 ? body.requestId : undefined;
        if (requestId) {
          const existing = env.store.where("round", r => r.humanContestantId === playerId && r.startRequestId === requestId)[0];
          if (existing) return json(res, 200, { ...session.read(existing.id), resumed: true });
        }
        allowGeneration(playerId);
        const started = session.startRound(playerId, source, requestId);
        if (source) challenges.event("new_round_started", source, playerId, started.roundId, { roundId: started.roundId });
        return json(res, 200, started);
      }

      const roundMatch = url.pathname.match(/^\/api\/round\/([^/]+)\/(typing|submit|taste)$/);
      if (req.method === "POST" && roundMatch) {
        const [, roundId, action] = roundMatch;
        ownRound(roundId!, playerId);
        if (action === "typing") {
          session.typingStarted(roundId!);
          return json(res, 200, { ok: true });
        }
        const body = await readBody(req, limits.maxBodyBytes);
        if (action === "submit") {
          const text = typeof body.text === "string" ? body.text : null;
          return json(res, 200, await session.submit(roundId!, text));
        }
        if (action === "taste") {
          if (typeof body.label !== "string") return json(res, 400, { error: "label required" });
          const result = await session.castTaste(roundId!, body.label);
          const round = env.store.get("round", roundId!);
          if (round.sourceChallengeId) challenges.event("new_round_completed", round.sourceChallengeId, playerId, round.id, { roundId: round.id });
          return json(res, 200, result);
        }
      }

      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = error instanceof HttpError ? error.status : error instanceof MachineGenerationError ? 502 : /already locked|Cannot |eligible|cap is/.test(message) ? 409 : 500;
      json(res, status, { error: message });
    }
  });
}
