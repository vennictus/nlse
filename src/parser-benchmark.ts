import { localParseIntent } from "./intent.js";
import type { SearchIntent } from "./types.js";

interface ParserCase {
  name: string;
  query: string;
  checks: Array<{
    label: string;
    test: (intent: SearchIntent) => boolean;
  }>;
}

const cases: ParserCase[] = [
  {
    name: "English origin",
    query: "english cars",
    checks: [
      hasAll("countries", ["United Kingdom"])
    ]
  },
  {
    name: "Sports, red, not electric, not German",
    query: "i need a sports car that is not electric and it should be red not a german car",
    checks: [
      hasAll("bodyTypes", ["coupe", "convertible"]),
      hasAll("colors", ["Red"]),
      hasAll("excludeFuelTypes", ["Electric"]),
      hasAll("excludeCountries", ["Germany"])
    ]
  },
  {
    name: "Parenthesized country exclusions",
    query: "i need a sports car that is not electric and it should be red not (a united states car or german car)",
    checks: [
      hasAll("excludeCountries", ["United States", "Germany"]),
      hasAll("excludeFuelTypes", ["Electric"]),
      hasAll("colors", ["Red"])
    ]
  },
  {
    name: "Luxury sedan exclusions",
    query: "Luxury sedan, but no BMW, Audi, Mercedes, and definitely not electric.",
    checks: [
      hasAll("bodyTypes", ["sedan"]),
      hasAll("tags", ["luxury"]),
      hasAll("excludeBrands", ["BMW", "Audi", "Mercedes-Benz"]),
      hasAll("excludeFuelTypes", ["Electric"])
    ]
  },
  {
    name: "No-keyword commute and maintenance goals",
    query: "I drive 100 miles every day and hate visiting mechanics.",
    checks: [
      hasAll("tags", ["daily-driver", "economical", "reliable"])
    ]
  },
  {
    name: "Reference vehicle rewrite",
    query: "Something like a Porsche Cayman but cheaper and more reliable.",
    checks: [
      hasAll("bodyTypes", ["coupe"]),
      hasAll("tags", ["performance", "enthusiast", "reliable"]),
      { label: "does not hard-filter Porsche Cayman as a model", test: (intent) => !intent.models?.value.length },
      { label: "infers a cheaper max price", test: (intent) => intent.price?.max?.value === 35000 }
    ]
  },
  {
    name: "Founder subjective goals",
    query: "I need a car for a growing family. My commute is long. I enjoy driving. I don't want something boring. I don't want something that'll bankrupt me.",
    checks: [
      hasAll("tags", ["family", "daily-driver", "economical", "performance", "enthusiast", "reliable"]),
      hasAll("bodyTypes", ["suv", "van", "wagon"])
    ]
  },
  {
    name: "Alias-heavy exclusions",
    query: "no chevy, vw, merc, or teslas",
    checks: [
      hasAll("excludeBrands", ["Chevrolet", "Volkswagen", "Mercedes-Benz", "Tesla"])
    ]
  },
  {
    name: "Negative body, fuel, and color",
    query: "reliable car under $40,000 with no SUVs, no hybrids, and not black",
    checks: [
      hasAll("tags", ["reliable"]),
      hasAll("excludeBodyTypes", ["suv"]),
      hasAll("excludeFuelTypes", ["Hybrid"]),
      hasAll("excludeColors", ["Black"]),
      { label: "price max is 40000", test: (intent) => intent.price?.max?.value === 40000 }
    ]
  }
];

let failures = 0;

for (const parserCase of cases) {
  const intent = localParseIntent(parserCase.query);
  console.log(`\n${parserCase.name}`);
  console.log(parserCase.query);
  console.log(JSON.stringify(intentSummary(intent), null, 2));

  for (const check of parserCase.checks) {
    const passed = check.test(intent);
    if (!passed) failures += 1;
    console.log(`${passed ? "PASS" : "FAIL"} ${check.label}`);
  }
}

if (failures > 0) {
  console.error(`\nParser benchmark failed: ${failures} check(s) failed.`);
  process.exit(1);
}

console.log("\nParser benchmark passed.");

function hasAll(
  key: "brands" | "models" | "countries" | "bodyTypes" | "fuelTypes" | "colors" | "tags" | "excludeBrands" | "excludeCountries" | "excludeBodyTypes" | "excludeFuelTypes" | "excludeColors",
  expected: string[]
) {
  return {
    label: `${key} contains ${expected.join(", ")}`,
    test: (intent: SearchIntent) => expected.every((value) => intent[key]?.value.includes(value))
  };
}

function intentSummary(intent: SearchIntent): Record<string, unknown> {
  return {
    brands: intent.brands?.value,
    models: intent.models?.value,
    countries: intent.countries?.value,
    preferredCountries: intent.preferredCountries?.value,
    bodyTypes: intent.bodyTypes?.value,
    colors: intent.colors?.value,
    tags: intent.tags?.value,
    softTags: intent.softTags?.value,
    excludeBrands: intent.excludeBrands?.value,
    excludeCountries: intent.excludeCountries?.value,
    excludeBodyTypes: intent.excludeBodyTypes?.value,
    excludeFuelTypes: intent.excludeFuelTypes?.value,
    excludeColors: intent.excludeColors?.value,
    price: intent.price,
    year: intent.year,
    sort: intent.sort?.value,
    notes: intent.notes
  };
}
