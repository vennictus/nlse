import "dotenv/config";
import { buildApp } from "./app.js";
import { loadCars } from "./ingest.js";

const store = await loadCars(process.env.CARS_CSV ?? "cars.csv");
const app = buildApp(store);
const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
