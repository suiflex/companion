/** Sliding-window limiter: protects providers (and wallets) from runaway loops. */
export function createRateLimiter(maxCalls: number, windowMs: number) {
  const calls: number[] = [];
  return {
    take(now = Date.now()): boolean {
      while (calls.length && now - calls[0] > windowMs) calls.shift();
      if (calls.length >= maxCalls) return false;
      calls.push(now);
      return true;
    },
  };
}
