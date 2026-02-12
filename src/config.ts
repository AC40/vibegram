import { z } from 'zod';
import { config as loadDotenv } from 'dotenv';

loadDotenv();

const configSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
  DEEPGRAM_API_KEY: z.string().default(''),
  ALLOWED_USER_IDS: z
    .string()
    .default('')
    .transform((val) =>
      val
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .map(Number)
    ),
  DEFAULT_WORKING_DIR: z.string().default(process.env['HOME'] ?? '/tmp'),
  SQLITE_PATH: z.string().default('./data/vibegram.db'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  // Server config (for webhook mode, matching VibeTunnel's port 4020)
  PORT: z.string().default('4020').transform((val) => parseInt(val, 10)),
  BIND: z.string().default('0.0.0.0'),
  WEBHOOK_URL: z.string().optional(),
  WEBHOOK_PATH: z.string().default('/webhook'),
  // Use polling or webhook mode
  USE_WEBHOOK: z.string().default('false').transform((val) => val === 'true'),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;
