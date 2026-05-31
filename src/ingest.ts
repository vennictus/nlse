import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parse } from "csv-parse";
import { brandCountry, deriveBodyType, semanticTags } from "./ontology.js";
import type { Car, CarIndex, CarStore, RelationshipGraph } from "./types.js";

type RawRow = Record<string, string>;

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function num(value: unknown): number | null {
  const cleaned = clean(value);
  if (!cleaned) return null;
  const parsed = Number(cleaned.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(value: unknown): boolean | null {
  const parsed = num(value);
  if (parsed === null) return null;
  if (parsed === 1) return true;
  if (parsed === 0) return false;
  return null;
}

export function normalizeTransmission(value: string | null): string | null {
  if (!value) return null;
  if (/manual/i.test(value)) return "Manual";
  if (/cvt/i.test(value)) return "CVT";
  if (/automatic|a\/t/i.test(value)) return "Automatic";
  return value;
}

export function normalizeFuelType(value: string | null, model?: string | null, engine?: string | null): string | null {
  const vehicleText = `${model ?? ""} ${engine ?? ""}`;
  const fuelText = value ?? "";
  if (isPureElectric(vehicleText)) return "Electric";
  if (/plug-?in hybrid|electric\/gas/i.test(`${vehicleText} ${fuelText}`)) return "Hybrid";
  if (/hybrid/i.test(`${vehicleText} ${fuelText}`)) return "Hybrid";
  if (/electric/i.test(fuelText)) return "Electric";
  if (/diesel/i.test(fuelText)) return "Diesel";
  if (/gas/i.test(fuelText)) return "Gasoline";
  if (/flex/i.test(fuelText)) return "Flex Fuel";
  return value;
}

export function normalizeDrivetrain(value: string | null): string | null {
  if (!value) return null;
  if (/all-wheel|awd/i.test(value)) return "All-wheel Drive";
  if (/four-wheel|4wd/i.test(value)) return "Four-wheel Drive";
  if (/front-wheel|fwd/i.test(value)) return "Front-wheel Drive";
  if (/rear-wheel|rwd/i.test(value)) return "Rear-wheel Drive";
  return value;
}

export function parseMpg(value: string | null): { city: number | null; highway: number | null } {
  if (!value) return { city: null, highway: null };
  const matches = [...value.matchAll(/\d+(\.\d+)?/g)].map((m) => Number(m[0]));
  return { city: matches[0] ?? null, highway: matches[1] ?? matches[0] ?? null };
}

export function parseHorsepower(engine: string | null): number | null {
  if (!engine) return null;
  const match = engine.match(/(\d{2,4})\s*hp/i);
  return match ? Number(match[1]) : null;
}

function isPureElectric(value: string): boolean {
  return /\b(e-tron|q4 e-tron|rs e-tron|e-tron gt|tesla|model s|model 3|model x|model y|leaf|bolt ev|bolt euv|ioniq 5|ioniq 6|ev6|mach-e|taycan|id\.4|polestar|lucid|rivian)\b/i.test(value)
    || /\belectric motor\b/i.test(value)
    || /^electric$/i.test(value.trim());
}

export function normalizeCar(row: RawRow, rowNumber: number): Car {
  const mpg = parseMpg(clean(row.mpg));
  const manufacturer = clean(row.manufacturer);
  const model = clean(row.model);
  const engine = clean(row.engine);
  const base = {
    id: `car_${rowNumber}`,
    rowNumber,
    raw: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, clean(value)])),
    manufacturer,
    model,
    year: num(row.year),
    mileage: num(row.mileage),
    engine,
    transmission: normalizeTransmission(clean(row.transmission)),
    drivetrain: normalizeDrivetrain(clean(row.drivetrain)),
    fuelType: normalizeFuelType(clean(row.fuel_type), model, engine),
    mpgCity: mpg.city,
    mpgHighway: mpg.highway,
    exteriorColor: clean(row.exterior_color),
    interiorColor: clean(row.interior_color),
    accidentsOrDamage: bool(row.accidents_or_damage),
    oneOwner: bool(row.one_owner),
    personalUseOnly: bool(row.personal_use_only),
    sellerName: clean(row.seller_name),
    sellerRating: num(row.seller_rating),
    driverRating: num(row.driver_rating),
    driverReviewsNum: num(row.driver_reviews_num),
    priceDrop: num(row.price_drop),
    price: num(row.price),
    horsepower: parseHorsepower(engine),
    bodyType: deriveBodyType(model),
    brandCountry: brandCountry(manufacturer)
  };
  return { ...base, tags: semanticTags(base) };
}

function emptyIndex(): CarIndex {
  return {
    allIds: new Set(),
    byBrand: new Map(),
    byModelToken: new Map(),
    byCountry: new Map(),
    byBodyType: new Map(),
    byFuelType: new Map(),
    byTransmission: new Map(),
    byDrivetrain: new Map(),
    byColor: new Map(),
    byTag: new Map(),
    byBoolean: new Map()
  };
}

function add(map: Map<string, Set<string>>, key: string | null | undefined, id: string): void {
  if (!key) return;
  const normalized = key.toLowerCase();
  if (!map.has(normalized)) map.set(normalized, new Set());
  map.get(normalized)!.add(id);
}

function addBoolean(index: CarIndex, field: string, value: boolean | null, id: string): void {
  if (value === null) return;
  if (!index.byBoolean.has(field)) index.byBoolean.set(field, new Map());
  add(index.byBoolean.get(field)!, String(value), id);
}

function addGraphEdge(graph: RelationshipGraph, from: string, to: string): void {
  if (!graph.carEdges.has(from)) graph.carEdges.set(from, []);
  graph.carEdges.get(from)!.push(to);
  if (!graph.entityEdges.has(to)) graph.entityEdges.set(to, []);
  graph.entityEdges.get(to)!.push(from);
}

export function buildStore(cars: Car[]): CarStore {
  const index = emptyIndex();
  const byId = new Map<string, Car>();
  const graph: RelationshipGraph = { carEdges: new Map(), entityEdges: new Map() };

  for (const car of cars) {
    byId.set(car.id, car);
    index.allIds.add(car.id);
    add(index.byBrand, car.manufacturer, car.id);
    for (const token of `${car.manufacturer ?? ""} ${car.model ?? ""}`.toLowerCase().match(/[a-z0-9]+/g) ?? []) add(index.byModelToken, token, car.id);
    add(index.byCountry, car.brandCountry, car.id);
    add(index.byBodyType, car.bodyType, car.id);
    add(index.byFuelType, car.fuelType, car.id);
    add(index.byTransmission, car.transmission, car.id);
    add(index.byDrivetrain, car.drivetrain, car.id);
    add(index.byColor, car.exteriorColor, car.id);
    for (const color of baseColors(car.exteriorColor)) add(index.byColor, color, car.id);
    for (const tag of car.tags) add(index.byTag, tag, car.id);
    addBoolean(index, "accidentsOrDamage", car.accidentsOrDamage, car.id);
    addBoolean(index, "oneOwner", car.oneOwner, car.id);
    addBoolean(index, "personalUseOnly", car.personalUseOnly, car.id);

    for (const [kind, value] of [
      ["Brand", car.manufacturer],
      ["Country", car.brandCountry],
      ["BodyType", car.bodyType],
      ["FuelType", car.fuelType],
      ["Transmission", car.transmission],
      ["Drivetrain", car.drivetrain]
    ]) {
      if (value) addGraphEdge(graph, car.id, `${kind}:${value}`);
    }
    for (const tag of car.tags) addGraphEdge(graph, car.id, `Tag:${tag}`);
  }
  return { cars, byId, index, graph };
}

function baseColors(value: string | null): string[] {
  if (!value) return [];
  const colors = new Set<string>();
  const text = value.toLowerCase();
  for (const color of ["red", "black", "white", "gray", "grey", "blue", "silver", "green", "yellow", "orange", "brown", "gold"]) {
    if (new RegExp(`\\b${color}\\b`).test(text)) colors.add(color === "grey" ? "Gray" : color[0].toUpperCase() + color.slice(1));
  }
  return [...colors];
}

export async function loadCars(csvPath = "cars.csv"): Promise<CarStore> {
  const cached = await readCarCache(csvPath);
  if (cached) {
    logLoad(`Loaded ${cached.length.toLocaleString()} normalized cars from cache.`);
    return buildStore(cached);
  }

  const cars: Car[] = [];
  let rowNumber = 0;
  logLoad(`Reading ${csvPath}.`);
  const parser = createReadStream(csvPath).pipe(parse({ columns: true, skip_empty_lines: true }));
  for await (const row of parser) {
    rowNumber += 1;
    cars.push(normalizeCar(row, rowNumber));
    if (rowNumber % 100000 === 0) logLoad(`Normalized ${rowNumber.toLocaleString()} rows.`);
  }
  await writeCarCache(csvPath, cars);
  logLoad(`Loaded ${cars.length.toLocaleString()} cars from CSV.`);
  return buildStore(cars);
}

interface CarCacheFile {
  source: {
    path: string;
    size: number;
    mtimeMs: number;
  };
  cars: Car[];
}

async function readCarCache(csvPath: string): Promise<Car[] | null> {
  if (process.env.NLSE_CACHE === "0") return null;
  try {
    const source = await stat(csvPath);
    const payload = JSON.parse(await readFile(cachePath(csvPath), "utf8")) as CarCacheFile;
    if (
      payload.source.path === resolve(csvPath)
      && payload.source.size === source.size
      && payload.source.mtimeMs === source.mtimeMs
      && Array.isArray(payload.cars)
    ) {
      return payload.cars;
    }
  } catch {
    return null;
  }
  return null;
}

async function writeCarCache(csvPath: string, cars: Car[]): Promise<void> {
  if (process.env.NLSE_CACHE === "0") return;
  try {
    const source = await stat(csvPath);
    const target = cachePath(csvPath);
    await mkdir(dirname(target), { recursive: true });
    const payload: CarCacheFile = {
      source: {
        path: resolve(csvPath),
        size: source.size,
        mtimeMs: source.mtimeMs
      },
      cars
    };
    await writeFile(target, JSON.stringify(payload));
  } catch {
    // Cache failures should never prevent search from running.
  }
}

function cachePath(csvPath: string): string {
  const safeName = resolve(csvPath).replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
  return resolve(".nlse-cache", `${safeName}.cars.json`);
}

function logLoad(message: string): void {
  if (process.env.NLSE_QUIET === "1") return;
  console.error(`[car-nlse] ${message}`);
}
