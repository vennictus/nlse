export type IntentSource = "explicit" | "inferred" | "rewritten";

export interface IntentField<T> {
  value: T;
  confidence: number;
  source: IntentSource;
}

export interface RangeIntent {
  min?: IntentField<number>;
  max?: IntentField<number>;
}

export interface SearchIntent {
  originalQuery: string;
  rewrittenQuery?: string;
  brands?: IntentField<string[]>;
  models?: IntentField<string[]>;
  countries?: IntentField<string[]>;
  bodyTypes?: IntentField<string[]>;
  fuelTypes?: IntentField<string[]>;
  transmissions?: IntentField<string[]>;
  drivetrains?: IntentField<string[]>;
  colors?: IntentField<string[]>;
  tags?: IntentField<string[]>;
  booleans?: Record<string, IntentField<boolean>>;
  excludeBrands?: IntentField<string[]>;
  excludeCountries?: IntentField<string[]>;
  excludeBodyTypes?: IntentField<string[]>;
  excludeFuelTypes?: IntentField<string[]>;
  excludeColors?: IntentField<string[]>;
  preferredCountries?: IntentField<string[]>;
  softTags?: IntentField<string[]>;
  price?: RangeIntent;
  year?: RangeIntent;
  mileage?: RangeIntent;
  horsepower?: RangeIntent;
  mpg?: RangeIntent;
  sort?: IntentField<SortMode>;
  limit?: IntentField<number>;
  confidence: number;
  notes: string[];
}

export interface InterpretationReport {
  hardFilters: string[];
  exclusions: string[];
  preferences: string[];
  unsupported: string[];
  rewrites: string[];
}

export type SortMode =
  | "relevance"
  | "price_asc"
  | "price_desc"
  | "year_desc"
  | "mileage_asc"
  | "mpg_desc"
  | "horsepower_desc"
  | "rating_desc";

export interface Car {
  id: string;
  rowNumber: number;
  raw: Record<string, string | null>;
  manufacturer: string | null;
  model: string | null;
  year: number | null;
  mileage: number | null;
  engine: string | null;
  transmission: string | null;
  drivetrain: string | null;
  fuelType: string | null;
  mpgCity: number | null;
  mpgHighway: number | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  accidentsOrDamage: boolean | null;
  oneOwner: boolean | null;
  personalUseOnly: boolean | null;
  sellerName: string | null;
  sellerRating: number | null;
  driverRating: number | null;
  driverReviewsNum: number | null;
  priceDrop: number | null;
  price: number | null;
  horsepower: number | null;
  bodyType: string;
  brandCountry: string | null;
  tags: string[];
}

export interface PlanOperator {
  type: string;
  args: unknown;
}

export interface PlanEstimate {
  operatorIndex: number;
  estimatedCandidates: number;
}

export interface LogicalPlan {
  queryId: string;
  operators: PlanOperator[];
  estimates: PlanEstimate[];
}

export interface CandidateSet {
  ids: Set<string>;
}

export interface TraceStep {
  operator: string;
  before: number;
  after: number;
  elapsedMs: number;
  note?: string;
}

export interface ExecutionContext {
  query: string;
  intent: SearchIntent;
  queryId: string;
  plan: LogicalPlan;
  trace: TraceStep[];
  matchedFilters: Map<string, string[]>;
  rankingSignals: Map<string, string[]>;
  scoreBreakdowns: Map<string, ScoreContribution[]>;
  scores: Map<string, number>;
}

export interface SearchBackend {
  execute(operator: PlanOperator, candidates: CandidateSet, context: ExecutionContext): CandidateSet;
}

export interface SearchResult {
  car: Car;
  score: number;
  matchedFilters: string[];
  rankingSignals: string[];
  scoreBreakdown: ScoreContribution[];
  validation: ResultValidation;
  queryId: string;
  logicalPlan: LogicalPlan;
  executionTrace: TraceStep[];
  explanationBullets: string[];
}

export interface ScoreContribution {
  label: string;
  value: number;
}

export interface ResultValidation {
  hardFiltersSatisfied: boolean;
  violations: string[];
}

export interface CarIndex {
  allIds: Set<string>;
  byBrand: Map<string, Set<string>>;
  byModelToken: Map<string, Set<string>>;
  byCountry: Map<string, Set<string>>;
  byBodyType: Map<string, Set<string>>;
  byFuelType: Map<string, Set<string>>;
  byTransmission: Map<string, Set<string>>;
  byDrivetrain: Map<string, Set<string>>;
  byColor: Map<string, Set<string>>;
  byTag: Map<string, Set<string>>;
  byBoolean: Map<string, Map<string, Set<string>>>;
}

export interface CarStore {
  cars: Car[];
  byId: Map<string, Car>;
  index: CarIndex;
  graph: RelationshipGraph;
}

export interface RelationshipGraph {
  carEdges: Map<string, string[]>;
  entityEdges: Map<string, string[]>;
}
