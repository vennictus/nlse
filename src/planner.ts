import { createHash } from "node:crypto";
import type { CarStore, LogicalPlan, PlanOperator, SearchIntent } from "./types.js";

export function createLogicalPlan(intent: SearchIntent, store: CarStore): LogicalPlan {
  const operators: PlanOperator[] = [];
  addValues(operators, "CountryFilterOperator", intent.countries?.value);
  addValues(operators, "BrandFilterOperator", intent.brands?.value);
  addValues(operators, "ModelFilterOperator", intent.models?.value);
  addValues(operators, "BodyTypeFilterOperator", intent.bodyTypes?.value);
  addValues(operators, "FuelTypeFilterOperator", intent.fuelTypes?.value);
  addValues(operators, "TransmissionFilterOperator", intent.transmissions?.value);
  addValues(operators, "DrivetrainFilterOperator", intent.drivetrains?.value);
  addValues(operators, "ColorFilterOperator", intent.colors?.value);
  addValues(operators, "ExcludeBrandOperator", intent.excludeBrands?.value);
  addValues(operators, "ExcludeCountryOperator", intent.excludeCountries?.value);
  addValues(operators, "ExcludeBodyTypeOperator", intent.excludeBodyTypes?.value);
  addValues(operators, "ExcludeFuelTypeOperator", intent.excludeFuelTypes?.value);
  addValues(operators, "ExcludeColorOperator", intent.excludeColors?.value);
  addRange(operators, "PriceRangeOperator", intent.price);
  addRange(operators, "YearRangeOperator", intent.year);
  addRange(operators, "MileageRangeOperator", intent.mileage);
  addRange(operators, "HorsepowerRangeOperator", intent.horsepower);
  addRange(operators, "MpgRangeOperator", intent.mpg);
  for (const [field, value] of Object.entries(intent.booleans ?? {})) operators.push({ type: "BooleanFilterOperator", args: { field, value: value.value } });
  addValues(operators, "TagFilterOperator", intent.tags?.value);

  const filterOperators = operators.sort((a, b) => estimateOperator(a, store) - estimateOperator(b, store));
  filterOperators.push({ type: "RankOperator", args: { sort: intent.sort?.value ?? "relevance" } });
  filterOperators.push({ type: "TakeOperator", args: { limit: intent.limit?.value ?? 10 } });

  const queryId = queryFingerprint(filterOperators);
  let currentEstimate = store.cars.length;
  const estimates = filterOperators.map((operator, operatorIndex) => {
    if (operator.type !== "RankOperator" && operator.type !== "TakeOperator") currentEstimate = Math.min(currentEstimate, estimateOperator(operator, store));
    return { operatorIndex, estimatedCandidates: currentEstimate };
  });
  return { queryId, operators: filterOperators, estimates };
}

function addValues(operators: PlanOperator[], type: string, values?: string[]): void {
  if (values?.length) operators.push({ type, args: { values } });
}

function addRange(operators: PlanOperator[], type: string, range?: { min?: { value: number }; max?: { value: number } }): void {
  if (range?.min || range?.max) operators.push({ type, args: { min: range.min?.value, max: range.max?.value } });
}

function estimateFromMap(map: Map<string, Set<string>>, values: string[]): number {
  return values.reduce((sum, value) => sum + (map.get(value.toLowerCase())?.size ?? 0), 0);
}

function estimateOperator(operator: PlanOperator, store: CarStore): number {
  const args = operator.args as { values?: string[]; field?: string; value?: boolean };
  if (operator.type === "CountryFilterOperator") return estimateFromMap(store.index.byCountry, args.values ?? []);
  if (operator.type === "BrandFilterOperator") return estimateFromMap(store.index.byBrand, args.values ?? []);
  if (operator.type === "BodyTypeFilterOperator") return estimateFromMap(store.index.byBodyType, args.values ?? []);
  if (operator.type === "FuelTypeFilterOperator") return estimateFromMap(store.index.byFuelType, args.values ?? []);
  if (operator.type === "TransmissionFilterOperator") return estimateFromMap(store.index.byTransmission, args.values ?? []);
  if (operator.type === "DrivetrainFilterOperator") return estimateFromMap(store.index.byDrivetrain, args.values ?? []);
  if (operator.type === "ColorFilterOperator") return estimateFromMap(store.index.byColor, args.values ?? []);
  if (operator.type === "TagFilterOperator") return estimateFromMap(store.index.byTag, args.values ?? []);
  if (operator.type === "BooleanFilterOperator") return store.index.byBoolean.get(args.field ?? "")?.get(String(args.value))?.size ?? store.cars.length;
  if (operator.type.startsWith("Exclude")) return Math.max(1, Math.floor(store.cars.length * 0.7));
  if (operator.type === "ModelFilterOperator") return Math.max(1, Math.floor(store.cars.length * 0.08));
  if (operator.type.endsWith("RangeOperator")) return Math.max(1, Math.floor(store.cars.length * 0.45));
  return store.cars.length;
}

function queryFingerprint(operators: PlanOperator[]): string {
  const canonical = JSON.stringify(operators);
  return `NLSE-${createHash("sha1").update(canonical).digest("hex").slice(0, 6).toUpperCase()}`;
}

export function formatPlan(plan: LogicalPlan): string {
  const lines = [`NLSE QUERY PLAN: ${plan.queryId}`, ""];
  plan.operators.forEach((operator, index) => {
    lines.push(`${index} | ${formatOperator(operator).padEnd(34)} estimated: ${plan.estimates[index]?.estimatedCandidates ?? "?"}`);
  });
  return lines.join("\n");
}

export function formatOperator(operator: PlanOperator): string {
  const args = operator.args as Record<string, unknown>;
  if ("values" in args) return `${operator.type.replace("FilterOperator", "").replace("Operator", "")}(${(args.values as string[]).join(", ")})`;
  if (operator.type === "BooleanFilterOperator") return `${String(args.field)}(${String(args.value)})`;
  if (operator.type === "RankOperator") return `rank(${String(args.sort)})`;
  if (operator.type === "TakeOperator") return `take(${String(args.limit)})`;
  return `${operator.type.replace("Operator", "")}(${args.min ?? "*"}..${args.max ?? "*"})`;
}

export function createRelaxedPlan(plan: LogicalPlan): LogicalPlan {
  const operators = plan.operators.filter((operator) => !["BodyTypeFilterOperator", "TagFilterOperator"].includes(operator.type));
  return {
    queryId: `${plan.queryId}-R`,
    operators,
    estimates: operators.map((_, operatorIndex) => ({ operatorIndex, estimatedCandidates: 0 }))
  };
}
