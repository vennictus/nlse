import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { sampleStore } from "./helpers.js";

describe("api", () => {
  it("returns stats and search shapes", async () => {
    const app = buildApp(sampleStore());
    const stats = await app.inject({ method: "GET", url: "/stats" });
    expect(stats.statusCode).toBe(200);
    expect(stats.json()).toMatchObject({ cars: 3 });

    const search = await app.inject({ method: "POST", url: "/search", payload: { query: "comfortable german sedan under $50k", trace: true } });
    expect(search.statusCode).toBe(200);
    const body = search.json();
    expect(body.queryId).toMatch(/^NLSE-/);
    expect(body.results[0].logicalPlan.queryId).toBe(body.queryId);
    await app.close();
  });
});
