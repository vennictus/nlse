import type { Car } from "./types.js";
import { bodyRules, brandCountries } from "./ontology-data.js";

export { brandCountries };

export function deriveBodyType(model: string | null): string {
  if (!model) return "unknown";
  for (const [pattern, bodyType] of bodyRules) {
    if (pattern.test(model)) return bodyType;
  }
  return "unknown";
}

export function brandCountry(manufacturer: string | null): string | null {
  if (!manufacturer) return null;
  return brandCountries[manufacturer] ?? null;
}

export function semanticTags(car: Omit<Car, "tags">): string[] {
  const tags = new Set<string>();
  const brand = car.manufacturer ?? "";
  const model = car.model ?? "";
  const combined = `${brand} ${model}`;

  if (["BMW", "Mercedes-Benz", "Audi", "Lexus", "Acura", "Cadillac", "Genesis", "Porsche", "Volvo", "INFINITI", "Lincoln", "Jaguar", "Land Rover"].includes(brand)) {
    tags.add("luxury");
    tags.add("comfortable");
  }
  if (["Toyota", "Honda", "Lexus", "Acura", "Mazda", "Subaru"].includes(brand)) tags.add("reliable");
  if (car.bodyType === "suv" || car.bodyType === "van" || /sienna|odyssey|pilot|highlander|telluride|palisade|suburban|tahoe/i.test(combined)) tags.add("family");
  if ((car.mpgCity ?? 0) >= 30 || (car.mpgHighway ?? 0) >= 35 || ["Hybrid", "Electric"].includes(car.fuelType ?? "")) tags.add("economical");
  if ((car.horsepower ?? 0) >= 300 || /m3|m4|amg|srt|hellcat|corvette|mustang|camaro|911|cayman|boxster|supra|brz|gr86|integra|civic si|gti|type r|wrx|veloster n|elantra n|stinger/i.test(combined)) {
    tags.add("performance");
    tags.add("enthusiast");
  }
  if (/wrangler|bronco|4runner|land cruiser|defender|rubicon|trailhawk/i.test(combined) || car.drivetrain === "Four-wheel Drive") tags.add("off-road");
  if (car.bodyType === "truck" || /transit|sprinter|express|promaster/i.test(combined)) tags.add("work-truck");
  if ((car.mileage ?? Number.MAX_SAFE_INTEGER) < 90000 && (car.price ?? Number.MAX_SAFE_INTEGER) < 35000) tags.add("daily-driver");
  if (tags.size === 0) tags.add("daily-driver");
  return [...tags].sort();
}
