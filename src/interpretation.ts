import type { InterpretationReport, SearchIntent } from "./types.js";

export function interpretIntent(intent: SearchIntent): InterpretationReport {
  const hardFilters: string[] = [];
  const exclusions: string[] = [];
  const preferences: string[] = [];
  const unsupported: string[] = [];
  const rewrites: string[] = [];

  addValues(hardFilters, "Brand", intent.brands?.value);
  addValues(hardFilters, "Model", intent.models?.value);
  addValues(hardFilters, "Country", intent.countries?.value);
  addValues(hardFilters, "Body type", intent.bodyTypes?.value);
  addValues(hardFilters, "Fuel type", intent.fuelTypes?.value);
  addValues(hardFilters, "Transmission", intent.transmissions?.value);
  addValues(hardFilters, "Drivetrain", intent.drivetrains?.value);
  addValues(hardFilters, "Exterior color", intent.colors?.value);
  addRange(hardFilters, "Price", intent.price);
  addRange(hardFilters, "Year", intent.year);
  addRange(hardFilters, "Mileage", intent.mileage);
  addRange(hardFilters, "Horsepower", intent.horsepower);
  addRange(hardFilters, "MPG", intent.mpg);
  for (const [key, value] of Object.entries(intent.booleans ?? {})) hardFilters.push(`${label(key)} is ${value.value}`);

  addValues(exclusions, "Brand is not", intent.excludeBrands?.value);
  addValues(exclusions, "Country is not", intent.excludeCountries?.value);
  addValues(exclusions, "Body type is not", intent.excludeBodyTypes?.value);
  addValues(exclusions, "Fuel type is not", intent.excludeFuelTypes?.value);
  addValues(exclusions, "Exterior color is not", intent.excludeColors?.value);

  addValues(preferences, "Semantic tag", intent.tags?.value);
  addValues(preferences, "Soft preference", intent.softTags?.value);
  addValues(preferences, "Preferred country", intent.preferredCountries?.value);
  if (intent.sort?.value && intent.sort.value !== "relevance") preferences.push(`Sort by ${intent.sort.value}`);

  for (const tag of intent.tags?.value ?? []) rewrites.push(`Mapped language to tag: ${tag}`);
  for (const tag of intent.softTags?.value ?? []) rewrites.push(`Mapped language to soft preference: ${tag}`);
  if (intent.bodyTypes?.source === "rewritten") {
    for (const bodyType of intent.bodyTypes.value) rewrites.push(`Mapped language to body type: ${bodyType}`);
  }
  for (const note of intent.notes) {
    if (/not normalized|unsupported|not a normalized field/i.test(note)) unsupported.push(note);
  }

  return {
    hardFilters: unique(hardFilters),
    exclusions: unique(exclusions),
    preferences: unique(preferences),
    unsupported: unique(unsupported),
    rewrites: unique(rewrites)
  };
}

function addValues(target: string[], labelText: string, values?: string[]): void {
  if (!values?.length) return;
  target.push(`${labelText}: ${values.join(", ")}`);
}

function addRange(target: string[], labelText: string, range?: { min?: { value: number }; max?: { value: number } }): void {
  if (!range?.min && !range?.max) return;
  target.push(`${labelText}: ${range.min?.value ?? "*"}..${range.max?.value ?? "*"}`);
}

function label(value: string): string {
  return value.replace(/[A-Z]/g, (char) => ` ${char.toLowerCase()}`);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
