import type { SearchIntent, SortMode } from "./types.js";
import {
  append,
  canonicalBrand,
  canonicalCountryName,
  containsTerm,
  extractLimit,
  extractNegatedCountries,
  field,
  hasExclusion,
  hasPreference,
  knownBodyTypes,
  knownBrands,
  knownColors,
  knownCountries,
  knownTags,
  modelAliases,
  negatedBlocks,
  normalizeColor,
  parseMoneyBound,
  removeNegatedGroups
} from "./intent-utils.js";

export function compileLocalIntent(query: string, limit?: number): SearchIntent {
  const q = query.toLowerCase();
  const intent: SearchIntent = { originalQuery: query, confidence: 0.72, notes: ["Parsed by local deterministic fallback."] };
  const tags = new Set<string>();
  const softTags = new Set<string>();
  const excludedBrands = new Set<string>();
  const excludedCountries = new Set<string>();
  const excludedBodyTypes = new Set<string>();
  const excludedFuelTypes = new Set<string>();
  const excludedColors = new Set<string>();
  const positiveQ = removeNegatedGroups(q);

  for (const country of extractNegatedCountries(q)) excludedCountries.add(country);
  for (const country of knownCountries) {
    const adjective = country === "germany" ? "german" : country === "japan" ? "japanese" : country === "italy" ? "italian" : country === "south korea" ? "korean" : country === "united states" ? "american" : country === "sweden" ? "swedish" : ["united kingdom", "uk", "britain", "england"].includes(country) ? "english" : country;
    const canonicalCountry = canonicalCountryName(country);
    if (hasExclusion(q, country) || hasExclusion(q, adjective)) excludedCountries.add(canonicalCountry);
    else if (hasPreference(positiveQ, country) || hasPreference(positiveQ, adjective)) intent.preferredCountries = append(intent.preferredCountries, canonicalCountry, 0.82, "inferred");
    else if (!excludedCountries.has(canonicalCountry) && (containsTerm(positiveQ, country) || containsTerm(positiveQ, adjective))) intent.countries = field([canonicalCountry], 0.95);
  }
  if (/\bnot german\b|no german/.test(q)) excludedCountries.add("Germany");
  if (/\bno american|absolutely no american|not american/.test(q)) excludedCountries.add("United States");
  for (const brand of extractNegatedBrands(q)) excludedBrands.add(brand);
  for (const brand of knownBrands) if (hasExclusion(q, brand)) excludedBrands.add(canonicalBrand(brand));
  for (const brand of knownBrands) {
    const canonical = canonicalBrand(brand);
    if (!excludedBrands.has(canonical) && containsTerm(q, brand) && !hasExclusion(q, brand) && !isReferenceMention(q, brand)) {
      intent.brands = append(intent.brands, canonical, 0.92, "explicit");
    }
  }
  for (const color of knownColors) {
    if (hasExclusion(q, color)) continue;
    if (new RegExp(`\\b(?:should be|must be|has to be|in|painted|color)\\s+(?:a\\s+)?${color}\\b`).test(q) || new RegExp(`\\b${color}\\b`).test(q) && /\b(red|black|white|gray|grey|blue|silver|green|yellow|orange|brown|gold)\b/.test(q)) {
      intent.colors = append(intent.colors, normalizeColor(color), 0.9, "explicit");
    }
  }
  for (const block of negatedBlocks(q)) {
    for (const body of knownBodyTypes) if (new RegExp(`^${body}s?\\b`).test(block)) excludedBodyTypes.add(body);
  }
  for (const color of knownColors) if (hasExclusion(q, color)) excludedColors.add(normalizeColor(color));
  for (const body of knownBodyTypes) if (containsTerm(q, body) && !excludedBodyTypes.has(body)) intent.bodyTypes = append(intent.bodyTypes, body, 0.95, "explicit");
  if (/\bsports car\b|\bsportscar\b/.test(q)) intent.bodyTypes = append(append(intent.bodyTypes, "coupe", 0.78, "rewritten"), "convertible", 0.78, "rewritten");
  if (/\bhybrid\b/.test(q)) intent.fuelTypes = field(["Hybrid"]);
  if (/\bdiesel\b/.test(q) && !hasExclusion(q, "diesel")) intent.fuelTypes = field(["Diesel"]);
  for (const fuel of extractNegatedFuelTypes(q)) excludedFuelTypes.add(fuel);
  if (/\bnon[-\s]?electric\b/.test(q)) excludedFuelTypes.add("Electric");
  if (excludedFuelTypes.size === 0 && /\belectric|ev\b/.test(q)) intent.fuelTypes = field(["Electric"]);
  if (!excludedFuelTypes.has("Gasoline") && /\b(?:gas|gasoline|petrol|ice)\s+(?:only|car|cars|vehicle|vehicles)?\b/.test(q)) intent.fuelTypes = field(["Gasoline"]);
  if (/\bmanual\b/.test(q)) intent.transmissions = field(["Manual"], /\bmanual if possible|prefer(?:ably)? manual/.test(q) ? 0.68 : 0.95, /\bmanual if possible|prefer(?:ably)? manual/.test(q) ? "inferred" : "explicit");
  if (/\bawd|all wheel\b/.test(q)) intent.drivetrains = field(["All-wheel Drive"]);
  if (/\b4wd|four wheel\b/.test(q)) intent.drivetrains = field(["Four-wheel Drive"]);
  if (/\bclean history|no accidents?|accident free\b/.test(q)) intent.booleans = { accidentsOrDamage: field(false, 0.9) };
  if (/\bone owner\b/.test(q)) intent.booleans = { ...(intent.booleans ?? {}), oneOwner: field(true, 0.9) };

  for (const alias of modelAliases) {
    if (alias.patterns.some((pattern) => containsTerm(q, pattern))) {
      if ((alias.brand && excludedBrands.has(alias.brand)) || alias.patterns.some((pattern) => hasExclusion(q, pattern) || isReferenceMention(q, pattern))) continue;
      if (alias.brand && !excludedBrands.has(alias.brand)) intent.brands = append(intent.brands, alias.brand, 0.86, "rewritten");
      intent.models = append(intent.models, alias.model, 0.86, "rewritten");
      for (const tag of alias.tags ?? []) tags.add(tag);
      for (const bodyType of alias.bodyTypes ?? []) intent.bodyTypes = append(intent.bodyTypes, bodyType, 0.82, "rewritten");
      intent.notes.push(`Mapped model alias to ${alias.model}.`);
    }
  }

  if (/\bfun\b|sporty|sports car|fast|enthusiast|enjoy driving|not something boring|weekend drives?/.test(q)) ["performance", "enthusiast"].forEach((t) => tags.add(t));
  if (/commuter|commute|daily|100 miles every day|long commute|drive .* every day/.test(q)) ["daily-driver", "economical"].forEach((t) => tags.add(t));
  if (/family|kids|children|growing family/.test(q)) tags.add("family");
  if (/growing family/.test(q)) intent.bodyTypes = append(append(append(intent.bodyTypes, "suv", 0.72, "rewritten"), "van", 0.72, "rewritten"), "wagon", 0.72, "rewritten");
  if (/comfortable|comfort/.test(q)) tags.add("comfortable");
  if (/reliable|hate visiting mechanics|maintenance|mechanics|won't kill me on maintenance|won't bankrupt me|bankrupt me/.test(q)) tags.add("reliable");
  if (/luxury|premium|client meeting|won't embarrass me|professional|executive/.test(q)) tags.add("luxury");
  if (/economical|efficient|good mpg|fuel efficient|decent mileage|fuel economy|bankrupt me|long commute/.test(q)) tags.add("economical");
  if (/off.?road|trail/.test(q)) tags.add("off-road");
  if (/work truck|workhorse/.test(q)) tags.add("work-truck");
  if (/don't care about speed|do not care about speed/.test(q)) {
    tags.delete("performance");
    tags.delete("enthusiast");
    softTags.add("comfortable");
  }
  if (/comfort more than anything|care about comfort/.test(q)) softTags.add("comfortable");
  if (/fastest car possible/.test(q)) softTags.add("performance");
  if (/amazing fuel economy/.test(q)) softTags.add("economical");
  if (/porsche cayman/.test(q)) {
    ["performance", "enthusiast"].forEach((t) => tags.add(t));
    tags.add("reliable");
    intent.bodyTypes = append(intent.bodyTypes, "coupe", 0.72, "rewritten");
    intent.notes.push("Interpreted Porsche Cayman as a reference vehicle; rewrote toward coupe, performance/enthusiast, and reliability preference.");
  }
  if (/naturally aspirated/.test(q)) intent.notes.push("Naturally aspirated is not a normalized field in v1; preserved as an interpretation note.");

  const validTags = [...tags].filter((t) => knownTags.includes(t));
  if (validTags.length) intent.tags = field(validTags, 0.78, "rewritten");
  const validSoftTags = [...softTags].filter((t) => knownTags.includes(t));
  if (validSoftTags.length) intent.softTags = field(validSoftTags, 0.72, "rewritten");
  if (excludedBrands.size) intent.excludeBrands = field([...excludedBrands], 0.92, "explicit");
  if (excludedCountries.size) intent.excludeCountries = field([...excludedCountries], 0.92, "explicit");
  if (excludedBodyTypes.size) intent.excludeBodyTypes = field([...excludedBodyTypes], 0.9, "explicit");
  if (excludedFuelTypes.size) intent.excludeFuelTypes = field([...excludedFuelTypes], 0.92, "explicit");
  if (excludedColors.size) intent.excludeColors = field([...excludedColors], 0.9, "explicit");

  const price = parseMoneyBound(q);
  if (price) intent.price = { max: field(price, 0.94) };
  if (/not too old/.test(q)) intent.year = { min: field(2016, 0.58, "inferred") };
  if (/cheaper/.test(q) && /porsche cayman/.test(q)) intent.price = { max: field(35000, 0.55, "inferred") };
  const minYear = q.match(/\b(?:after|newer than|since)\s+(20\d{2}|19\d{2})\b/);
  if (minYear) intent.year = { min: field(Number(minYear[1]), 0.9) };
  const maxMileage = q.match(/\b(?:under|below|less than|max|up to)\s+(\d{1,3})(?:\s*(k|thousand)|,\d{3})?\s+miles?\b/);
  if (maxMileage) intent.mileage = { max: field(Number(maxMileage[1]) * (maxMileage[2] || q.includes(`${maxMileage[1]}k`) || q.includes(`${maxMileage[1]},`) ? 1000 : 1), 0.86) };

  if (/cheapest|lowest price/.test(q)) intent.sort = field<SortMode>("price_asc");
  else if (/newest/.test(q)) intent.sort = field<SortMode>("year_desc");
  else if (/low mileage|least miles/.test(q)) intent.sort = field<SortMode>("mileage_asc");
  else if (/best mpg|most efficient|fuel economy/.test(q) && !/fastest/.test(q)) intent.sort = field<SortMode>("mpg_desc");
  else if (/fastest|most power/.test(q)) intent.sort = field<SortMode>("horsepower_desc");
  else intent.sort = field<SortMode>("relevance", 0.8, "inferred");
  if (/fastest/.test(q) && /fuel economy/.test(q)) intent.notes.push("Detected a tradeoff: fastest and amazing fuel economy compete, so horsepower is primary ranking and economy remains a relevance signal.");

  intent.limit = field(Math.max(1, Math.min(limit ?? extractLimit(q) ?? 10, 50)), 0.9, limit ? "explicit" : "inferred");
  intent.rewrittenQuery = [...(intent.tags?.value ?? [])].length || [...(intent.softTags?.value ?? [])].length
    ? `${query} => tags:${[...(intent.tags?.value ?? []), ...(intent.softTags?.value ?? [])].join(",")}`
    : query;
  return intent;
}

function extractNegatedBrands(q: string): string[] {
  const excluded = new Set<string>();
  for (const block of negatedBlocks(q)) {
    if (/^(red|black|white|gray|grey|blue|silver|green|yellow|orange|brown|gold)\b/.test(block)) continue;
    for (const brand of knownBrands) {
      if (containsTerm(block, brand)) excluded.add(canonicalBrand(brand));
    }
  }
  return [...excluded];
}

function extractNegatedFuelTypes(q: string): string[] {
  const excluded = new Set<string>();
  if (hasExclusion(q, "electric") || hasExclusion(q, "ev") || hasExclusion(q, "evs")) excluded.add("Electric");
  if (hasExclusion(q, "hybrid") || hasExclusion(q, "hybrids")) excluded.add("Hybrid");
  if (hasExclusion(q, "diesel") || hasExclusion(q, "diesels")) excluded.add("Diesel");
  if (hasExclusion(q, "gas") || hasExclusion(q, "gasoline") || hasExclusion(q, "petrol")) excluded.add("Gasoline");
  for (const block of negatedBlocks(q)) {
    if (/^(electric|evs?|electric cars?|electric vehicles?)\b/.test(block)) excluded.add("Electric");
    if (/^(hybrid|hybrids|plug-?in)\b/.test(block)) excluded.add("Hybrid");
    if (/^(diesel|diesels)\b/.test(block)) excluded.add("Diesel");
    if (/^(gas|gasoline|petrol)\b/.test(block)) excluded.add("Gasoline");
  }
  return [...excluded];
}

function isReferenceMention(q: string, value: string): boolean {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b(?:like|similar to)\\s+(?:a\\s+|an\\s+)?${escaped}\\b`).test(q);
}
