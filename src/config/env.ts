import { config } from "dotenv";
import { z } from "zod";

config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ADMIN_PASSWORD_HASH: z.string().min(20),
  ADMIN_TOKEN_SECRET: z.string().min(16),
  BREVO_API_KEY: z.string().min(1).optional()
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

export const env = parsed.data;
