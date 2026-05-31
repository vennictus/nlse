import OpenAI from "openai";
import { z } from "zod";
import { compileLocalIntent } from "./intent-local.js";
import { applyLocalGuardrails } from "./intent-normalizer.js";
import { field } from "./intent-utils.js";
import type { SearchIntent } from "./types.js";

const intentStringArrayField = z.object({
  value: z.array(z.string()),
  confidence: z.number(),
  source: z.enum(["explicit", "inferred", "rewritten"])
});

export const searchIntentSchema = z.object({
  originalQuery: z.string(),
  rewrittenQuery: z.string().optional(),
  brands: intentStringArrayField.optional(),
  models: intentStringArrayField.optional(),
  countries: intentStringArrayField.optional(),
  bodyTypes: intentStringArrayField.optional(),
  fuelTypes: intentStringArrayField.optional(),
  transmissions: intentStringArrayField.optional(),
  drivetrains: intentStringArrayField.optional(),
  colors: intentStringArrayField.optional(),
  tags: intentStringArrayField.optional(),
  booleans: z.record(z.object({ value: z.boolean(), confidence: z.number(), source: z.enum(["explicit", "inferred", "rewritten"]) })).optional(),
  excludeBrands: intentStringArrayField.optional(),
  excludeCountries: intentStringArrayField.optional(),
  excludeBodyTypes: intentStringArrayField.optional(),
  excludeFuelTypes: intentStringArrayField.optional(),
  excludeColors: intentStringArrayField.optional(),
  preferredCountries: intentStringArrayField.optional(),
  softTags: intentStringArrayField.optional(),
  price: z.object({ min: z.any().optional(), max: z.any().optional() }).optional(),
  year: z.object({ min: z.any().optional(), max: z.any().optional() }).optional(),
  mileage: z.object({ min: z.any().optional(), max: z.any().optional() }).optional(),
  horsepower: z.object({ min: z.any().optional(), max: z.any().optional() }).optional(),
  mpg: z.object({ min: z.any().optional(), max: z.any().optional() }).optional(),
  sort: z.object({ value: z.string(), confidence: z.number(), source: z.enum(["explicit", "inferred", "rewritten"]) }).optional(),
  limit: z.object({ value: z.number(), confidence: z.number(), source: z.enum(["explicit", "inferred", "rewritten"]) }).optional(),
  confidence: z.number(),
  notes: z.array(z.string())
});

export function localParseIntent(query: string, limit?: number): SearchIntent {
  return compileLocalIntent(query, limit);
}

export async function parseIntent(query: string, limit?: number): Promise<SearchIntent> {
  if (process.env.OPENAI_API_KEY) {
    try {
      return await parseIntentWithOpenAI(query, limit);
    } catch (error) {
      return fallbackAfterProviderError(query, limit, "OpenAI", error);
    }
  }
  if (process.env.OPENROUTER_API_KEY) {
    try {
      return await parseIntentWithOpenRouter(query, limit);
    } catch (error) {
      return fallbackAfterProviderError(query, limit, "OpenRouter", error);
    }
  }
  return compileLocalIntent(query, limit);
}

function fallbackAfterProviderError(query: string, limit: number | undefined, provider: string, error: unknown): SearchIntent {
  const intent = compileLocalIntent(query, limit);
  const message = error instanceof Error ? error.message : String(error);
  intent.notes = [...intent.notes, `${provider} intent parsing failed; used deterministic local parser fallback. ${message}`];
  return intent;
}

async function parseIntentWithOpenAI(query: string, limit?: number): Promise<SearchIntent> {
  const client = new OpenAI();
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: "Extract car search intent as JSON only. Do not recommend cars. Do not fabricate dataset values. Map vague language into tags, filters, exclusions, preferences, and notes."
      },
      { role: "user", content: query }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "SearchIntent",
        strict: true,
        schema: providerIntentSchema
      }
    }
  });
  const parsed = searchIntentSchema.passthrough().parse(stripNulls(JSON.parse(response.output_text))) as SearchIntent;
  const guarded = applyLocalGuardrails(query, parsed, limit);
  guarded.notes = [...guarded.notes, `Parsed by OpenAI model ${process.env.OPENAI_MODEL ?? "gpt-4.1-mini"}.`];
  if (limit) guarded.limit = field(limit);
  return guarded;
}

async function parseIntentWithOpenRouter(query: string, limit?: number): Promise<SearchIntent> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_APP_NAME ?? "Car NLSE"
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
      require_parameters: true,
      messages: [
        {
          role: "system",
          content: [
            "You are the intent parser for a retrieval-first car search engine.",
            "Return JSON only, matching the schema.",
            "Do not recommend cars, rank cars, or invent dataset values.",
            "Hard filters are only for explicit requirements.",
            "Use exclusions for negative constraints.",
            "Use tags/softTags for vague goals.",
            "Country means manufacturer origin.",
            "Supported tags: luxury, reliable, comfortable, performance, daily-driver, family, economical, enthusiast, off-road, work-truck.",
            "Supported bodyTypes: sedan, suv, truck, coupe, convertible, van, wagon, hatchback."
          ].join(" ")
        },
        { role: "user", content: query }
      ],
      temperature: 0.1,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "SearchIntent",
          strict: true,
          schema: providerIntentSchema
        }
      }
    })
  });
  if (!response.ok) throw new Error(`OpenRouter intent parse failed: ${response.status} ${await response.text()}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter intent parse failed: empty response content");
  const parsed = searchIntentSchema.passthrough().parse(stripNulls(JSON.parse(content))) as SearchIntent;
  const guarded = applyLocalGuardrails(query, parsed, limit);
  guarded.notes = [...guarded.notes, `Parsed by OpenRouter model ${process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini"}.`];
  if (limit) guarded.limit = field(limit);
  return guarded;
}

const providerIntentSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "originalQuery",
    "rewrittenQuery",
    "brands",
    "models",
    "countries",
    "bodyTypes",
    "fuelTypes",
    "transmissions",
    "drivetrains",
    "colors",
    "tags",
    "softTags",
    "excludeBrands",
    "excludeCountries",
    "excludeBodyTypes",
    "excludeFuelTypes",
    "excludeColors",
    "preferredCountries",
    "booleans",
    "price",
    "year",
    "mileage",
    "horsepower",
    "mpg",
    "sort",
    "limit",
    "confidence",
    "notes"
  ],
  properties: {
    originalQuery: { type: "string" },
    rewrittenQuery: nullable({ type: "string" }),
    brands: stringArrayField(),
    models: stringArrayField(),
    countries: stringArrayField(),
    bodyTypes: stringArrayField(),
    fuelTypes: stringArrayField(),
    transmissions: stringArrayField(),
    drivetrains: stringArrayField(),
    colors: stringArrayField(),
    tags: stringArrayField(),
    softTags: stringArrayField(),
    excludeBrands: stringArrayField(),
    excludeCountries: stringArrayField(),
    excludeBodyTypes: stringArrayField(),
    excludeFuelTypes: stringArrayField(),
    excludeColors: stringArrayField(),
    preferredCountries: stringArrayField(),
    booleans: nullable({
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: ["value", "confidence", "source"],
        properties: {
          value: { type: "boolean" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          source: { type: "string", enum: ["explicit", "inferred", "rewritten"] }
        }
      }
    }),
    price: rangeField(),
    year: rangeField(),
    mileage: rangeField(),
    horsepower: rangeField(),
    mpg: rangeField(),
    sort: nullable({
      type: "object",
      additionalProperties: false,
      required: ["value", "confidence", "source"],
      properties: {
        value: { type: "string", enum: ["relevance", "price_asc", "price_desc", "year_desc", "mileage_asc", "mpg_desc", "horsepower_desc", "rating_desc"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        source: { type: "string", enum: ["explicit", "inferred", "rewritten"] }
      }
    }),
    limit: nullable({
      type: "object",
      additionalProperties: false,
      required: ["value", "confidence", "source"],
      properties: {
        value: { type: "integer", minimum: 1, maximum: 50 },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        source: { type: "string", enum: ["explicit", "inferred", "rewritten"] }
      }
    }),
    confidence: { type: "number", minimum: 0, maximum: 1 },
    notes: { type: "array", items: { type: "string" } }
  }
};

function stringArrayField() {
  return nullable({
    type: "object",
    additionalProperties: false,
    required: ["value", "confidence", "source"],
    properties: {
      value: { type: "array", items: { type: "string" } },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      source: { type: "string", enum: ["explicit", "inferred", "rewritten"] }
    }
  });
}

function numberField() {
  return nullable({
    type: "object",
    additionalProperties: false,
    required: ["value", "confidence", "source"],
    properties: {
      value: { type: "number" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      source: { type: "string", enum: ["explicit", "inferred", "rewritten"] }
    }
  });
}

function rangeField() {
  return nullable({
    type: "object",
    additionalProperties: false,
    required: ["min", "max"],
    properties: {
      min: numberField(),
      max: numberField()
    }
  });
}

function nullable(schema: Record<string, unknown>) {
  return { anyOf: [{ type: "null" }, schema] };
}

function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== null)
      .map(([key, entry]) => [key, stripNulls(entry)])
  );
}
