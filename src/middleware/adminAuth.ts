import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";

export type AdminRole = "orders" | "full";

const TOKEN_TTL_MS = 1000 * 60 * 60 * 8;
const FAILED_ATTEMPTS_WINDOW_MS = 1000 * 60 * 15;
const MAX_ATTEMPTS = 10;
const attemptMap = new Map<string, { count: number; lastAttempt: number }>();

interface AdminTokenPayload {
  exp: number;
  role: AdminRole;
}

declare global {
  namespace Express {
    interface Request {
      adminRole?: AdminRole;
    }
  }
}

const toBase64Url = (value: string): string => Buffer.from(value).toString("base64url");

const sign = (payload: AdminTokenPayload): string => {
  const body = toBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", env.ADMIN_TOKEN_SECRET)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
};

const verify = (token: string): AdminTokenPayload | null => {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = crypto
    .createHmac("sha256", env.ADMIN_TOKEN_SECRET)
    .update(body)
    .digest("base64url");

  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as AdminTokenPayload;
  if (Date.now() > payload.exp || (payload.role !== "orders" && payload.role !== "full")) {
    return null;
  }
  return payload;
};

export const issueAdminToken = (role: AdminRole): string =>
  sign({ exp: Date.now() + TOKEN_TTL_MS, role });

export const authenticateAdminPassword = async (candidatePassword: string): Promise<AdminRole | null> => {
  if (await bcrypt.compare(candidatePassword, env.ADMIN_FULL_PASSWORD_HASH)) {
    return "full";
  }
  if (await bcrypt.compare(candidatePassword, env.ADMIN_ORDERS_PASSWORD_HASH)) {
    return "orders";
  }
  return null;
};

const isOrdersTierRoute = (method: string, path: string): boolean => {
  if (method === "GET" && path === "/admin/orders") return true;
  if (method === "GET" && path === "/admin/metrics/orders") return true;
  if (method === "GET" && path === "/admin/products") return true;
  if (method === "POST" && path === "/admin/pricing/quote") return true;
  if (method === "GET" && /^\/admin\/orders\/[^/]+$/.test(path)) return true;
  if (method === "PATCH" && /^\/admin\/orders\/[^/]+$/.test(path)) return true;
  if (method === "PATCH" && /^\/admin\/orders\/[^/]+\/status$/.test(path)) return true;
  return false;
};

export const enforceLoginRateLimit = (ipAddress: string): boolean => {
  const now = Date.now();
  const current = attemptMap.get(ipAddress);
  if (!current) return true;
  if (now - current.lastAttempt > FAILED_ATTEMPTS_WINDOW_MS) {
    attemptMap.delete(ipAddress);
    return true;
  }
  return current.count < MAX_ATTEMPTS;
};

export const recordLoginFailure = (ipAddress: string): void => {
  const now = Date.now();
  const current = attemptMap.get(ipAddress);
  if (!current || now - current.lastAttempt > FAILED_ATTEMPTS_WINDOW_MS) {
    attemptMap.set(ipAddress, { count: 1, lastAttempt: now });
    return;
  }
  attemptMap.set(ipAddress, { count: current.count + 1, lastAttempt: now });
};

export const clearLoginFailures = (ipAddress: string): void => {
  attemptMap.delete(ipAddress);
};

export const requireAdminAuth = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.header("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const payload = token ? verify(token) : null;

  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.adminRole = payload.role;
  next();
};

export const enforceAdminTier = (req: Request, res: Response, next: NextFunction): void => {
  if (req.adminRole === "full") {
    next();
    return;
  }

  if (isOrdersTierRoute(req.method, req.path)) {
    next();
    return;
  }

  res.status(403).json({ error: "Insufficient permissions." });
};
