import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { adminRouter } from "./modules/admin/admin.controller.js";
import { catalogRouter } from "./modules/catalog/catalog.controller.js";
import { ordersRouter } from "./modules/orders/orders.controller.js";
import { pricingRouter } from "./modules/pricing/pricing.controller.js";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use(catalogRouter);
app.use(pricingRouter);
app.use(ordersRouter);
app.use(adminRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: "Validation error", issues: error.issues });
    return;
  }

  if (error instanceof Error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
});
