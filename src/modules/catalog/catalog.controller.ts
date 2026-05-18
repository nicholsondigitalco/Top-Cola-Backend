import { Router } from "express";
import { catalogRepository } from "../data/repositories.js";

export const catalogRouter = Router();

catalogRouter.get("/products", async (req, res, next) => {
  try {
    const categorySlug = typeof req.query.category === "string" ? req.query.category : undefined;
    const collectTags = (value: unknown): string[] => {
      if (typeof value === "string") {
        return value
          .split(",")
          .map((entry) => entry.trim().toLowerCase())
          .filter(Boolean);
      }
      if (Array.isArray(value)) {
        return value.flatMap((entry) =>
          typeof entry === "string"
            ? entry
                .split(",")
                .map((part) => part.trim().toLowerCase())
                .filter(Boolean)
            : []
        );
      }
      return [];
    };
    const tags = Array.from(new Set([...collectTags(req.query.tag), ...collectTags(req.query.tags)]));
    const active =
      req.query.active === undefined ? true : String(req.query.active).toLowerCase() !== "false";
    const products = await catalogRepository.listProducts({ categorySlug, active, tags });
    res.json({ products });
  } catch (error) {
    next(error);
  }
});
