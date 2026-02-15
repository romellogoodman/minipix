// Global render queue to limit concurrent renders
export const renderQueue = {
  active: 0,
  maxConcurrent: Math.max(4, navigator.hardwareConcurrency || 4),
  waiting: [],
  retryCallbacks: [], // Callbacks waiting to retry with a new renderer

  async request(fn) {
    if (this.active >= this.maxConcurrent) {
      // Wait for a slot to open
      await new Promise((resolve) => this.waiting.push(resolve));
    }

    this.active++;
    try {
      await fn();
    } finally {
      this.active--;
      // Process retry queue first (failed renders get priority)
      if (this.retryCallbacks.length > 0) {
        const retry = this.retryCallbacks.shift();
        retry();
      } else if (this.waiting.length > 0) {
        const next = this.waiting.shift();
        next();
      }
    }
  },

  // Queue a retry to happen when a slot opens
  queueRetry(callback) {
    this.retryCallbacks.push(callback);
    // If there's capacity, trigger immediately
    if (this.active < this.maxConcurrent && this.retryCallbacks.length > 0) {
      const retry = this.retryCallbacks.shift();
      retry();
    }
  },
};
