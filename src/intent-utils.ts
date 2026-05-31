import type { IntentField } from "./types.js";

export const knownCountries = ["germany", "japan", "united states", "usa", "us", "america", "italy", "south korea", "korea", "united kingdom", "uk", "britain", "british", "england", "sweden"];
export const knownBodyTypes = ["sedan", "suv", "truck", "coupe", "convertible", "van", "wagon", "hatchback"];
export const knownTags = ["luxury", "reliable", "comfortable", "performance", "daily-driver", "family", "economical", "enthusiast", "off-road", "work-truck"];
export const knownBrands = ["acura", "alfa romeo", "aston", "aston martin", "audi", "bentley", "bmw", "buick", "cadillac", "chevrolet", "chevy", "chrysler", "dodge", "ferrari", "fiat", "ford", "genesis", "gmc", "honda", "hyundai", "infiniti", "jaguar", "jeep", "kia", "lamborghini", "land rover", "lexus", "lincoln", "maserati", "mazda", "mercedes", "mercedes-benz", "benz", "merc", "mini", "mitsubishi", "nissan", "porsche", "ram", "subaru", "tesla", "toyota", "volkswagen", "vw", "volvo"];
export const knownColors = ["red", "black", "white", "gray", "grey", "blue", "silver", "green", "yellow", "orange", "brown", "gold"];
export const modelAliases: Array<{ patterns: string[]; model: string; brand?: string; tags?: string[]; bodyTypes?: string[] }> = [
  { patterns: ["miata", "mx-5", "mx5"], brand: "Mazda", model: "MX-5 Miata", tags: ["performance", "enthusiast"], bodyTypes: ["convertible"] },
  { patterns: ["vette", "corvette"], brand: "Chevrolet", model: "Corvette", tags: ["performance", "enthusiast"], bodyTypes: ["coupe", "convertible"] },
  { patterns: ["beemer", "bimmer"], brand: "BMW", model: "BMW", tags: ["luxury", "performance"] },
  { patterns: ["benz", "merc"], brand: "Mercedes-Benz", model: "Mercedes-Benz", tags: ["luxury", "comfortable"] },
  { patterns: ["wrx"], brand: "Subaru", model: "WRX", tags: ["performance", "enthusiast"], bodyTypes: ["sedan"] },
  { patterns: ["brz"], brand: "Subaru", model: "BRZ", tags: ["performance", "enthusiast"], bodyTypes: ["coupe"] },
  { patterns: ["gr86", "gr 86"], brand: "Toyota", model: "GR86", tags: ["performance", "enthusiast"], bodyTypes: ["coupe"] },
  { patterns: ["supra"], brand: "Toyota", model: "Supra", tags: ["performance", "enthusiast"], bodyTypes: ["coupe"] },
  { patterns: ["civic type r", "type r"], brand: "Honda", model: "Civic Type R", tags: ["performance", "enthusiast"], bodyTypes: ["hatchback"] },
  { patterns: ["911"], brand: "Porsche", model: "911", tags: ["luxury", "performance", "enthusiast"], bodyTypes: ["coupe", "convertible"] }
];

export const field = <T>(value: T, confidence = 0.95, source: IntentField<T>["source"] = "explicit"): IntentField<T> => ({ value, confidence, source });

export function append(existing: IntentField<string[]> | undefined, value: string, confidence: number, source: IntentField<string[]>["source"]): IntentField<string[]> {
  return field([...(existing?.value ?? []), value], Math.max(existing?.confidence ?? 0, confidence), source);
}

export function title(value: string): string {
  return value.split(" ").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

export function hasExclusion(q: string, value: string): boolean {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b(?:no|without|except|exclude|excluding|definitely not|absolutely no)\\b[^.;\\n]{0,80}\\b(?:a\\s+|an\\s+)?${escaped}\\b`).test(q)
    || (new RegExp(`\\bnot\\s+(?:a\\s+|an\\s+)?${escaped}\\b`).test(q) && !new RegExp(`\\bif\\s+not\\s+(?:a\\s+|an\\s+)?${escaped}\\b`).test(q));
}

export function hasPreference(q: string, value: string): boolean {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b(?:prefer|preferably|if not|then)\\s+(?:\\w+\\s+){0,2}${escaped}\\b`).test(q);
}

export function extractNegatedCountries(q: string): string[] {
  const countries = new Set<string>();
  const negatedGroups = [...q.matchAll(/\bnot\s*\(([^)]+)\)/g)].map((match) => match[1]);
  for (const group of negatedGroups) {
    for (const [pattern, country] of countryPatterns()) {
      if (pattern.test(group)) countries.add(country);
    }
  }
  for (const [pattern, country] of countryPatterns()) {
    if (new RegExp(`\\b(?:no|without|exclude|excluding)\\b[^.;\\n]{0,80}${pattern.source}`).test(q)) countries.add(country);
    if (new RegExp(`\\bnot\\s+(?:a\\s+|an\\s+)?${pattern.source}\\s+(?:car|cars|vehicle|vehicles)\\b`).test(q)) countries.add(country);
  }
  for (const block of negatedBlocks(q)) {
    for (const [pattern, country] of countryPatterns()) {
      if (pattern.test(block)) countries.add(country);
    }
  }
  return [...countries];
}

export function removeNegatedGroups(q: string): string {
  return q.replace(/\bnot\s*\([^)]+\)/g, " ");
}

export function containsTerm(q: string, value: string): boolean {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}s?\\b`).test(q);
}

export function negatedBlocks(q: string): string[] {
  return [...q.matchAll(/\b(?:no|without|except|excluding|exclude|not|definitely not|absolutely no)\b\s+(?:a\s+|an\s+)?([^.;\n]{0,120})/g)]
    .filter((match) => !/\bif\s+$/.test(q.slice(0, match.index)))
    .map((match) => match[1]);
}

export function countryPatterns(): Array<[RegExp, string]> {
  return [
    [/\b(united states|usa|u\.s\.|us|american|america)\b/i, "United States"],
    [/\b(germany|german)\b/i, "Germany"],
    [/\b(japan|japanese)\b/i, "Japan"],
    [/\b(south korea|korea|korean)\b/i, "South Korea"],
    [/\b(united kingdom|uk|britain|british|england|english)\b/i, "United Kingdom"],
    [/\b(italy|italian)\b/i, "Italy"],
    [/\b(sweden|swedish)\b/i, "Sweden"]
  ];
}

export function canonicalCountryName(value: string): string {
  const normalized = value.toLowerCase();
  if (["usa", "u.s.", "us", "america", "american"].includes(normalized)) return "United States";
  if (["german", "germany"].includes(normalized)) return "Germany";
  if (["japanese", "japan"].includes(normalized)) return "Japan";
  if (["korea", "korean"].includes(normalized)) return "South Korea";
  if (["uk", "britain", "british", "england", "english"].includes(normalized)) return "United Kingdom";
  if (normalized === "italian") return "Italy";
  if (normalized === "swedish") return "Sweden";
  return title(normalized);
}

export function canonicalBrand(value: string): string {
  const normalized = value.toLowerCase();
  const map: Record<string, string> = {
    mercedes: "Mercedes-Benz",
    "mercedes-benz": "Mercedes-Benz",
    bmw: "BMW",
    audi: "Audi",
    "alfa romeo": "Alfa Romeo",
    "aston martin": "Aston",
    aston: "Aston",
    bentley: "Bentley",
    buick: "Buick",
    cadillac: "Cadillac",
    chevy: "Chevrolet",
    porsche: "Porsche",
    toyota: "Toyota",
    honda: "Honda",
    lexus: "Lexus",
    acura: "Acura",
    mazda: "Mazda",
    subaru: "Subaru",
    hyundai: "Hyundai",
    kia: "Kia",
    ford: "Ford",
    genesis: "Genesis",
    gmc: "GMC",
    infiniti: "INFINITI",
    jaguar: "Jaguar",
    lamborghini: "Lamborghini",
    "land rover": "Land Rover",
    lincoln: "Lincoln",
    maserati: "Maserati",
    benz: "Mercedes-Benz",
    merc: "Mercedes-Benz",
    mini: "MINI",
    mitsubishi: "Mitsubishi",
    nissan: "Nissan",
    ram: "Ram",
    chevrolet: "Chevrolet",
    dodge: "Dodge",
    jeep: "Jeep",
    tesla: "Tesla",
    volkswagen: "Volkswagen",
    vw: "Volkswagen",
    volvo: "Volvo"
  };
  return map[normalized] ?? title(normalized);
}

export function normalizeColor(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized === "grey") return "Gray";
  return title(normalized);
}

export function parseMoneyBound(q: string): number | null {
  const match = q.match(/\b(?:under|below|less than|max|up to)\s+\$?(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|grand)?\b/);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  return amount * (match[2] || amount < 1000 ? 1000 : 1);
}

export function extractLimit(q: string): number | null {
  const match = q.match(/\btop\s+(\d{1,2})\b/);
  return match ? Number(match[1]) : null;
}

export function canonicalFuelType(value: string): string {
  if (/electric/i.test(value)) return "Electric";
  if (/hybrid/i.test(value)) return "Hybrid";
  if (/diesel/i.test(value)) return "Diesel";
  if (/flex/i.test(value)) return "Flex Fuel";
  if (/gas/i.test(value)) return "Gasoline";
  return value;
}

export function canonicalTransmission(value: string): string {
  if (/manual/i.test(value)) return "Manual";
  if (/cvt/i.test(value)) return "CVT";
  if (/auto/i.test(value)) return "Automatic";
  return value;
}

export function mergeField(existing?: IntentField<string[]>, guardrail?: IntentField<string[]>): IntentField<string[]> | undefined {
  if (!existing) return guardrail;
  if (!guardrail) return existing;
  return {
    value: [...new Set([...existing.value, ...guardrail.value])],
    confidence: Math.max(existing.confidence, guardrail.confidence),
    source: existing.source === "explicit" || guardrail.source === "explicit" ? "explicit" : existing.source
  };
}
