import { describe, expect, it } from "vitest";
import { executeSearch } from "../src/execution.js";
import { buildStore, normalizeCar } from "../src/ingest.js";
import { localParseIntent } from "../src/intent.js";
import { createLogicalPlan } from "../src/planner.js";
import { sampleStore } from "./helpers.js";

describe("boundary intent parsing", () => {
  it("handles multiple constraints, vague language, and negative country", () => {
    const intent = localParseIntent("I want something fun for weekend drives, manual if possible, not German, preferably naturally aspirated, under $40k and not too old.");
    expect(intent.tags?.value).toEqual(expect.arrayContaining(["performance", "enthusiast"]));
    expect(intent.transmissions?.value).toEqual(["Manual"]);
    expect(intent.excludeCountries?.value).toContain("Germany");
    expect(intent.price?.max?.value).toBe(40000);
    expect(intent.year?.min?.value).toBeGreaterThanOrEqual(2016);
    expect(intent.notes.join(" ")).toContain("Naturally aspirated");
  });

  it("keeps contradictory fastest and fuel economy as a ranked tradeoff", () => {
    const intent = localParseIntent("Give me the fastest car possible under $15k with amazing fuel economy.");
    expect(intent.sort?.value).toBe("horsepower_desc");
    expect(intent.tags?.value).toEqual(expect.arrayContaining(["performance", "economical"]));
    expect(intent.notes.join(" ")).toContain("tradeoff");
  });

  it("rewrites comparison references without hard-filtering to the reference model", () => {
    const intent = localParseIntent("Something like a Porsche Cayman but cheaper and more reliable.");
    expect(intent.bodyTypes?.value).toContain("coupe");
    expect(intent.models).toBeUndefined();
    expect(intent.tags?.value).toEqual(expect.arrayContaining(["performance", "enthusiast", "reliable"]));
    expect(intent.price?.max?.value).toBe(35000);
  });

  it("maps no-keyword life goals into searchable tags", () => {
    const intent = localParseIntent("I drive 100 miles every day and hate visiting mechanics.");
    expect(intent.tags?.value).toEqual(expect.arrayContaining(["daily-driver", "economical", "reliable"]));
  });

  it("extracts brand and fuel exclusions", () => {
    const intent = localParseIntent("Luxury sedan, but no BMW, Audi, Mercedes, and definitely not electric.");
    expect(intent.tags?.value).toContain("luxury");
    expect(intent.bodyTypes?.value).toContain("sedan");
    expect(intent.excludeBrands?.value).toEqual(expect.arrayContaining(["BMW", "Audi", "Mercedes-Benz"]));
    expect(intent.excludeFuelTypes?.value).toContain("Electric");
  });

  it("excludes electric cars for sports car queries even when source fuel labels are wrong", () => {
    const store = sampleStore();
    const query = "i need a sports car that is not electric";
    const intent = localParseIntent(query);
    const plan = createLogicalPlan(intent, store);
    const results = executeSearch(store, query, intent, plan);
    expect(intent.excludeFuelTypes?.value).toContain("Electric");
    expect(intent.bodyTypes?.value).toEqual(expect.arrayContaining(["coupe", "convertible"]));
    expect(results.every((result) => result.car.fuelType !== "Electric")).toBe(true);
    expect(results.every((result) => result.matchedFilters.filter((item) => item.startsWith("Body Type: ")).every((item) => item === `Body Type: ${result.car.bodyType}`))).toBe(true);
  });

  it("handles repeated not-a-brand phrasing and broad red paint matching", () => {
    const query = "i need a sports car that is not electric to impress milfs and it should be red not a porsche i said not a porsche a";
    const store = buildStore([
      normalizeCar({
        manufacturer: "Porsche",
        model: "911 Carrera",
        year: "2022",
        mileage: "1000",
        engine: "3.0L H6",
        transmission: "Automatic",
        drivetrain: "Rear-wheel Drive",
        fuel_type: "Gasoline",
        mpg: "18-23",
        exterior_color: "Guards Red",
        interior_color: "Black",
        accidents_or_damage: "0.0",
        one_owner: "1.0",
        personal_use_only: "1.0",
        seller_name: "Dealer",
        seller_rating: "5.0",
        driver_rating: "4.9",
        driver_reviews_num: "1.0",
        price_drop: "",
        price: "120000"
      }, 1),
      normalizeCar({
        manufacturer: "Toyota",
        model: "GR86 Premium",
        year: "2023",
        mileage: "2000",
        engine: "2.4L H-4",
        transmission: "Manual",
        drivetrain: "Rear-wheel Drive",
        fuel_type: "Gasoline",
        mpg: "20-27",
        exterior_color: "Track Red",
        interior_color: "Black",
        accidents_or_damage: "0.0",
        one_owner: "1.0",
        personal_use_only: "1.0",
        seller_name: "Dealer",
        seller_rating: "4.8",
        driver_rating: "4.9",
        driver_reviews_num: "3.0",
        price_drop: "",
        price: "38000"
      }, 2)
    ]);
    const intent = localParseIntent(query);
    const plan = createLogicalPlan(intent, store);
    const results = executeSearch(store, query, intent, plan);
    expect(intent.excludeBrands?.value).toContain("Porsche");
    expect(intent.colors?.value).toContain("Red");
    expect(results).toHaveLength(1);
    expect(results[0].car.manufacturer).toBe("Toyota");
    expect(results[0].car.exteriorColor).toBe("Track Red");
  });

  it("handles parenthesized country exclusions without an LLM", () => {
    const query = "i need a sports car that is not electric to impress milfs and it should be red not (a united states car or german car)";
    const store = buildStore([
      normalizeCar({
        manufacturer: "Chevrolet",
        model: "Corvette Stingray",
        year: "2021",
        mileage: "2000",
        engine: "6.2L V8",
        transmission: "Automatic",
        drivetrain: "Rear-wheel Drive",
        fuel_type: "Gasoline",
        mpg: "15-27",
        exterior_color: "Torch Red",
        interior_color: "Black",
        accidents_or_damage: "0.0",
        one_owner: "1.0",
        personal_use_only: "1.0",
        seller_name: "Dealer",
        seller_rating: "5.0",
        driver_rating: "4.9",
        driver_reviews_num: "15.0",
        price_drop: "",
        price: "80000"
      }, 1),
      normalizeCar({
        manufacturer: "Porsche",
        model: "718 Cayman",
        year: "2022",
        mileage: "1000",
        engine: "2.0L H4",
        transmission: "Automatic",
        drivetrain: "Rear-wheel Drive",
        fuel_type: "Gasoline",
        mpg: "20-26",
        exterior_color: "Guards Red",
        interior_color: "Black",
        accidents_or_damage: "0.0",
        one_owner: "1.0",
        personal_use_only: "1.0",
        seller_name: "Dealer",
        seller_rating: "5.0",
        driver_rating: "4.9",
        driver_reviews_num: "1.0",
        price_drop: "",
        price: "100000"
      }, 2),
      normalizeCar({
        manufacturer: "Toyota",
        model: "GR86 Premium",
        year: "2023",
        mileage: "2000",
        engine: "2.4L H-4",
        transmission: "Manual",
        drivetrain: "Rear-wheel Drive",
        fuel_type: "Gasoline",
        mpg: "20-27",
        exterior_color: "Track Red",
        interior_color: "Black",
        accidents_or_damage: "0.0",
        one_owner: "1.0",
        personal_use_only: "1.0",
        seller_name: "Dealer",
        seller_rating: "4.8",
        driver_rating: "4.9",
        driver_reviews_num: "3.0",
        price_drop: "",
        price: "38000"
      }, 3)
    ]);
    const intent = localParseIntent(query);
    const plan = createLogicalPlan(intent, store);
    const results = executeSearch(store, query, intent, plan);
    expect(intent.excludeCountries?.value).toEqual(expect.arrayContaining(["United States", "Germany"]));
    expect(intent.colors?.value).toContain("Red");
    expect(results).toHaveLength(1);
    expect(results[0].car.manufacturer).toBe("Toyota");
  });

  it("lets comfort dominate ranking language", () => {
    const intent = localParseIntent("I don't care about speed. I care about comfort more than anything.");
    expect(intent.tags?.value).not.toEqual(expect.arrayContaining(["performance"]));
    expect(intent.softTags?.value).toContain("comfortable");
  });

  it("maps ambiguous client-meeting language to luxury", () => {
    const intent = localParseIntent("Something that won't embarrass me pulling up to a client meeting.");
    expect(intent.tags?.value).toContain("luxury");
  });

  it("captures nested preferences and hard exclusions", () => {
    const intent = localParseIntent("I'd prefer Japanese. If not Japanese then Korean. Absolutely no American cars.");
    expect(intent.preferredCountries?.value).toEqual(expect.arrayContaining(["Japan", "South Korea"]));
    expect(intent.excludeCountries?.value).toContain("United States");
    expect(intent.excludeCountries?.value).not.toContain("Japan");
  });

  it("maps English cars to United Kingdom origin", () => {
    const intent = localParseIntent("english cars");
    expect(intent.countries?.value).toEqual(["United Kingdom"]);
  });

  it("does not mistake thousand for US country intent", () => {
    const intent = localParseIntent("under 40 grand and less than 80 thousand miles");
    expect(intent.countries).toBeUndefined();
    expect(intent.price?.max?.value).toBe(40000);
    expect(intent.mileage?.max?.value).toBe(80000);
  });

  it("captures grouped brand exclusions and plural EV wording", () => {
    const intent = localParseIntent("show me anything except porsche audi bmw and mercedes, no EVs");
    expect(intent.excludeBrands?.value).toEqual(expect.arrayContaining(["Porsche", "Audi", "BMW", "Mercedes-Benz"]));
    expect(intent.excludeFuelTypes?.value).toContain("Electric");
  });

  it("propagates not across brand lists joined by or", () => {
    const intent = localParseIntent("not a porsche or audi or bmw");
    expect(intent.excludeBrands?.value).toEqual(expect.arrayContaining(["Porsche", "Audi", "BMW"]));
  });

  it("handles common brand aliases in exclusions", () => {
    const intent = localParseIntent("no chevy, vw, merc, or teslas");
    expect(intent.excludeBrands?.value).toEqual(expect.arrayContaining(["Chevrolet", "Volkswagen", "Mercedes-Benz", "Tesla"]));
  });

  it("captures negative country lists without parentheses", () => {
    const intent = localParseIntent("not german or american cars");
    expect(intent.excludeCountries?.value).toEqual(expect.arrayContaining(["Germany", "United States"]));
    expect(intent.countries).toBeUndefined();
  });

  it("captures negative body type, fuel type, and color constraints", () => {
    const intent = localParseIntent("reliable car under $40,000 with no SUVs, no hybrids, and not black");
    expect(intent.price?.max?.value).toBe(40000);
    expect(intent.excludeBodyTypes?.value).toContain("suv");
    expect(intent.excludeFuelTypes?.value).toContain("Hybrid");
    expect(intent.excludeColors?.value).toContain("Black");
  });

  it("classifies common crossover models as SUVs for exclusions", () => {
    const car = normalizeCar({
      manufacturer: "Toyota",
      model: "Venza LE",
      year: "2023",
      mileage: "1000",
      engine: "2.5L I4",
      transmission: "Automatic",
      drivetrain: "All-wheel Drive",
      fuel_type: "Gasoline",
      mpg: "30-37",
      exterior_color: "Red",
      interior_color: "Black",
      accidents_or_damage: "0.0",
      one_owner: "1.0",
      personal_use_only: "1.0",
      seller_name: "Dealer",
      seller_rating: "4.8",
      driver_rating: "4.8",
      driver_reviews_num: "1.0",
      price_drop: "",
      price: "39988"
    }, 99);
    expect(car.bodyType).toBe("suv");
  });

  it("maps common model aliases into searchable model intent", () => {
    const intent = localParseIntent("manual miata under 20k");
    expect(intent.brands?.value).toContain("Mazda");
    expect(intent.models?.value).toContain("MX-5 Miata");
    expect(intent.bodyTypes?.value).toContain("convertible");
    expect(intent.tags?.value).toEqual(expect.arrayContaining(["performance", "enthusiast"]));
    expect(intent.transmissions?.value).toContain("Manual");
    expect(intent.price?.max?.value).toBe(20000);
  });

  it("handles Brace-style goal language", () => {
    const intent = localParseIntent("Find me a comfortable daily driver that can still be fun on weekends, gets decent mileage, and won't kill me on maintenance.");
    expect(intent.tags?.value).toEqual(expect.arrayContaining(["comfortable", "daily-driver", "performance", "enthusiast", "economical", "reliable"]));
  });

  it("keeps interpretation inspectable for founder-style explainability", () => {
    const store = sampleStore();
    const query = "I need a car for a growing family. My commute is long. I enjoy driving. I don't want something boring. I don't want something that'll bankrupt me.";
    const intent = localParseIntent(query);
    const plan = createLogicalPlan(intent, store);
    const results = executeSearch(store, query, intent, plan);
    expect(intent.tags?.value).toEqual(expect.arrayContaining(["family", "daily-driver", "economical", "performance", "enthusiast", "reliable"]));
    expect(plan.queryId).toMatch(/^NLSE-/);
    expect(results[0].executionTrace.length).toBe(plan.operators.length);
    expect(results[0].explanationBullets.length).toBeGreaterThan(0);
    expect(results[0].matchedFilters.filter((item) => item.startsWith("Tag: ")).every((item) => results[0].car.tags.includes(item.replace("Tag: ", "")))).toBe(true);
  });
});
