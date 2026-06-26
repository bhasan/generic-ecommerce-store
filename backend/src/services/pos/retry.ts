import { logger } from '../../utils/logger';

export async function retryWithBackoff(
  fn: () => Promise<void>,
  opts: { attempts?: number; label: string; context?: Record<string, unknown> }
): Promise<void> {
  const maxAttempts = opts.attempts ?? 3;
  const backoffDelays = [1000, 2000, 4000]; // milliseconds

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fn();
      return; // Success, exit immediately
    } catch (error) {
      const logContext = {
        label: opts.label,
        attempt,
        maxAttempts,
        ...(opts.context || {}),
      };

      if (attempt === maxAttempts) {
        // Last attempt failed, log final warning and return
        logger.warn(`${opts.label} failed after ${maxAttempts} attempts`, { ...logContext, error });
        return; // Return without throwing
      } else {
        // Log the failure and calculate backoff delay
        logger.error(`${opts.label} failed on attempt ${attempt}/${maxAttempts}`, error, logContext);
        const delayMs = backoffDelays[Math.min(attempt - 1, backoffDelays.length - 1)]; // attempt 1 -> index 0 -> 1000ms
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
}
