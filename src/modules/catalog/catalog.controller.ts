import { Router } from "express";
import { catalogRepository } from "../data/repositories.js";

export const catalogRouter = Router();

catalogRouter.get("/products", async (req, res, next) => {
  try {
    const categorySlug = typeof req.query.category === "string" ? req.query.category : undefined;
    const active =
      req.query.active === undefined ? true : String(req.query.active).toLowerCase() !== "false";
    const products = await catalogRepository.listProducts({ categorySlug, active });
    res.json({ products });
  } catch (error) {
    next(error);
  }
});
