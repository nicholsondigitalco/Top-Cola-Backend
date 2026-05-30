import { config } from "dotenv";
import { z } from "zod";

config();

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    ADMIN_ORDERS_PASSWORD_HASH: z.string().min(20).optional(),
    ADMIN_FULL_PASSWORD_HASH: z.string().min(20).optional(),
    /** @deprecated Use ADMIN_FULL_PASSWORD_HASH */
    ADMIN_PASSWORD_HASH: z.string().min(20).optional(),
    ADMIN_TOKEN_SECRET: z.string().min(16),
    BREVO_API_KEY: z.string().min(1).optional()
  })
  .refine(
    (data) =>
      Boolean(data.ADMIN_ORDERS_PASSWORD_HASH || data.ADMIN_FULL_PASSWORD_HASH || data.ADMIN_PASSWORD_HASH),
    { message: "Configure ADMIN_ORDERS_PASSWORD_HASH and/or ADMIN_FULL_PASSWORD_HASH" }
  );

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

const adminFullPasswordHash =
  parsed.data.ADMIN_FULL_PASSWORD_HASH ?? parsed.data.ADMIN_PASSWORD_HASH ?? "";

export const env = {
  ...parsed.data,
  ADMIN_ORDERS_PASSWORD_HASH: parsed.data.ADMIN_ORDERS_PASSWORD_HASH ?? "",
  ADMIN_FULL_PASSWORD_HASH: adminFullPasswordHash
};
