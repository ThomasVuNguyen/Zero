/**
 * Environment configuration for self-hosted Node.js deployment.
 *
 * Replaces the Cloudflare Workers `env` bindings with:
 * - process.env for string variables
 * - Adapter instances for service bindings (KV, R2, Queues, Vectorize, AI)
 *
 * The ZeroEnv type is kept for compatibility with existing code that references env.SOME_BINDING.
 */
import { getAdapters, type KVAdapter, type R2Adapter, type QueueAdapter, type AIAdapter } from './adapters';
import type { VectorAdapter } from './adapters/vector-adapter';

export type ZeroEnv = {
  // ── Adapter-backed bindings (replace Cloudflare primitives) ──
  HYPERDRIVE: { connectionString: string };
  pending_emails_status: KVAdapter;
  pending_emails_payload: KVAdapter;
  scheduled_emails: KVAdapter;
  snoozed_emails: KVAdapter;
  gmail_sub_age: KVAdapter;
  gmail_history_id: KVAdapter;
  gmail_processing_threads: KVAdapter;
  subscribed_accounts: KVAdapter;
  connection_labels: KVAdapter;
  prompts_storage: KVAdapter;
  THREADS_BUCKET: R2Adapter;
  thread_queue: QueueAdapter;
  subscribe_queue: QueueAdapter;
  send_email_queue: QueueAdapter;
  AI: AIAdapter;
  VECTORIZE: VectorAdapter | null;
  VECTORIZE_MESSAGE: VectorAdapter | null;

  // ── String environment variables ──
  NODE_ENV: string;
  JWT_SECRET: string;
  ELEVENLABS_API_KEY: string;
  DISABLE_CALLS: string;
  DROP_AGENT_TABLES: string;
  THREAD_SYNC_MAX_COUNT: string;
  THREAD_SYNC_LOOP: string;
  DISABLE_WORKFLOWS: string;
  AUTORAG_ID: string;
  USE_OPENAI: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_API_TOKEN: string;
  BASE_URL: string;
  VITE_PUBLIC_APP_URL: string;
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  RESEND_API_KEY: string;
  VITE_PUBLIC_POSTHOG_KEY: string;
  VITE_PUBLIC_POSTHOG_HOST: string;
  COOKIE_DOMAIN: string;
  BETTER_AUTH_TRUSTED_ORIGINS: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  GOOGLE_APPLICATION_CREDENTIALS: string;
  HISTORY_OFFSET: string;
  ZERO_CLIENT_ID: string;
  ZERO_CLIENT_SECRET: string;
  VITE_PUBLIC_BACKEND_URL: string;
  REDIS_URL: string;
  REDIS_TOKEN: string;
  OPENAI_API_KEY: string;
  BRAIN_URL: string;
  COMPOSIO_API_KEY: string;
  GROQ_API_KEY: string;
  EARLY_ACCESS_ENABLED: string;
  GOOGLE_GENERATIVE_AI_API_KEY: string;
  AUTUMN_SECRET_KEY: string;
  AI_SYSTEM_PROMPT: string;
  PERPLEXITY_API_KEY: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  VITE_PUBLIC_ELEVENLABS_AGENT_ID: string;
  REACT_SCAN: string;
  MICROSOFT_CLIENT_ID: string;
  MICROSOFT_CLIENT_SECRET: string;
  VOICE_SECRET: string;
  ARCADE_API_KEY: string;
  OPENAI_MODEL: string;
  OPENAI_MINI_MODEL: string;
  ANTHROPIC_API_KEY: string;
  GOOGLE_S_ACCOUNT: string;
  AXIOM_API_TOKEN: string;
  AXIOM_DATASET: string;
  DEV_PROXY: string;
  MEET_AUTH_HEADER: string;
  MEET_API_URL: string;
  ENABLE_MEET: string;
  OTEL_EXPORTER_OTLP_ENDPOINT: string;
  OTEL_EXPORTER_OTLP_HEADERS: string;
  OTEL_SERVICE_NAME: string;
  DD_API_KEY: string;
  DD_APP_KEY: string;
  DD_SITE: string;
  OPENROUTER_API_KEY: string;
};

/**
 * Build the env object from process.env + adapters.
 * This is called once at startup after adapters are initialized.
 */
function buildEnv(): ZeroEnv {
  const adapters = getAdapters();
  const p = process.env;

  return {
    // Adapter-backed bindings
    HYPERDRIVE: { connectionString: p.DATABASE_URL || '' },
    pending_emails_status: adapters.kv.pending_emails_status,
    pending_emails_payload: adapters.kv.pending_emails_payload,
    scheduled_emails: adapters.kv.scheduled_emails,
    snoozed_emails: adapters.kv.snoozed_emails,
    gmail_sub_age: adapters.kv.gmail_sub_age,
    gmail_history_id: adapters.kv.gmail_history_id,
    gmail_processing_threads: adapters.kv.gmail_processing_threads,
    subscribed_accounts: adapters.kv.subscribed_accounts,
    connection_labels: adapters.kv.connection_labels,
    prompts_storage: adapters.kv.prompts_storage,
    THREADS_BUCKET: adapters.threadsBucket,
    thread_queue: adapters.queues.thread_queue as any,
    subscribe_queue: adapters.queues.subscribe_queue as any,
    send_email_queue: adapters.queues.send_email_queue as any,
    AI: adapters.ai as any,
    VECTORIZE: adapters.vectorize,
    VECTORIZE_MESSAGE: adapters.vectorizeMessage,

    // String environment variables (all from process.env)
    NODE_ENV: p.NODE_ENV || 'production',
    JWT_SECRET: p.JWT_SECRET || 'secret',
    ELEVENLABS_API_KEY: p.ELEVENLABS_API_KEY || '',
    DISABLE_CALLS: p.DISABLE_CALLS || 'true',
    DROP_AGENT_TABLES: p.DROP_AGENT_TABLES || 'false',
    THREAD_SYNC_MAX_COUNT: p.THREAD_SYNC_MAX_COUNT || '60',
    THREAD_SYNC_LOOP: p.THREAD_SYNC_LOOP || 'false',
    DISABLE_WORKFLOWS: p.DISABLE_WORKFLOWS || 'false',
    AUTORAG_ID: p.AUTORAG_ID || '',
    USE_OPENAI: p.USE_OPENAI || 'true',
    CLOUDFLARE_ACCOUNT_ID: p.CLOUDFLARE_ACCOUNT_ID || '',
    CLOUDFLARE_API_TOKEN: p.CLOUDFLARE_API_TOKEN || '',
    BASE_URL: p.BASE_URL || p.VITE_PUBLIC_BACKEND_URL || '',
    VITE_PUBLIC_APP_URL: p.VITE_PUBLIC_APP_URL || '',
    DATABASE_URL: p.DATABASE_URL || '',
    BETTER_AUTH_SECRET: p.BETTER_AUTH_SECRET || '',
    BETTER_AUTH_URL: p.BETTER_AUTH_URL || p.VITE_PUBLIC_APP_URL || '',
    GOOGLE_CLIENT_ID: p.GOOGLE_CLIENT_ID || '',
    GOOGLE_CLIENT_SECRET: p.GOOGLE_CLIENT_SECRET || '',
    RESEND_API_KEY: p.RESEND_API_KEY || '',
    VITE_PUBLIC_POSTHOG_KEY: p.VITE_PUBLIC_POSTHOG_KEY || '',
    VITE_PUBLIC_POSTHOG_HOST: p.VITE_PUBLIC_POSTHOG_HOST || '',
    COOKIE_DOMAIN: p.COOKIE_DOMAIN || '',
    BETTER_AUTH_TRUSTED_ORIGINS: p.BETTER_AUTH_TRUSTED_ORIGINS || '',
    GITHUB_CLIENT_ID: p.GITHUB_CLIENT_ID || '',
    GITHUB_CLIENT_SECRET: p.GITHUB_CLIENT_SECRET || '',
    GOOGLE_REDIRECT_URI: p.GOOGLE_REDIRECT_URI || '',
    GOOGLE_APPLICATION_CREDENTIALS: p.GOOGLE_APPLICATION_CREDENTIALS || '',
    HISTORY_OFFSET: p.HISTORY_OFFSET || '',
    ZERO_CLIENT_ID: p.ZERO_CLIENT_ID || '',
    ZERO_CLIENT_SECRET: p.ZERO_CLIENT_SECRET || '',
    VITE_PUBLIC_BACKEND_URL: p.VITE_PUBLIC_BACKEND_URL || '',
    REDIS_URL: p.REDIS_URL || '',
    REDIS_TOKEN: p.REDIS_TOKEN || '',
    OPENAI_API_KEY: p.OPENAI_API_KEY || '',
    BRAIN_URL: p.BRAIN_URL || '',
    COMPOSIO_API_KEY: p.COMPOSIO_API_KEY || '',
    GROQ_API_KEY: p.GROQ_API_KEY || '',
    EARLY_ACCESS_ENABLED: p.EARLY_ACCESS_ENABLED || '',
    GOOGLE_GENERATIVE_AI_API_KEY: p.GOOGLE_GENERATIVE_AI_API_KEY || '',
    AUTUMN_SECRET_KEY: p.AUTUMN_SECRET_KEY || '',
    AI_SYSTEM_PROMPT: p.AI_SYSTEM_PROMPT || '',
    PERPLEXITY_API_KEY: p.PERPLEXITY_API_KEY || '',
    TWILIO_ACCOUNT_SID: p.TWILIO_ACCOUNT_SID || '',
    TWILIO_AUTH_TOKEN: p.TWILIO_AUTH_TOKEN || '',
    TWILIO_PHONE_NUMBER: p.TWILIO_PHONE_NUMBER || '',
    VITE_PUBLIC_ELEVENLABS_AGENT_ID: p.VITE_PUBLIC_ELEVENLABS_AGENT_ID || '',
    REACT_SCAN: p.REACT_SCAN || '',
    MICROSOFT_CLIENT_ID: p.MICROSOFT_CLIENT_ID || '',
    MICROSOFT_CLIENT_SECRET: p.MICROSOFT_CLIENT_SECRET || '',
    VOICE_SECRET: p.VOICE_SECRET || '',
    ARCADE_API_KEY: p.ARCADE_API_KEY || '',
    OPENAI_MODEL: p.OPENAI_MODEL || 'gpt-4o',
    OPENAI_MINI_MODEL: p.OPENAI_MINI_MODEL || 'gpt-4o-mini',
    ANTHROPIC_API_KEY: p.ANTHROPIC_API_KEY || '',
    GOOGLE_S_ACCOUNT: p.GOOGLE_S_ACCOUNT || '{}',
    AXIOM_API_TOKEN: p.AXIOM_API_TOKEN || '',
    AXIOM_DATASET: p.AXIOM_DATASET || '',
    DEV_PROXY: p.DEV_PROXY || '',
    MEET_AUTH_HEADER: p.MEET_AUTH_HEADER || '',
    MEET_API_URL: p.MEET_API_URL || '',
    ENABLE_MEET: p.ENABLE_MEET || 'false',
    OTEL_EXPORTER_OTLP_ENDPOINT: p.OTEL_EXPORTER_OTLP_ENDPOINT || '',
    OTEL_EXPORTER_OTLP_HEADERS: p.OTEL_EXPORTER_OTLP_HEADERS || '',
    OTEL_SERVICE_NAME: p.OTEL_SERVICE_NAME || 'zero-email-server',
    DD_API_KEY: p.DD_API_KEY || '',
    DD_APP_KEY: p.DD_APP_KEY || '',
    DD_SITE: p.DD_SITE || 'datadoghq.com',
    OPENROUTER_API_KEY: p.OPENROUTER_API_KEY || '',
  } as ZeroEnv;
}

let _env: ZeroEnv | null = null;

/**
 * Initialize the env. Must be called after initAdapters().
 */
export function initEnv(): ZeroEnv {
  _env = buildEnv();
  return _env;
}

/**
 * Get the env singleton. Lazy-initializes if not yet set up.
 */
export function getEnv(): ZeroEnv {
  if (!_env) {
    _env = buildEnv();
  }
  return _env;
}

// Default export for backward compatibility: `import { env } from './env'`
// On first access after initAdapters(), this returns the fully initialized env.
const envProxy = new Proxy({} as ZeroEnv, {
  get(_target, prop: string) {
    return getEnv()[prop as keyof ZeroEnv];
  },
});

const env = envProxy;
export { env };
