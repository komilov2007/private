export type SupabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

// PostgrestError extends Error, so logging it directly prints `{}` in the Next dev overlay.
// Always log the four diagnostic fields explicitly. Never pass tokens here.
export function logSupabaseError(scope: string, error: SupabaseErrorLike | null | undefined) {
  if (!error) return;
  console.error(scope, {
    code: error.code ?? null,
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  });
}

// Table/column missing from the schema cache: the migration that creates it has not been applied.
const MISSING_SCHEMA_CODES = new Set(["PGRST205", "PGRST204", "PGRST202", "42P01", "42703", "42883"]);

export function isMissingSchemaError(error: SupabaseErrorLike | null | undefined) {
  return Boolean(error?.code && MISSING_SCHEMA_CODES.has(error.code));
}

export function devLog(...args: unknown[]) {
  if (process.env.NODE_ENV === "development") console.info(...args);
}
