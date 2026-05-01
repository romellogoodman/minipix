// Limits concurrent main-thread renders so sync renderers don't jank scroll.
// Async (worker) renderers bypass this queue — they have their own pool.
export const renderQueue = {
  active: 0,
  maxConcurrent: 3,
  waiting: [],

  request(fn) {
    let entry;
    const run = async () => {
      this.active++;
      try {
        await fn();
      } finally {
        this.active--;
        const next = this.waiting.shift();
        if (next) next.start();
      }
    };

    if (this.active < this.maxConcurrent) {
      run();
      return () => {};
    }

    entry = { start: run };
    this.waiting.push(entry);
    return () => {
      const i = this.waiting.indexOf(entry);
      if (i > -1) this.waiting.splice(i, 1);
    };
  },
};
