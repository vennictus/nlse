import { describe, expect, it } from "vitest";
import { normalizeCar, normalizeDrivetrain, normalizeFuelType, normalizeTransmission, parseHorsepower, parseMpg } from "../src/ingest.js";

describe("ingestion normalization", () => {
  it("normalizes blanks, booleans, mpg, horsepower and aliases", () => {
    const car = normalizeCar({
      manufacturer: "BMW",
      model: "5 Series",
      year: "2020",
      mileage: "123.0",
      engine: "engine with 248HP",
      transmission: "Automatic CVT",
      drivetrain: "AWD",
      fuel_type: "Gasoline",
      mpg: "25-33",
      exterior_color: "",
      interior_color: "Black",
      accidents_or_damage: "0.0",
      one_owner: "1.0",
      personal_use_only: "0.0",
      seller_name: "",
      seller_rating: "",
      driver_rating: "4.5",
      driver_reviews_num: "2.0",
      price_drop: "",
      price: "40000.0"
    }, 7);
    expect(car.id).toBe("car_7");
    expect(car.exteriorColor).toBeNull();
    expect(car.accidentsOrDamage).toBe(false);
    expect(car.oneOwner).toBe(true);
    expect(car.mpgCity).toBe(25);
    expect(car.mpgHighway).toBe(33);
    expect(car.horsepower).toBe(248);
    expect(car.brandCountry).toBe("Germany");
  });

  it("normalizes category aliases deterministically", () => {
    expect(normalizeTransmission("6-Speed Manual")).toBe("Manual");
    expect(normalizeFuelType("Plug-In Hybrid")).toBe("Hybrid");
    expect(normalizeFuelType("Gasoline", "RS e-tron GT Base", "Electric")).toBe("Electric");
    expect(normalizeDrivetrain("Front-wheel Drive")).toBe("Front-wheel Drive");
    expect(parseMpg("39-38")).toEqual({ city: 39, highway: 38 });
    expect(parseHorsepower("90HP")).toBe(90);
  });
});
