import type { CandidateSet, Car, CarStore, ExecutionContext, LogicalPlan, PlanOperator, SearchBackend, SearchIntent, SearchResult, SortMode } from "./types.js";
import { formatOperator } from "./planner.js";

type RangeField = "price" | "year" | "mileage" | "horsepower" | "mpg";

export class InMemoryBackend implements SearchBackend {
  constructor(private readonly store: CarStore) {}

  execute(operator: PlanOperator, candidates: CandidateSet, context: ExecutionContext): CandidateSet {
    const before = candidates.ids.size;
    const start = performance.now();
    let result = candidates;
    switch (operator.type) {
      case "CountryFilterOperator":
        result = this.categoryFilter(candidates, this.store.index.byCountry, values(operator), context, "Country", (car) => car.brandCountry);
        break;
      case "BrandFilterOperator":
        result = this.categoryFilter(candidates, this.store.index.byBrand, values(operator), context, "Brand", (car) => car.manufacturer);
        break;
      case "ModelFilterOperator":
        result = this.modelFilter(candidates, values(operator), context);
        break;
      case "BodyTypeFilterOperator":
        result = this.categoryFilter(candidates, this.store.index.byBodyType, values(operator), context, "Body Type", (car) => car.bodyType);
        break;
      case "FuelTypeFilterOperator":
        result = this.categoryFilter(candidates, this.store.index.byFuelType, values(operator), context, "Fuel Type", (car) => car.fuelType);
        break;
      case "TransmissionFilterOperator":
        result = this.categoryFilter(candidates, this.store.index.byTransmission, values(operator), context, "Transmission", (car) => car.transmission);
        break;
      case "DrivetrainFilterOperator":
        result = this.categoryFilter(candidates, this.store.index.byDrivetrain, values(operator), context, "Drivetrain", (car) => car.drivetrain);
        break;
      case "ColorFilterOperator":
        result = this.categoryFilter(candidates, this.store.index.byColor, values(operator), context, "Color", (car) => car.exteriorColor);
        break;
      case "ExcludeBrandOperator":
        result = this.excludeIndexFilter(candidates, this.store.index.byBrand, values(operator), context, "Not Brand");
        break;
      case "ExcludeCountryOperator":
        result = this.excludeIndexFilter(candidates, this.store.index.byCountry, values(operator), context, "Not Country");
        break;
      case "ExcludeBodyTypeOperator":
        result = this.excludeIndexFilter(candidates, this.store.index.byBodyType, values(operator), context, "Not Body Type");
        break;
      case "ExcludeFuelTypeOperator":
        result = this.excludeIndexFilter(candidates, this.store.index.byFuelType, values(operator), context, "Not Fuel Type");
        break;
      case "ExcludeColorOperator":
        result = this.excludeIndexFilter(candidates, this.store.index.byColor, values(operator), context, "Not Color");
        break;
      case "TagFilterOperator":
        result = this.tagFilter(candidates, values(operator), context);
        break;
      case "BooleanFilterOperator":
        result = this.booleanFilter(candidates, operator, context);
        break;
      case "PriceRangeOperator":
        result = this.rangeFilter(candidates, operator, "price", context);
        break;
      case "YearRangeOperator":
        result = this.rangeFilter(candidates, operator, "year", context);
        break;
      case "MileageRangeOperator":
        result = this.rangeFilter(candidates, operator, "mileage", context);
        break;
      case "HorsepowerRangeOperator":
        result = this.rangeFilter(candidates, operator, "horsepower", context);
        break;
      case "MpgRangeOperator":
        result = this.rangeFilter(candidates, operator, "mpg", context);
        break;
      case "RankOperator":
        scoreCandidates([...candidates.ids].map((id) => this.store.byId.get(id)!), context);
        break;
      case "TakeOperator":
        result = this.take(candidates, operator, context);
        break;
    }
    context.trace.push({ operator: formatOperator(operator), before, after: result.ids.size, elapsedMs: Number((performance.now() - start).toFixed(3)) });
    return result;
  }

  private categoryFilter(candidates: CandidateSet, index: Map<string, Set<string>>, wanted: string[], context: ExecutionContext, label: string, getActual: (car: Car) => string | null): CandidateSet {
    const allowed = union(wanted.map((value) => index.get(value.toLowerCase()) ?? new Set<string>()));
    const ids = intersect(candidates.ids, allowed);
    for (const id of ids) {
      const actual = getActual(this.store.byId.get(id)!);
      if (actual) addMeta(context.matchedFilters, id, `${label}: ${actual}`);
    }
    return { ids };
  }

  private excludeIndexFilter(candidates: CandidateSet, index: Map<string, Set<string>>, unwanted: string[], context: ExecutionContext, label: string): CandidateSet {
    const blocked = union(unwanted.map((value) => index.get(value.toLowerCase()) ?? new Set<string>()));
    const ids = new Set<string>();
    for (const id of candidates.ids) {
      if (!blocked.has(id)) {
        ids.add(id);
        addMeta(context.matchedFilters, id, `${label}: ${unwanted.join(", ")}`);
      }
    }
    return { ids };
  }

  private modelFilter(candidates: CandidateSet, wanted: string[], context: ExecutionContext): CandidateSet {
    const tokens = wanted.flatMap((value) => value.toLowerCase().match(/[a-z0-9]+/g) ?? []);
    const ids = new Set<string>();
    for (const id of candidates.ids) {
      const car = this.store.byId.get(id)!;
      const haystack = `${car.manufacturer ?? ""} ${car.model ?? ""}`.toLowerCase();
      if (tokens.every((token) => haystack.includes(token))) {
        ids.add(id);
        addMeta(context.matchedFilters, id, `Model: ${wanted.join(" ")}`);
      }
    }
    return { ids };
  }

  private tagFilter(candidates: CandidateSet, wanted: string[], context: ExecutionContext): CandidateSet {
    const allowed = union(wanted.map((value) => this.store.index.byTag.get(value.toLowerCase()) ?? new Set<string>()));
    const ids = intersect(candidates.ids, allowed);
    for (const id of ids) {
      const car = this.store.byId.get(id)!;
      const actualMatches = wanted.filter((tag) => car.tags.includes(tag.toLowerCase()));
      addMeta(context.matchedFilters, id, ...actualMatches.map((tag) => `Tag: ${tag}`));
    }
    return { ids };
  }

  private booleanFilter(candidates: CandidateSet, operator: PlanOperator, context: ExecutionContext): CandidateSet {
    const { field, value } = operator.args as { field: string; value: boolean };
    const indexed = this.store.index.byBoolean.get(field)?.get(String(value)) ?? new Set<string>();
    const ids = intersect(candidates.ids, indexed);
    for (const id of ids) addMeta(context.matchedFilters, id, `${field}: ${value}`);
    return { ids };
  }

  private rangeFilter(candidates: CandidateSet, operator: PlanOperator, field: RangeField, context: ExecutionContext): CandidateSet {
    const { min, max } = operator.args as { min?: number; max?: number };
    const ids = new Set<string>();
    for (const id of candidates.ids) {
      const car = this.store.byId.get(id)!;
      const value = field === "mpg" ? car.mpgHighway : car[field];
      if (typeof value === "number" && (min === undefined || value >= min) && (max === undefined || value <= max)) {
        ids.add(id);
        addMeta(context.matchedFilters, id, `${field}: ${min ?? "*"}..${max ?? "*"}`);
      }
    }
    return { ids };
  }

  private take(candidates: CandidateSet, operator: PlanOperator, context: ExecutionContext): CandidateSet {
    const { limit } = operator.args as { limit: number };
    const sorted = [...candidates.ids].sort((a, b) => (context.scores.get(b) ?? 0) - (context.scores.get(a) ?? 0) || a.localeCompare(b));
    return { ids: new Set(sorted.slice(0, limit)) };
  }
}

export function executeSearch(store: CarStore, query: string, intent: SearchIntent, plan: LogicalPlan): SearchResult[] {
  const primary = executePlan(store, query, intent, plan);
  if (primary.length > 0 || !plan.operators.some((operator) => ["BodyTypeFilterOperator", "TagFilterOperator"].includes(operator.type))) return primary;
  const relaxedPlan = {
    ...plan,
    queryId: `${plan.queryId}-R`,
    operators: plan.operators.filter((operator) => !["BodyTypeFilterOperator", "TagFilterOperator"].includes(operator.type))
  };
  const relaxed = executePlan(store, query, intent, relaxedPlan);
  const relaxStep = {
    operator: "relax(bodyType, tag)",
    before: 0,
    after: relaxed.length,
    elapsedMs: 0,
    note: "No exact candidates; relaxed semantic/body preference filters while preserving hard exclusions."
  };
  for (const result of relaxed) {
    result.executionTrace = [relaxStep, ...result.executionTrace];
    result.explanationBullets.unshift("No exact match; relaxed body/tag preferences while preserving hard exclusions.");
  }
  return relaxed;
}

function executePlan(store: CarStore, query: string, intent: SearchIntent, plan: LogicalPlan): SearchResult[] {
  const context: ExecutionContext = {
    query,
    intent,
    queryId: plan.queryId,
    plan,
    trace: [],
    matchedFilters: new Map(),
    rankingSignals: new Map(),
    scoreBreakdowns: new Map(),
    scores: new Map()
  };
  const backend = new InMemoryBackend(store);
  let candidates: CandidateSet = { ids: new Set(store.index.allIds) };
  for (const operator of plan.operators) candidates = backend.execute(operator, candidates, context);
  return [...candidates.ids].filter((id) => satisfiesIntent(store.byId.get(id)!, intent)).map((id) => {
    const car = store.byId.get(id)!;
    return {
      car,
      score: Number((context.scores.get(id) ?? 0).toFixed(2)),
      matchedFilters: context.matchedFilters.get(id) ?? [],
      rankingSignals: context.rankingSignals.get(id) ?? [],
      scoreBreakdown: context.scoreBreakdowns.get(id) ?? [],
      validation: validateResult(car, intent),
      queryId: plan.queryId,
      logicalPlan: plan,
      executionTrace: [...context.trace],
      explanationBullets: explain(car, context)
    };
  });
}

function satisfiesIntent(car: Car, intent: SearchIntent): boolean {
  if (intent.brands?.value.length && !intent.brands.value.some((brand) => car.manufacturer?.toLowerCase() === brand.toLowerCase())) return false;
  if (intent.countries?.value.length && !intent.countries.value.some((country) => car.brandCountry?.toLowerCase() === country.toLowerCase())) return false;
  if (intent.fuelTypes?.value.length && !intent.fuelTypes.value.some((fuel) => car.fuelType?.toLowerCase() === fuel.toLowerCase())) return false;
  if (intent.transmissions?.value.length && !intent.transmissions.value.some((transmission) => car.transmission?.toLowerCase() === transmission.toLowerCase())) return false;
  if (intent.drivetrains?.value.length && !intent.drivetrains.value.some((drivetrain) => car.drivetrain?.toLowerCase() === drivetrain.toLowerCase())) return false;
  if (intent.excludeBrands?.value.some((brand) => car.manufacturer?.toLowerCase() === brand.toLowerCase())) return false;
  if (intent.excludeCountries?.value.some((country) => car.brandCountry?.toLowerCase() === country.toLowerCase())) return false;
  if (intent.excludeBodyTypes?.value.some((bodyType) => car.bodyType.toLowerCase() === bodyType.toLowerCase())) return false;
  if (intent.excludeFuelTypes?.value.some((fuel) => car.fuelType?.toLowerCase() === fuel.toLowerCase())) return false;
  if (intent.excludeColors?.value.some((color) => car.exteriorColor?.toLowerCase().includes(color.toLowerCase()))) return false;
  if (intent.colors?.value?.length && !intent.colors.value.some((color) => car.exteriorColor?.toLowerCase().includes(color.toLowerCase()))) return false;
  if (intent.price?.max?.value !== undefined && (car.price === null || car.price > intent.price.max.value)) return false;
  if (intent.price?.min?.value !== undefined && (car.price === null || car.price < intent.price.min.value)) return false;
  if (intent.year?.max?.value !== undefined && (car.year === null || car.year > intent.year.max.value)) return false;
  if (intent.year?.min?.value !== undefined && (car.year === null || car.year < intent.year.min.value)) return false;
  if (intent.mileage?.max?.value !== undefined && (car.mileage === null || car.mileage > intent.mileage.max.value)) return false;
  if (intent.mileage?.min?.value !== undefined && (car.mileage === null || car.mileage < intent.mileage.min.value)) return false;
  if (intent.horsepower?.max?.value !== undefined && (car.horsepower === null || car.horsepower > intent.horsepower.max.value)) return false;
  if (intent.horsepower?.min?.value !== undefined && (car.horsepower === null || car.horsepower < intent.horsepower.min.value)) return false;
  if (intent.mpg?.max?.value !== undefined && (car.mpgHighway === null || car.mpgHighway > intent.mpg.max.value)) return false;
  if (intent.mpg?.min?.value !== undefined && (car.mpgHighway === null || car.mpgHighway < intent.mpg.min.value)) return false;
  for (const [field, expected] of Object.entries(intent.booleans ?? {})) {
    if ((car as unknown as Record<string, unknown>)[field] !== expected.value) return false;
  }
  return true;
}

function validateResult(car: Car, intent: SearchIntent): { hardFiltersSatisfied: boolean; violations: string[] } {
  const violations: string[] = [];
  const fail = (message: string) => violations.push(message);

  if (intent.brands?.value.length && !intent.brands.value.some((brand) => car.manufacturer?.toLowerCase() === brand.toLowerCase())) fail("brand");
  if (intent.countries?.value.length && !intent.countries.value.some((country) => car.brandCountry?.toLowerCase() === country.toLowerCase())) fail("country");
  if (intent.fuelTypes?.value.length && !intent.fuelTypes.value.some((fuel) => car.fuelType?.toLowerCase() === fuel.toLowerCase())) fail("fuel type");
  if (intent.transmissions?.value.length && !intent.transmissions.value.some((transmission) => car.transmission?.toLowerCase() === transmission.toLowerCase())) fail("transmission");
  if (intent.drivetrains?.value.length && !intent.drivetrains.value.some((drivetrain) => car.drivetrain?.toLowerCase() === drivetrain.toLowerCase())) fail("drivetrain");
  if (intent.colors?.value.length && !intent.colors.value.some((color) => car.exteriorColor?.toLowerCase().includes(color.toLowerCase()))) fail("color");
  if (intent.excludeBrands?.value.some((brand) => car.manufacturer?.toLowerCase() === brand.toLowerCase())) fail("excluded brand");
  if (intent.excludeCountries?.value.some((country) => car.brandCountry?.toLowerCase() === country.toLowerCase())) fail("excluded country");
  if (intent.excludeBodyTypes?.value.some((bodyType) => car.bodyType.toLowerCase() === bodyType.toLowerCase())) fail("excluded body type");
  if (intent.excludeFuelTypes?.value.some((fuel) => car.fuelType?.toLowerCase() === fuel.toLowerCase())) fail("excluded fuel type");
  if (intent.excludeColors?.value.some((color) => car.exteriorColor?.toLowerCase().includes(color.toLowerCase()))) fail("excluded color");
  if (intent.price?.max?.value !== undefined && (car.price === null || car.price > intent.price.max.value)) fail("max price");
  if (intent.price?.min?.value !== undefined && (car.price === null || car.price < intent.price.min.value)) fail("min price");
  if (intent.year?.max?.value !== undefined && (car.year === null || car.year > intent.year.max.value)) fail("max year");
  if (intent.year?.min?.value !== undefined && (car.year === null || car.year < intent.year.min.value)) fail("min year");
  if (intent.mileage?.max?.value !== undefined && (car.mileage === null || car.mileage > intent.mileage.max.value)) fail("max mileage");
  if (intent.mileage?.min?.value !== undefined && (car.mileage === null || car.mileage < intent.mileage.min.value)) fail("min mileage");

  return { hardFiltersSatisfied: violations.length === 0, violations };
}

function scoreCandidates(cars: Car[], context: ExecutionContext): void {
  const sort = context.intent.sort?.value ?? "relevance";
  for (const car of cars) {
    let score = 50;
    const signals: string[] = [];
    const breakdown: Array<{ label: string; value: number }> = [{ label: "Base relevance", value: 50 }];
    const addScore = (label: string, value: number) => {
      if (value === 0) return;
      score += value;
      breakdown.push({ label, value: Number(value.toFixed(2)) });
    };
    const requestedTags = context.intent.tags?.value ?? [];
    for (const tag of requestedTags) {
      if (car.tags.includes(tag.toLowerCase())) {
        addScore(`${title(tag)} tag`, tagWeight(tag));
        signals.push(`${title(tag)} Tag`);
      }
    }
    if (requestedTags.includes("family") && !car.tags.includes("family")) addScore("Missing family tag", -20);
    if (requestedTags.includes("performance") || requestedTags.includes("enthusiast")) {
      const boost = sportsModelBoost(car);
      if (boost > 0) {
        addScore("Sports model match", boost);
        signals.push("Sports Model Match");
      }
      if (car.bodyType === "coupe" || car.bodyType === "convertible") {
        addScore("Sports body style", 14);
        signals.push("Sports Body Style");
      }
    }
    for (const tag of context.intent.softTags?.value ?? []) {
      if (car.tags.includes(tag.toLowerCase())) {
        addScore(`${title(tag)} preference`, 8);
        signals.push(`${title(tag)} Preference`);
      }
    }
    for (const [index, country] of (context.intent.preferredCountries?.value ?? []).entries()) {
      if (car.brandCountry?.toLowerCase() === country.toLowerCase()) {
        addScore(`${country} preference`, Math.max(4, 10 - index * 3));
        signals.push(`${country} Preference`);
      }
    }
    if (car.sellerRating !== null) {
      addScore("Seller rating", car.sellerRating * 2);
      if (car.sellerRating >= 4.5) signals.push("High Seller Rating");
    }
    if (car.driverRating !== null) {
      addScore("Driver rating", car.driverRating * 3);
      if (car.driverRating >= 4.5) signals.push("High Driver Rating");
    }
    if (car.accidentsOrDamage === false) {
      addScore("Clean history", 4);
      signals.push("Clean History");
    }
    if (car.mileage !== null) addScore("Low mileage", Math.max(0, 10 - car.mileage / 20000));
    if (car.year !== null) addScore("Model year", Math.max(0, car.year - 2012) * 0.8);
    if (car.mpgHighway !== null) addScore("Highway MPG", Math.min(8, car.mpgHighway / 8));
    if (car.price !== null && context.intent.price?.max?.value) addScore("Price fit", Math.max(0, 8 - (context.intent.price.max.value - car.price) / context.intent.price.max.value));
    score = applySortPrimary(score, car, sort);
    context.scores.set(car.id, score);
    context.rankingSignals.set(car.id, signals.slice(0, 6));
    context.scoreBreakdowns.set(car.id, breakdown.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 8));
  }
}

function applySortPrimary(relevance: number, car: Car, sort: SortMode): number {
  if (sort === "price_asc") return (car.price === null ? 0 : 1_000_000 - car.price) + relevance / 100;
  if (sort === "price_desc") return (car.price ?? 0) + relevance / 100;
  if (sort === "year_desc") return (car.year ?? 0) * 100 + relevance / 100;
  if (sort === "mileage_asc") return (car.mileage === null ? 0 : 1_000_000 - car.mileage) + relevance / 100;
  if (sort === "mpg_desc") return (car.mpgHighway ?? 0) * 100 + relevance / 100;
  if (sort === "horsepower_desc") return (car.horsepower ?? 0) * 100 + relevance / 100;
  if (sort === "rating_desc") return (car.driverRating ?? car.sellerRating ?? 0) * 100 + relevance / 100;
  return relevance;
}

function explain(car: Car, context: ExecutionContext): string[] {
  const bullets = [...(context.matchedFilters.get(car.id) ?? []).map((m) => m.startsWith("Not ") ? `Satisfied ${m}` : `Matched ${m}`)];
  for (const signal of context.rankingSignals.get(car.id) ?? []) bullets.push(`Ranked higher for ${signal}`);
  if (car.brandCountry) bullets.push(`Graph relationship: ${car.manufacturer} -> ${car.brandCountry}`);
  return bullets.slice(0, 8);
}

function values(operator: PlanOperator): string[] {
  return ((operator.args as { values?: string[] }).values ?? []).map(String);
}

function union(sets: Set<string>[]): Set<string> {
  const out = new Set<string>();
  for (const set of sets) for (const value of set) out.add(value);
  return out;
}

function intersect(left: Set<string>, right: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const value of left) if (right.has(value)) out.add(value);
  return out;
}

function addMeta(map: Map<string, string[]>, id: string, ...values: string[]): void {
  if (!map.has(id)) map.set(id, []);
  map.get(id)!.push(...values);
}

function title(value: string): string {
  return value.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function tagWeight(tag: string): number {
  if (tag === "family") return 22;
  if (tag === "comfortable") return 14;
  if (tag === "reliable") return 14;
  if (tag === "economical") return 12;
  if (tag === "daily-driver") return 10;
  if (tag === "performance") return 9;
  if (tag === "enthusiast") return 7;
  return 10;
}

function sportsModelBoost(car: Car): number {
  const name = `${car.manufacturer ?? ""} ${car.model ?? ""}`;
  if (/\b(corvette|911|cayman|boxster|supra|miata|mx-5|brz|gr86)\b/i.test(name)) return 24;
  if (/\b(mustang|camaro|challenger|charger|wrx|civic si|type r|gti|stinger)\b/i.test(name)) return 18;
  if (/\b(m3|m4|amg|srt|hellcat|rs|v-series)\b/i.test(name)) return 16;
  if (/\bintegra\b/i.test(name)) return 8;
  return 0;
}
