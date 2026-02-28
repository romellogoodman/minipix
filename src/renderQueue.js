// Limits concurrent main-thread renders so sync renderers don't jank scroll.
// Async (worker) renderers bypass this queue — they have their own pool.
export const renderQueue = {
  active: 0,
  maxConcurrent: Math.max(4, navigator.hardwareConcurrency || 4),
  waiting: [],

  async request(fn) {
    if (this.active >= this.maxConcurrent) {
      await new Promise((resolve) => this.waiting.push(resolve));
    }

    this.active++;
    try {
      await fn();
    } finally {
      this.active--;
      const next = this.waiting.shift();
      if (next) next();
    }
  },
};
