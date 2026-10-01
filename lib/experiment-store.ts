import type { SearchResult } from "@/lib/search";

export type ExperimentStepRecord = {
  step: number;
  createdAt: string;
  stateBefore: Uint8ClampedArray;
  stateAfter: Uint8ClampedArray;
  scoreBefore: number;
  scoreAfter: number;
  actions: SearchResult[];
  winnerConfigId: string | null;
  totalEvaluations: number;
};

export type ExperimentRunRecord = {
  id: string;
  sourceName: string;
  createdAt: string;
  updatedAt: string;
  width: number;
  height: number;
  target: Uint8ClampedArray;
  baseline: Uint8ClampedArray;
  steps: ExperimentStepRecord[];
};

const DB_NAME = "faint-research";
const DB_VERSION = 1;
const STORE_NAME = "experiment-runs";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this environment."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open Faint experiment database."));
  });
}

function transactionRequest<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        const request = action(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
      }),
  );
}

export function newExperimentRun(
  sourceName: string,
  target: Uint8ClampedArray,
  baseline: Uint8ClampedArray,
  width: number,
  height: number,
): ExperimentRunRecord {
  const now = new Date().toISOString();
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id,
    sourceName,
    createdAt: now,
    updatedAt: now,
    width,
    height,
    target: new Uint8ClampedArray(target),
    baseline: new Uint8ClampedArray(baseline),
    steps: [],
  };
}

export async function saveExperimentRun(run: ExperimentRunRecord) {
  const next = { ...run, updatedAt: new Date().toISOString() };
  await transactionRequest("readwrite", (store) => store.put(next));
  return next;
}

export async function getExperimentRun(id: string) {
  return transactionRequest<ExperimentRunRecord | undefined>("readonly", (store) => store.get(id));
}

export async function listExperimentRuns() {
  const runs = await transactionRequest<ExperimentRunRecord[]>("readonly", (store) => store.getAll());
  return runs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteExperimentRun(id: string) {
  await transactionRequest("readwrite", (store) => store.delete(id));
}

export async function clearExperimentRuns() {
  await transactionRequest("readwrite", (store) => store.clear());
}

export function runToSerializable(run: ExperimentRunRecord) {
  return {
    ...run,
    target: Array.from(run.target),
    baseline: Array.from(run.baseline),
    steps: run.steps.map((step) => ({
      ...step,
      stateBefore: Array.from(step.stateBefore),
      stateAfter: Array.from(step.stateAfter),
    })),
  };
}

export function runToCsv(run: ExperimentRunRecord) {
  const rows = [
    [
      "run_id",
      "source",
      "step",
      "config_id",
      "config_label",
      "winner",
      "score_before",
      "score_after",
      "gain",
      "utility",
      "evaluations",
      "elapsed_ms",
    ],
  ];

  for (const step of run.steps) {
    for (const action of step.actions) {
      rows.push([
        run.id,
        run.sourceName,
        String(step.step),
        action.config.id,
        action.config.label,
        String(step.winnerConfigId === action.config.id),
        String(action.before),
        String(action.after),
        String(action.gain),
        String(action.utility),
        String(action.evaluations),
        String(action.elapsedMs),
      ]);
    }
  }

  return rows
    .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
    .join("\n");
}
