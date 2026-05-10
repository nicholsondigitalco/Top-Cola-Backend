import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";

const TOKEN_TTL_MS = 1000 * 60 * 60 * 8;
const FAILED_ATTEMPTS_WINDOW_MS = 1000 * 60 * 15;
const MAX_ATTEMPTS = 10;
const attemptMap = new Map<string, { count: number; lastAttempt: number }>();

interface AdminTokenPayload {
  exp: number;
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
  if (Date.now() > payload.exp) {
    return null;
  }
  return payload;
};

export const issueAdminToken = (): string => sign({ exp: Date.now() + TOKEN_TTL_MS });

export const isValidAdminPassword = async (candidatePassword: string): Promise<boolean> =>
  bcrypt.compare(candidatePassword, env.ADMIN_PASSWORD_HASH);

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

  if (!token || !verify(token)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};
