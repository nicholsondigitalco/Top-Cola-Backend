import { Router } from "express";
import { ordersService } from "./orders.service.js";
import { OrderRequestSchema } from "../pricing/pricing.validators.js";

export const ordersRouter = Router();

ordersRouter.post("/orders", async (req, res, next) => {
  try {
    const payload = OrderRequestSchema.parse(req.body);
    const result = await ordersService.createOrder(payload);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});
