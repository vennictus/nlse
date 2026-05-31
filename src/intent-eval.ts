import { localParseIntent } from "./intent.js";
import type { SearchIntent } from "./types.js";

type FieldName =
  | "brands"
  | "models"
  | "countries"
  | "bodyTypes"
  | "fuelTypes"
  | "transmissions"
  | "drivetrains"
  | "colors"
  | "tags"
  | "softTags"
  | "excludeBrands"
  | "excludeCountries"
  | "excludeBodyTypes"
  | "excludeFuelTypes"
  | "excludeColors"
  | "preferredCountries";

interface EvalCase {
  query: string;
  expect: Array<(intent: SearchIntent) => string | null>;
}

const cases: EvalCase[] = [
  c("comfortable german sedan under $50k", has("countries", "Germany"), has("bodyTypes", "sedan"), has("tags", "comfortable"), max("price", 50000)),
  c("red sports car, not electric, not German or American", has("colors", "Red"), has("excludeFuelTypes", "Electric"), has("excludeCountries", "Germany"), has("excludeCountries", "United States")),
  c("manual miata under 20k", has("brands", "Mazda"), has("models", "MX-5 Miata"), has("transmissions", "Manual"), max("price", 20000)),
  c("cheap vette no accidents", has("models", "Corvette"), booleanField("accidentsOrDamage", false)),
  c("no chevy, vw, merc, or teslas", has("excludeBrands", "Chevrolet"), has("excludeBrands", "Volkswagen"), has("excludeBrands", "Mercedes-Benz"), has("excludeBrands", "Tesla")),
  c("not a porsche or audi or bmw", has("excludeBrands", "Porsche"), has("excludeBrands", "Audi"), has("excludeBrands", "BMW")),
  c("english cars", has("countries", "United Kingdom")),
  c("british luxury sedan", has("countries", "United Kingdom"), has("tags", "luxury"), has("bodyTypes", "sedan")),
  c("japanese commuter with good mpg", has("countries", "Japan"), has("tags", "daily-driver"), has("tags", "economical")),
  c("prefer Japanese, if not Japanese then Korean, no American", has("preferredCountries", "Japan"), has("preferredCountries", "South Korea"), has("excludeCountries", "United States")),
  c("family car for kids, not a van", has("tags", "family"), has("excludeBodyTypes", "van")),
  c("no SUVs, no hybrids, not black", has("excludeBodyTypes", "suv"), has("excludeFuelTypes", "Hybrid"), has("excludeColors", "Black")),
  c("fastest under 15k with amazing fuel economy", has("tags", "performance"), has("tags", "economical"), sort("horsepower_desc"), max("price", 15000)),
  c("I drive 100 miles every day and hate mechanics", has("tags", "daily-driver"), has("tags", "economical"), has("tags", "reliable")),
  c("client meeting car", has("tags", "luxury")),
  c("I care about comfort more than anything", has("softTags", "comfortable")),
  c("off road trail rig", has("tags", "off-road")),
  c("work truck under 30 grand", has("tags", "work-truck"), max("price", 30000)),
  c("one owner clean history toyota", has("brands", "Toyota"), booleanField("oneOwner", true), booleanField("accidentsOrDamage", false)),
  c("newer than 2020 low mileage", min("year", 2020), sort("mileage_asc")),
  c("under 80 thousand miles", max("mileage", 80000)),
  c("under $40,000", max("price", 40000)),
  c("gas only, no electric", has("fuelTypes", "Gasoline"), has("excludeFuelTypes", "Electric")),
  c("diesel truck", has("fuelTypes", "Diesel"), has("bodyTypes", "truck")),
  c("no diesel or hybrid", has("excludeFuelTypes", "Diesel"), has("excludeFuelTypes", "Hybrid")),
  c("awd suv", has("drivetrains", "All-wheel Drive"), has("bodyTypes", "suv")),
  c("4wd off road", has("drivetrains", "Four-wheel Drive"), has("tags", "off-road")),
  c("blue honda accord", has("colors", "Blue"), has("brands", "Honda")),
  c("white lexus sedan", has("colors", "White"), has("brands", "Lexus"), has("bodyTypes", "sedan")),
  c("black bmw no accidents", has("colors", "Black"), has("brands", "BMW"), booleanField("accidentsOrDamage", false)),
  c("not black bmw", has("brands", "BMW"), has("excludeColors", "Black")),
  c("something like a Porsche Cayman but cheaper and more reliable", has("bodyTypes", "coupe"), has("tags", "reliable"), max("price", 35000)),
  c("brz manual", has("brands", "Subaru"), has("models", "BRZ"), has("transmissions", "Manual")),
  c("gr86 fun weekend car", has("brands", "Toyota"), has("models", "GR86"), has("tags", "performance")),
  c("supra under 60k", has("brands", "Toyota"), has("models", "Supra"), max("price", 60000)),
  c("civic type r", has("brands", "Honda"), has("models", "Civic Type R"), has("tags", "performance")),
  c("beemer but not electric", has("brands", "BMW"), has("excludeFuelTypes", "Electric")),
  c("benz luxury comfort", has("brands", "Mercedes-Benz"), has("tags", "luxury"), has("tags", "comfortable")),
  c("volvo family wagon", has("brands", "Volvo"), has("tags", "family"), has("bodyTypes", "wagon")),
  c("tesla electric", has("brands", "Tesla"), has("fuelTypes", "Electric")),
  c("not tesla electric", has("excludeBrands", "Tesla"), has("fuelTypes", "Electric")),
  c("italian exotic", has("countries", "Italy")),
  c("swedish safe luxury", has("countries", "Sweden"), has("tags", "luxury")),
  c("korean daily driver", has("countries", "South Korea"), has("tags", "daily-driver")),
  c("american truck", has("countries", "United States"), has("bodyTypes", "truck")),
  c("not american truck", has("excludeCountries", "United States"), has("bodyTypes", "truck")),
  c("convertible weekend fun", has("bodyTypes", "convertible"), has("tags", "performance")),
  c("hatchback fuel efficient", has("bodyTypes", "hatchback"), has("tags", "economical")),
  c("luxury sedan no bmw audi mercedes", has("bodyTypes", "sedan"), has("tags", "luxury"), has("excludeBrands", "BMW"), has("excludeBrands", "Audi"), has("excludeBrands", "Mercedes-Benz")),
  c("growing family long commute fun not boring not bankrupt", has("tags", "family"), has("tags", "daily-driver"), has("tags", "performance"), has("tags", "economical"))
];

let failures = 0;
for (const [index, item] of cases.entries()) {
  const intent = localParseIntent(item.query);
  const errors = item.expect.map((check) => check(intent)).filter((message): message is string => message !== null);
  if (errors.length) {
    failures += errors.length;
    console.log(`FAIL ${index + 1}. ${item.query}`);
    for (const error of errors) console.log(`  - ${error}`);
  } else {
    console.log(`PASS ${index + 1}. ${item.query}`);
  }
}

if (failures) {
  console.error(`\nIntent eval failed with ${failures} failed expectation(s).`);
  process.exit(1);
}

console.log(`\nIntent eval passed: ${cases.length} queries.`);

function c(query: string, ...expect: EvalCase["expect"]): EvalCase {
  return { query, expect };
}

function has(field: FieldName, value: string) {
  return (intent: SearchIntent) => intent[field]?.value.includes(value) ? null : `${field} missing ${value}`;
}

function max(field: "price" | "year" | "mileage" | "horsepower" | "mpg", value: number) {
  return (intent: SearchIntent) => intent[field]?.max?.value === value ? null : `${field}.max expected ${value}`;
}

function min(field: "price" | "year" | "mileage" | "horsepower" | "mpg", value: number) {
  return (intent: SearchIntent) => intent[field]?.min?.value === value ? null : `${field}.min expected ${value}`;
}

function sort(value: string) {
  return (intent: SearchIntent) => intent.sort?.value === value ? null : `sort expected ${value}`;
}

function booleanField(field: string, value: boolean) {
  return (intent: SearchIntent) => intent.booleans?.[field]?.value === value ? null : `${field} expected ${value}`;
}
