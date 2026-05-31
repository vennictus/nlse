import { describe, expect, it } from "vitest";
import { executeSearch } from "../src/execution.js";
import { localParseIntent } from "../src/intent.js";
import { createLogicalPlan } from "../src/planner.js";
import { sampleStore } from "./helpers.js";

describe("search pipeline", () => {
  it("rewrites vague concepts into tags", () => {
    const intent = localParseIntent("fun commuter car under $50k");
    expect(intent.tags?.value).toEqual(expect.arrayContaining(["performance", "enthusiast", "daily-driver", "economical"]));
    expect(intent.price?.max?.value).toBe(50000);
  });

  it("creates stable logical plans with rank and take", () => {
    const store = sampleStore();
    const intent = localParseIntent("comfortable german sedan under $50k");
    const a = createLogicalPlan(intent, store);
    const b = createLogicalPlan(intent, store);
    expect(a.queryId).toBe(b.queryId);
    expect(a.operators.at(-2)?.type).toBe("RankOperator");
    expect(a.operators.at(-1)?.type).toBe("TakeOperator");
    expect(a.estimates).toHaveLength(a.operators.length);
  });

  it("executes hard filters and includes traces and explanations", () => {
    const store = sampleStore();
    const query = "comfortable german sedan under $50k clean history";
    const intent = localParseIntent(query);
    const plan = createLogicalPlan(intent, store);
    const results = executeSearch(store, query, intent, plan);
    expect(results).toHaveLength(1);
    expect(results[0].car.manufacturer).toBe("BMW");
    expect(results[0].car.price).toBeLessThanOrEqual(50000);
    expect(results[0].executionTrace.length).toBe(plan.operators.length);
    expect(results[0].explanationBullets.join(" ")).toContain("Matched");
  });

  it("sort modes override primary ordering", () => {
    const store = sampleStore();
    const intent = localParseIntent("top 2 cheapest daily car");
    const plan = createLogicalPlan(intent, store);
    const results = executeSearch(store, intent.originalQuery, intent, plan);
    expect(results[0].car.price).toBeLessThanOrEqual(results[1].car.price ?? Number.MAX_SAFE_INTEGER);
  });
});
