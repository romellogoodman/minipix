// Worker pool for parallel rendering
// Manages a pool of Web Workers for pixel-intensive operations

const TASK_TIMEOUT_MS = 30000; // 30 second timeout for worker tasks

class WorkerPool {
  constructor(maxWorkers = navigator.hardwareConcurrency || 4) {
    this.maxWorkers = maxWorkers;
    this.workers = [];
    this.available = [];
    this.queue = [];
    this.taskId = 0;
    this.callbacks = new Map();
    this.workerTaskMap = new Map(); // Track which task each worker is processing
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

        // Clear task tracking for this worker
        this.workerTaskMap.delete(worker);

        // Return worker to available pool
        this.available.push(worker);

        // Process next task in queue
        this.processQueue();
      };

      worker.onerror = (error) => {
        console.error("Worker error:", error);

        // Get the task ID this worker was processing and reject its promise
        const taskId = this.workerTaskMap.get(worker);
        if (taskId !== undefined) {
          const callback = this.callbacks.get(taskId);
          if (callback) {
            callback.reject(new Error(`Worker error: ${error.message}`));
            this.callbacks.delete(taskId);
          }
          this.workerTaskMap.delete(worker);
        }

        // Remove the failed worker and create fresh ones as needed
        const index = this.workers.indexOf(worker);
        if (index > -1) {
          this.workers.splice(index, 1);
        }

        // Process next task in queue (will create new worker if needed)
        this.processQueue();
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
    const { rendererName, imageData, width, height, seed, config, resolve, reject } = task;
    const id = this.taskId++;

    // Set timeout for this task
    const timeoutId = setTimeout(() => {
      const callback = this.callbacks.get(id);
      if (callback) {
        callback.reject(new Error("Worker task timed out"));
        this.callbacks.delete(id);
        this.workerTaskMap.delete(worker);

        // Terminate and replace the stuck worker
        worker.terminate();
        const index = this.workers.indexOf(worker);
        if (index > -1) {
          this.workers.splice(index, 1);
        }

        this.processQueue();
      }
    }, TASK_TIMEOUT_MS);

    this.callbacks.set(id, {
      resolve: (result) => {
        clearTimeout(timeoutId);
        resolve(result);
      },
      reject: (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    });
    this.workerTaskMap.set(worker, id);

    // Use the buffer directly for true zero-copy transfer
    // Note: After transfer, imageData becomes unusable in main thread
    const buffer = imageData.buffer;
    worker.postMessage(
      {
        type: "render",
        id,
        rendererName,
        imageData: imageData,
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

  terminate() {
    // Reject all pending callbacks
    for (const callback of this.callbacks.values()) {
      callback.reject(new Error("Worker pool terminated"));
    }

    this.workers.forEach((worker) => worker.terminate());
    this.workers = [];
    this.available = [];
    this.queue = [];
    this.callbacks.clear();
    this.workerTaskMap.clear();
  }
}

// Singleton instance
export const workerPool = new WorkerPool();
