// Worker pool for parallel rendering
// Manages a pool of Web Workers for pixel-intensive operations

class WorkerPool {
  constructor(maxWorkers = navigator.hardwareConcurrency || 4) {
    this.maxWorkers = maxWorkers;
    this.workers = [];
    this.available = [];
    this.queue = [];
    this.taskId = 0;
    this.callbacks = new Map();
  }

  getWorker() {
    // Return available worker or create new one if under limit
    if (this.available.length > 0) {
      return this.available.pop();
    }

    if (this.workers.length < this.maxWorkers) {
      const worker = new Worker(
        new URL("./render.worker.js", import.meta.url),
        { type: "module" }
      );

      worker.onmessage = (e) => {
        const { id, result, width, height } = e.data;
        const callback = this.callbacks.get(id);

        if (callback) {
          // Convert buffer back to Uint8ClampedArray
          const outputData = new Uint8ClampedArray(result);
          callback.resolve({ data: outputData, width, height });
          this.callbacks.delete(id);
        }

        // Return worker to available pool
        this.available.push(worker);

        // Process next task in queue
        this.processQueue();
      };

      worker.onerror = (error) => {
        console.error("Worker error:", error);
        // Try to recover by creating a new worker
        const index = this.workers.indexOf(worker);
        if (index > -1) {
          this.workers.splice(index, 1);
        }
      };

      this.workers.push(worker);
      return worker;
    }

    return null;
  }

  processQueue() {
    if (this.queue.length === 0) return;

    const worker = this.getWorker();
    if (!worker) return;

    const task = this.queue.shift();
    this.executeTask(worker, task);
  }

  executeTask(worker, task) {
    const { rendererName, imageData, width, height, seed, config, resolve, reject } =
      task;
    const id = this.taskId++;

    this.callbacks.set(id, { resolve, reject });

    // Transfer the image data buffer to avoid copying
    const buffer = imageData.buffer.slice(0);
    worker.postMessage(
      {
        type: "render",
        id,
        rendererName,
        imageData: new Uint8ClampedArray(buffer),
        width,
        height,
        config,
        seed,
      },
      [buffer]
    );
  }

  render(rendererName, imageData, width, height, seed, config) {
    return new Promise((resolve, reject) => {
      const task = { rendererName, imageData, width, height, seed, config, resolve, reject };

      const worker = this.getWorker();
      if (worker) {
        this.executeTask(worker, task);
      } else {
        // All workers busy, add to queue
        this.queue.push(task);
      }
    });
  }

  // Check if a renderer can be offloaded to workers
  canOffload(rendererName) {
    return ["ripple", "spiral", "waves"].includes(rendererName);
  }

  terminate() {
    this.workers.forEach((worker) => worker.terminate());
    this.workers = [];
    this.available = [];
    this.queue = [];
    this.callbacks.clear();
  }
}

// Singleton instance
export const workerPool = new WorkerPool();
