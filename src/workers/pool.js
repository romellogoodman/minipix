// Worker pool for parallel rendering
// Manages a pool of Web Workers for pixel-intensive operations

const TASK_TIMEOUT_MS = 30000;

class WorkerPool {
  constructor(maxWorkers = navigator.hardwareConcurrency || 4) {
    this.maxWorkers = maxWorkers;
    this.workers = [];
    this.available = [];
    this.queue = [];
    this.taskId = 0;
    this.callbacks = new Map();
    this.workerTaskMap = new Map();
  }

  removeWorker(worker) {
    worker.terminate();
    const wi = this.workers.indexOf(worker);
    if (wi > -1) this.workers.splice(wi, 1);
    const ai = this.available.indexOf(worker);
    if (ai > -1) this.available.splice(ai, 1);
    this.workerTaskMap.delete(worker);
  }

  getWorker() {
    if (this.available.length > 0) {
      return this.available.pop();
    }

    if (this.workers.length < this.maxWorkers) {
      const worker = new Worker(
        new URL("./render.worker.js", import.meta.url),
        { type: "module" }
      );

      worker.onmessage = (e) => {
        const { id, result, width, height, error } = e.data;
        const callback = this.callbacks.get(id);

        if (callback) {
          this.callbacks.delete(id);
          if (error) {
            callback.reject(new Error(error));
          } else {
            callback.resolve({ data: new Uint8ClampedArray(result), width, height });
          }
        }

        this.workerTaskMap.delete(worker);

        // Only return to the pool if this worker wasn't removed (e.g. by a
        // timeout that fired before a late message arrived).
        if (this.workers.includes(worker)) {
          this.available.push(worker);
          this.processQueue();
        }
      };

      worker.onerror = (error) => {
        console.error("Worker error:", error);

        const taskId = this.workerTaskMap.get(worker);
        if (taskId !== undefined) {
          const callback = this.callbacks.get(taskId);
          if (callback) {
            this.callbacks.delete(taskId);
            callback.reject(new Error(`Worker error: ${error.message}`));
          }
        }

        this.removeWorker(worker);
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

    const timeoutId = setTimeout(() => {
      const callback = this.callbacks.get(id);
      if (callback) {
        this.callbacks.delete(id);
        callback.reject(new Error("Worker task timed out"));
        this.removeWorker(worker);
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

    worker.postMessage(
      {
        type: "render",
        id,
        rendererName,
        imageData,
        width,
        height,
        config,
        seed,
      },
      [imageData.buffer]
    );
  }

  render(rendererName, imageData, width, height, seed, config) {
    let task;
    const promise = new Promise((resolve, reject) => {
      task = { rendererName, imageData, width, height, seed, config, resolve, reject };

      const worker = this.getWorker();
      if (worker) {
        this.executeTask(worker, task);
      } else {
        this.queue.push(task);
      }
    });

    promise.cancel = () => {
      const qi = this.queue.indexOf(task);
      if (qi > -1) {
        this.queue.splice(qi, 1);
        task.reject(new Error("cancelled"));
      }
    };

    return promise;
  }

  terminate() {
    for (const callback of this.callbacks.values()) {
      callback.reject(new Error("Worker pool terminated"));
    }
    for (const task of this.queue) {
      task.reject(new Error("Worker pool terminated"));
    }

    this.workers.forEach((worker) => worker.terminate());
    this.workers = [];
    this.available = [];
    this.queue = [];
    this.callbacks.clear();
    this.workerTaskMap.clear();
  }
}

export const workerPool = new WorkerPool();
