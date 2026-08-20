/** Model-provider abstraction (SPEC §6): one low-level text-completion seam. */

export type ModelCallRequest = {
  system: string;
  user: string;
  maxTokens: number;
};

export type ModelCallResult = {
  text: string;
  provider: string;
  model: string;
  modelVersion?: string;
  latencyMs: number;
};

/**
 * A single independent model call. Each machine contestant makes its own
 * calls through this seam; different contestants may later use different
 * providers/models without engine changes.
 */
export interface ModelProvider {
  complete(request: ModelCallRequest): Promise<ModelCallResult>;
}

/** Calls fn with up to `retries` retries, rethrowing the final error (SPEC §27). */
export async function withRetries<T>(
  fn: () => Promise<T>,
  retries: number,
  onRetry?: (attempt: number, error: unknown) => void,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) onRetry?.(attempt + 1, error);
    }
  }
  throw lastError;
}
