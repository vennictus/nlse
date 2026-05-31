import "dotenv/config";
import { Command } from "commander";
import { executeSearch } from "./execution.js";
import { loadCars } from "./ingest.js";
import { parseIntent } from "./intent.js";
import { interpretIntent } from "./interpretation.js";
import { createLogicalPlan, formatPlan } from "./planner.js";
import { stats } from "./app.js";

const program = new Command();
program.name("car-nlse");

async function store() {
  return loadCars(process.env.CARS_CSV ?? "cars.csv");
}

program.command("intent <query...>").action(async (parts: string[]) => {
  const intent = await parseIntent(parts.join(" "));
  console.log(JSON.stringify({ intent, interpretation: interpretIntent(intent) }, null, 2));
});

program.command("explain-query <query...>").action(async (parts: string[]) => {
  const s = await store();
  const intent = await parseIntent(parts.join(" "));
  console.log(formatPlan(createLogicalPlan(intent, s)));
});

program.command("trace <query...>").action(async (parts: string[]) => {
  const s = await store();
  const query = parts.join(" ");
  const intent = await parseIntent(query);
  const plan = createLogicalPlan(intent, s);
  const results = executeSearch(s, query, intent, plan);
  console.log(`TRACE: ${plan.queryId}`);
  for (const step of results[0]?.executionTrace ?? []) console.log(`\n${step.operator}\n${step.before} -> ${step.after}`);
});

program.command("search <query...>").action(async (parts: string[]) => {
  const s = await store();
  const query = parts.join(" ");
  const intent = await parseIntent(query);
  const plan = createLogicalPlan(intent, s);
  const results = executeSearch(s, query, intent, plan);
  console.log(`QUERY ${plan.queryId}`);
  for (const result of results) {
    const c = result.car;
    console.log(`${result.score.toFixed(1)} | ${c.year ?? "?"} ${c.manufacturer ?? "?"} ${c.model ?? "?"} | $${c.price ?? "?"} | ${c.mileage ?? "?"} mi`);
    console.log(`  ${result.explanationBullets.slice(0, 3).join("; ")}`);
  }
});

program.command("graph <entity>").action(async (entity: string) => {
  const s = await store();
  const keyCandidates = [`Brand:${entity}`, `Country:${entity}`, `BodyType:${entity}`, `Tag:${entity}`];
  for (const key of keyCandidates) {
    const ids = s.graph.entityEdges.get(key);
    if (ids?.length) {
      console.log(`${key} -> ${ids.length} cars`);
      for (const id of ids.slice(0, 10)) {
        const c = s.byId.get(id)!;
        console.log(`${id}: ${c.year ?? "?"} ${c.manufacturer ?? "?"} ${c.model ?? "?"}`);
      }
      return;
    }
  }
  console.log(`No graph relationships found for ${entity}.`);
});

program.command("stats").action(async () => {
  console.log(JSON.stringify(stats(await store()), null, 2));
});

await program.parseAsync();
