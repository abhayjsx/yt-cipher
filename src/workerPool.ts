import type { WorkerWithStatus, Task } from "./types.ts";
import { formatLogMessage } from "./utils.ts";

// const CONCURRENCY = parseInt(Deno.env.get("MAX_THREADS") || "", 10) || navigator.hardwareConcurrency || 1;
const CONCURRENCY = 1;
const TASK_TIMEOUT = parseInt(Deno.env.get("WORKER_TASK_TIMEOUT") || "60000", 10);

const workers: WorkerWithStatus[] = [];
const taskQueue: Task[] = [];

function dispatch() {
    const idleWorker = workers.find(w => w.isIdle);
    if (!idleWorker || taskQueue.length === 0) {
        return;
    }

    const task = taskQueue.shift()!;
    idleWorker.isIdle = false;

    let timeoutId: number | undefined;

    const messageHandler = (e: MessageEvent) => {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
        }
        idleWorker.removeEventListener("message", messageHandler);
        idleWorker.removeEventListener("error", errorHandler);
        idleWorker.isIdle = true;

        const { type, data } = e.data;
        if (type === 'success') {
            task.resolve(data);
        } else {
            const err = new Error(data.message || 'Worker task failed');
            err.stack = data.stack;
            console.error(formatLogMessage('error', 'Worker task failed', {
                error: err.message,
                stack: err.stack
            }));
            task.reject(err);
        }
        dispatch(); // keep checking
    };

    const errorHandler = (e: ErrorEvent) => {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
        }
        idleWorker.removeEventListener("message", messageHandler);
        idleWorker.removeEventListener("error", errorHandler);
        idleWorker.isIdle = true;

        const err = new Error(e.message || 'Worker error');
        console.error(formatLogMessage('error', 'Worker error event', {
            error: err.message,
            filename: e.filename,
            lineno: e.lineno,
            colno: e.colno
        }));
        task.reject(err);
        dispatch();
    };

    // Add timeout handler
    timeoutId = setTimeout(() => {
        idleWorker.removeEventListener("message", messageHandler);
        idleWorker.removeEventListener("error", errorHandler);
        idleWorker.isIdle = true;

        const err = new Error(`Worker task timeout after ${TASK_TIMEOUT}ms`);
        console.error(formatLogMessage('error', 'Worker task timeout', {
            timeout: TASK_TIMEOUT
        }));
        task.reject(err);
        dispatch();
    }, TASK_TIMEOUT);

    idleWorker.addEventListener("message", messageHandler);
    idleWorker.addEventListener("error", errorHandler);
    
    try {
        idleWorker.postMessage(task.data);
    } catch (error) {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
        }
        idleWorker.removeEventListener("message", messageHandler);
        idleWorker.removeEventListener("error", errorHandler);
        idleWorker.isIdle = true;
        
        const err = error instanceof Error ? error : new Error('Failed to post message to worker');
        console.error(formatLogMessage('error', 'Failed to post message to worker', {
            error: err.message
        }));
        task.reject(err);
        dispatch();
    }
}

export function execInPool(data: string): Promise<string> {
    return new Promise((resolve, reject) => {
        taskQueue.push({ data, resolve, reject });
        dispatch();
    });
}

export function initializeWorkers() {
    for (let i = 0; i < CONCURRENCY; i++) {
        try {
            const worker: WorkerWithStatus = new Worker(new URL("../worker.ts", import.meta.url).href, { type: "module" });
            worker.isIdle = true;
            workers.push(worker);
            console.log(formatLogMessage('info', `Worker ${i + 1} initialized`));
        } catch (error) {
            console.error(formatLogMessage('error', `Failed to initialize worker ${i + 1}`, {
                error: error instanceof Error ? error.message : 'Unknown error'
            }));
        }
    }
    console.log(formatLogMessage('info', `Initialized ${workers.length}/${CONCURRENCY} workers`));
}