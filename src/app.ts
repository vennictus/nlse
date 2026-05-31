import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import Fastify from "fastify";
import { z } from "zod";
import { executeSearch } from "./execution.js";
import { parseIntent } from "./intent.js";
import { interpretIntent } from "./interpretation.js";
import { createLogicalPlan } from "./planner.js";
import type { CarStore } from "./types.js";

const querySchema = z.object({ query: z.string().min(1), limit: z.number().int().positive().max(50).optional(), trace: z.boolean().optional() });

export function buildApp(store: CarStore) {
  const app = Fastify({ logger: true });

  app.get("/", async (_request, reply) => {
    reply.type("text/html");
    return readFile(join(process.cwd(), "public", "index.html"), "utf8");
  });
  app.get("/app.js", async (_request, reply) => {
    reply.type("application/javascript");
    return readFile(join(process.cwd(), "public", "app.js"), "utf8");
  });
  app.get("/styles.css", async (_request, reply) => {
    reply.type(contentType("/styles.css"));
    return readFile(join(process.cwd(), "public", "styles.css"), "utf8");
  });
  app.get("/health", async () => ({ ok: true }));
  app.get("/stats", async () => stats(store));
  app.post("/intent", async (request) => {
    const input = querySchema.pick({ query: true, limit: true }).parse(request.body);
    const intent = await parseIntent(input.query, input.limit);
    return { intent, interpretation: interpretIntent(intent) };
  });
  app.post("/plan", async (request) => {
    const input = querySchema.pick({ query: true, limit: true }).parse(request.body);
    const intent = await parseIntent(input.query, input.limit);
    return createLogicalPlan(intent, store);
  });
  app.post("/search", async (request) => {
    const input = querySchema.parse(request.body);
    const intent = await parseIntent(input.query, input.limit);
    const plan = createLogicalPlan(intent, store);
    const results = executeSearch(store, input.query, intent, plan);
    return {
      queryId: plan.queryId,
      intent,
      interpretation: interpretIntent(intent),
      logicalPlan: plan,
      executionTrace: input.trace ? results[0]?.executionTrace ?? [] : undefined,
      results: results.map((result) => ({ ...result, executionTrace: input.trace ? result.executionTrace : [] }))
    };
  });
  return app;
}

function contentType(path: string): string {
  if (extname(path) === ".css") return "text/css";
  return "text/plain";
}

export function stats(store: CarStore) {
  return {
    cars: store.cars.length,
    brands: store.index.byBrand.size,
    countries: store.index.byCountry.size,
    bodyTypes: store.index.byBodyType.size,
    tags: store.index.byTag.size
  };
}
