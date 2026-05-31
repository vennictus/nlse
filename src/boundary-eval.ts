import { executeSearch } from "./execution.js";
import { loadCars } from "./ingest.js";
import { parseIntent } from "./intent.js";
import { createLogicalPlan, formatPlan } from "./planner.js";

const queries = [
  "I want something fun for weekend drives, manual if possible, not German, preferably naturally aspirated, under $40k and not too old.",
  "Give me the fastest car possible under $15k with amazing fuel economy.",
  "Something like a Porsche Cayman but cheaper and more reliable.",
  "I drive 100 miles every day and hate visiting mechanics.",
  "Luxury sedan, but no BMW, Audi, Mercedes, and definitely not electric.",
  "I don't care about speed. I care about comfort more than anything.",
  "Something that won't embarrass me pulling up to a client meeting.",
  "I'd prefer Japanese. If not Japanese then Korean. Absolutely no American cars.",
  "Find me a comfortable daily driver that can still be fun on weekends, gets decent mileage, and won't kill me on maintenance.",
  "Explain exactly how you interpreted my query and why you chose these filters.",
  "I need a car for a growing family. My commute is long. I enjoy driving. I don't want something boring. I don't want something that'll bankrupt me."
];

const store = await loadCars(process.env.CARS_CSV ?? "cars.csv");

for (const [index, query] of queries.entries()) {
  const intent = await parseIntent(query, 5);
  const plan = createLogicalPlan(intent, store);
  const results = executeSearch(store, query, intent, plan);
  console.log(`\n=== TEST ${index + 1} ===`);
  console.log(query);
  console.log(JSON.stringify({
    tags: intent.tags?.value,
    softTags: intent.softTags?.value,
    countries: intent.countries?.value,
    preferredCountries: intent.preferredCountries?.value,
    excludeCountries: intent.excludeCountries?.value,
    brands: intent.brands?.value,
    excludeBrands: intent.excludeBrands?.value,
    fuelTypes: intent.fuelTypes?.value,
    excludeFuelTypes: intent.excludeFuelTypes?.value,
    transmissions: intent.transmissions?.value,
    bodyTypes: intent.bodyTypes?.value,
    price: intent.price,
    year: intent.year,
    sort: intent.sort?.value,
    notes: intent.notes
  }, null, 2));
  console.log(formatPlan(plan));
  for (const result of results.slice(0, 3)) {
    const car = result.car;
    console.log(`${result.score.toFixed(1)} | ${car.year ?? "?"} ${car.manufacturer ?? "?"} ${car.model ?? "?"} | $${car.price ?? "?"} | ${car.brandCountry ?? "?"} | ${car.tags.join(",")}`);
  }
  console.log("Trace:", results[0]?.executionTrace.map((step) => `${step.operator}: ${step.before}->${step.after}`).join(" | ") ?? "no results");
}
