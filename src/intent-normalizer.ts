import type { IntentField, SearchIntent } from "./types.js";
import { canonicalBrand, canonicalCountryName, canonicalFuelType, canonicalTransmission, field, knownBodyTypes, knownTags, mergeField, normalizeColor } from "./intent-utils.js";
import { compileLocalIntent } from "./intent-local.js";

export function applyLocalGuardrails(query: string, intent: SearchIntent, limit?: number): SearchIntent {
  const local = compileLocalIntent(query, limit);
  const guarded = normalizeIntent({
    ...intent,
    originalQuery: intent.originalQuery || query,
    brands: mergeField(intent.brands, local.brands),
    models: mergeField(intent.models, local.models),
    countries: mergeField(intent.countries, local.countries),
    tags: mergeField(intent.tags, local.tags),
    bodyTypes: mergeField(intent.bodyTypes, local.bodyTypes),
    fuelTypes: mergeField(intent.fuelTypes, local.fuelTypes),
    transmissions: mergeField(intent.transmissions, local.transmissions),
    drivetrains: mergeField(intent.drivetrains, local.drivetrains),
    colors: mergeField(intent.colors, local.colors),
    booleans: mergeBooleans(intent.booleans, local.booleans),
    excludeBrands: mergeField(intent.excludeBrands, local.excludeBrands),
    excludeCountries: mergeField(intent.excludeCountries, local.excludeCountries),
    excludeBodyTypes: mergeField(intent.excludeBodyTypes, local.excludeBodyTypes),
    excludeFuelTypes: mergeField(intent.excludeFuelTypes, local.excludeFuelTypes),
    excludeColors: mergeField(intent.excludeColors, local.excludeColors),
    preferredCountries: mergeField(intent.preferredCountries, local.preferredCountries),
    softTags: mergeField(intent.softTags, local.softTags),
    price: intent.price ?? local.price,
    year: intent.year ?? local.year,
    mileage: intent.mileage ?? local.mileage,
    horsepower: intent.horsepower ?? local.horsepower,
    mpg: intent.mpg ?? local.mpg,
    sort: intent.sort ?? local.sort,
    limit: limit ? field(limit) : intent.limit ?? local.limit,
    notes: [...(intent.notes ?? []), ...local.notes.filter((note) => !intent.notes?.includes(note)), "Applied deterministic parser guardrails."]
  });
  guarded.rewrittenQuery = guarded.rewrittenQuery ?? local.rewrittenQuery;
  return guarded;
}

export function normalizeIntent(intent: SearchIntent): SearchIntent {
  const normalized: SearchIntent = { ...intent };
  normalized.brands = cleanStringField(normalized.brands, canonicalBrand);
  normalized.models = cleanStringField(normalized.models);
  normalized.countries = cleanStringField(normalized.countries, canonicalCountryName, ["Germany", "Japan", "United States", "Italy", "South Korea", "United Kingdom", "Sweden"]);
  normalized.bodyTypes = cleanStringField(normalized.bodyTypes, (value) => value.toLowerCase(), knownBodyTypes);
  normalized.fuelTypes = cleanStringField(normalized.fuelTypes, canonicalFuelType, ["Gasoline", "Hybrid", "Electric", "Diesel", "Flex Fuel"]);
  normalized.transmissions = cleanStringField(normalized.transmissions, canonicalTransmission, ["Automatic", "Manual", "CVT"]);
  normalized.drivetrains = cleanStringField(normalized.drivetrains);
  normalized.colors = cleanStringField(normalized.colors, (value) => normalizeColor(value.toLowerCase()));
  normalized.tags = cleanStringField(normalized.tags, (value) => value.toLowerCase(), knownTags);
  normalized.softTags = cleanStringField(normalized.softTags, (value) => value.toLowerCase(), knownTags);
  normalized.excludeBrands = cleanStringField(normalized.excludeBrands, canonicalBrand);
  normalized.excludeCountries = cleanStringField(normalized.excludeCountries, canonicalCountryName, ["Germany", "Japan", "United States", "Italy", "South Korea", "United Kingdom", "Sweden"]);
  normalized.excludeBodyTypes = cleanStringField(normalized.excludeBodyTypes, (value) => value.toLowerCase(), knownBodyTypes);
  normalized.excludeFuelTypes = cleanStringField(normalized.excludeFuelTypes, canonicalFuelType, ["Gasoline", "Hybrid", "Electric", "Diesel", "Flex Fuel"]);
  normalized.excludeColors = cleanStringField(normalized.excludeColors, (value) => normalizeColor(value.toLowerCase()));
  normalized.preferredCountries = cleanStringField(normalized.preferredCountries, canonicalCountryName, ["Germany", "Japan", "United States", "Italy", "South Korea", "United Kingdom", "Sweden"]);

  if (intent.fuelTypes?.value.some((value) => /non[-\s]?electric|not electric|no electric/i.test(value))) {
    normalized.fuelTypes = undefined;
    normalized.excludeFuelTypes = mergeField(normalized.excludeFuelTypes, field(["Electric"], 0.95, "explicit"));
  }
  if (intent.excludeBrands?.value.some((value) => /german|germany/i.test(value))) {
    normalized.excludeBrands = normalized.excludeBrands
      ? cleanStringField({ ...normalized.excludeBrands, value: normalized.excludeBrands.value.filter((value) => !/german|germany/i.test(value)) })
      : undefined;
    normalized.excludeCountries = mergeField(normalized.excludeCountries, field(["Germany"], 0.95, "explicit"));
  }

  normalized.countries = removeExcluded(normalized.countries, normalized.excludeCountries);
  normalized.brands = removeExcluded(normalized.brands, normalized.excludeBrands);
  normalized.bodyTypes = removeExcluded(normalized.bodyTypes, normalized.excludeBodyTypes);
  normalized.fuelTypes = removeExcluded(normalized.fuelTypes, normalized.excludeFuelTypes);
  normalized.colors = removeExcluded(normalized.colors, normalized.excludeColors);

  return dropEmptyFields(normalized);
}

function cleanStringField(fieldValue?: IntentField<string[]>, canonicalize: (value: string) => string = (value) => value, allowed?: string[]): IntentField<string[]> | undefined {
  if (!fieldValue) return undefined;
  const values = [...new Set(fieldValue.value.map((value) => canonicalize(String(value).trim())).filter(Boolean))];
  const filtered = allowed ? values.filter((value) => allowed.some((allowedValue) => allowedValue.toLowerCase() === value.toLowerCase())) : values;
  if (!filtered.length) return undefined;
  return { ...fieldValue, value: filtered };
}

function dropEmptyFields(intent: SearchIntent): SearchIntent {
  const normalized = { ...intent };
  for (const key of ["brands", "models", "countries", "bodyTypes", "fuelTypes", "transmissions", "drivetrains", "colors", "tags", "softTags", "excludeBrands", "excludeCountries", "excludeBodyTypes", "excludeFuelTypes", "excludeColors", "preferredCountries"] as const) {
    if (normalized[key]?.value.length === 0) normalized[key] = undefined;
  }
  return normalized;
}

function removeExcluded<T extends string>(included?: IntentField<T[]>, excluded?: IntentField<T[]>): IntentField<T[]> | undefined {
  if (!included || !excluded) return included;
  const blocked = new Set(excluded.value.map((value) => value.toLowerCase()));
  const value = included.value.filter((item) => !blocked.has(item.toLowerCase()));
  return value.length ? { ...included, value } : undefined;
}

function mergeBooleans(
  existing?: Record<string, IntentField<boolean>>,
  guardrail?: Record<string, IntentField<boolean>>
): Record<string, IntentField<boolean>> | undefined {
  if (!existing) return guardrail;
  if (!guardrail) return existing;
  return { ...guardrail, ...existing };
}
