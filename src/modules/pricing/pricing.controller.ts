import { Router } from "express";
import { pricingEngine } from "./pricing.engine.js";
import { QuoteRequestSchema } from "./pricing.validators.js";

export const pricingRouter = Router();

pricingRouter.post("/pricing/quote", async (req, res, next) => {
  try {
    const payload = QuoteRequestSchema.parse(req.body);
    const quote = await pricingEngine.quote(payload);
    res.json(quote);
  } catch (error) {
    next(error);
  }
});
