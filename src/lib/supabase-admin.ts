import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type SupabaseCredentials = {
  url: string;
  serviceRoleKey: string;
  storageBucket: string;
};

const SUPABASE_CONFIG_HINT =
  "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_STORAGE_BUCKET.";

let cachedCredentials: SupabaseCredentials | null | undefined;
let cachedClient: SupabaseClient | null = null;

const resolveCredentials = (): SupabaseCredentials | null => {
  if (cachedCredentials !== undefined) {
    return cachedCredentials;
  }

  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const storageBucket = (process.env.SUPABASE_STORAGE_BUCKET || "ar-tv-viewer").trim();

  if (!url || !serviceRoleKey || !storageBucket) {
    cachedCredentials = null;
    return cachedCredentials;
  }

  cachedCredentials = {
    url,
    serviceRoleKey,
    storageBucket,
  };
  return cachedCredentials;
};

export const isSupabaseConfigured = () => Boolean(resolveCredentials());

export const getSupabaseConfigHint = () => SUPABASE_CONFIG_HINT;

export const getSupabaseAdminClient = (): SupabaseClient => {
  if (cachedClient) {
    return cachedClient;
  }

  const credentials = resolveCredentials();
  if (!credentials) {
    throw new Error(`Supabase is not configured. ${SUPABASE_CONFIG_HINT}`);
  }

  cachedClient = createClient(credentials.url, credentials.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedClient;
};

export const getSupabaseStorageBucket = () => {
  const credentials = resolveCredentials();
  if (!credentials) {
    throw new Error(`Supabase is not configured. ${SUPABASE_CONFIG_HINT}`);
  }

  return credentials.storageBucket;
};

