"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { BenchmarkPanel } from "@/components/benchmark-panel";
import { BenchmarkSuitePanel } from "@/components/benchmark-suite-panel";
import {
  ExperimentStepRecord,
  listExperimentRuns,
  newExperimentRun,
  runToCsv,
  runToSerializable,
  saveExperimentRun,
} from "@/lib/experiment-store";
import {
  DEFAULT_SEARCH_CONFIGS,
  SearchResult,
  createAverageCanvas,
  rmse,
  runOracleStep,
} from "@/lib/search";

const SIZE = 64;

type TraceRow = {
  step: number;
  winner: string;
  gain: number;
  evaluations: number;
  score: number;
};

function demoTarget() {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const horizon = y > 37;
      let r = horizon ? 72 : 220 - y * 1.8;
      let g = horizon ? 104 + (y - 37) * 2 : 172 - y * 0.8;
      let b = horizon ? 76 : 132 + y * 1.2;

      const sun = (x - 47) ** 2 + (y - 17) ** 2 < 52;
      if (sun) {
        r = 250;
        g = 221;
        b = 143;
      }

      const mountainLeft = y > 24 + Math.abs(x - 21) * 0.7;
      const mountainRight = x > 22 && y > 28 + Math.abs(x - 43) * 0.55;
      if (mountainLeft || mountainRight) {
        r = mountainRight ? 75 : 91;
        g = mountainRight ? 79 : 86;
        b = mountainRight ? 88 : 92;
      }

      data[i] = Math.max(0, Math.min(255, Math.round(r)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
      data[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
      data[i + 3] = 255;
    }
  }
  return data;
}

function paintCanvas(canvas: HTMLCanvasElement | null, pixels: Uint8ClampedArray | null) {
  if (!canvas || !pixels) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  canvas.width = SIZE;
  canvas.height = SIZE;
  context.putImageData(new ImageData(new Uint8ClampedArray(pixels), SIZE, SIZE), 0, 0);
}

function fmt(value: number, digits = 5) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function FaintLab() {
  const initialTarget = useMemo(() => demoTarget(), []);
  const initialBaseline = useMemo(() => createAverageCanvas(initialTarget, SIZE, SIZE), [initialTarget]);
  const [target, setTarget] = useState<Uint8ClampedArray>(initialTarget);
  const [current, setCurrent] = useState<Uint8ClampedArray>(initialBaseline);
  const [baseline, setBaseline] = useState<Uint8ClampedArray>(initialBaseline);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [trace, setTrace] = useState<TraceRow[]>([]);
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(false);
  const [sourceName, setSourceName] = useState("synthetic landscape");
  const [savedRunCount, setSavedRunCount] = useState(0);
  const [persistenceState, setPersistenceState] = useState<"saving" | "saved" | "unavailable">("saving");
  const [activeRun, setActiveRun] = useState(() =>
    newExperimentRun("synthetic landscape", initialTarget, initialBaseline, SIZE, SIZE),
  );
  const targetCanvas = useRef<HTMLCanvasElement>(null);
  const currentCanvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => paintCanvas(targetCanvas.current, target), [target]);
  useEffect(() => paintCanvas(currentCanvas.current, current), [current]);

  useEffect(() => {
    let cancelled = false;
    setPersistenceState("saving");
    saveExperimentRun(activeRun)
      .then(() => listExperimentRuns())
      .then((runs) => {
        if (cancelled) return;
        setSavedRunCount(runs.length);
        setPersistenceState("saved");
      })
      .catch(() => {
        if (!cancelled) setPersistenceState("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [activeRun]);

  const score = useMemo(() => rmse(target, current, SIZE, SIZE), [target, current]);
  const baselineScore = useMemo(() => rmse(target, baseline, SIZE, SIZE), [target, baseline]);
  const totalEvaluations = trace.reduce((sum, row) => sum + row.evaluations, 0);
  const improvement = baselineScore > 0 ? ((baselineScore - score) / baselineScore) * 100 : 0;
  const latestEvaluations = results.reduce((sum, result) => sum + result.evaluations, 0);
  const winnerId = results.length
    ? results.reduce((best, result) => (result.utility > best.utility ? result : best), results[0]).config.id
    : null;

  function reset(nextTarget = target, name = sourceName) {
    const nextBaseline = createAverageCanvas(nextTarget, SIZE, SIZE);
    setTarget(new Uint8ClampedArray(nextTarget));
    setCurrent(new Uint8ClampedArray(nextBaseline));
    setBaseline(new Uint8ClampedArray(nextBaseline));
    setResults([]);
    setTrace([]);
    setStep(0);
    setSourceName(name);
    setActiveRun(newExperimentRun(name, nextTarget, nextBaseline, SIZE, SIZE));
  }

  async function onUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    const scale = Math.max(SIZE / bitmap.width, SIZE / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    const x = (SIZE - width) / 2;
    const y = (SIZE - height) / 2;
    context.drawImage(bitmap, x, y, width, height);
    bitmap.close();
    const pixels = context.getImageData(0, 0, SIZE, SIZE).data;
    reset(new Uint8ClampedArray(pixels), file.name);
    event.target.value = "";
  }

  async function runSteps(count: number) {
    if (running) return;
    setRunning(true);
    let working = new Uint8ClampedArray(current);
    let workingStep = step;
    const appendedTrace: TraceRow[] = [];
    const persistedSteps: ExperimentStepRecord[] = [];

    try {
      for (let index = 0; index < count; index++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const stateBefore = new Uint8ClampedArray(working);
        const scoreBefore = rmse(target, stateBefore, SIZE, SIZE);
        const outcome = runOracleStep(target, working, SIZE, SIZE, workingStep, DEFAULT_SEARCH_CONFIGS);
        working = new Uint8ClampedArray(outcome.current);
        workingStep += 1;
        const scoreAfter = rmse(target, working, SIZE, SIZE);
        const teacherEvaluations = outcome.results.reduce((sum, result) => sum + result.evaluations, 0);

        setCurrent(new Uint8ClampedArray(working));
        setResults(outcome.results);
        setStep(workingStep);

        persistedSteps.push({
          step: workingStep,
          createdAt: new Date().toISOString(),
          stateBefore,
          stateAfter: new Uint8ClampedArray(working),
          scoreBefore,
          scoreAfter,
          actions: outcome.results,
          winnerConfigId: outcome.winner?.config.id ?? null,
          totalEvaluations: teacherEvaluations,
        });

        if (outcome.winner) {
          appendedTrace.push({
            step: workingStep,
            winner: outcome.winner.config.label,
            gain: outcome.winner.gain,
            evaluations: teacherEvaluations,
            score: scoreAfter,
          });
        }
      }

      if (appendedTrace.length) setTrace((previous) => [...previous, ...appendedTrace]);
      if (persistedSteps.length) {
        setActiveRun((previous) => ({
          ...previous,
          steps: [...previous.steps, ...persistedSteps],
          updatedAt: new Date().toISOString(),
        }));
      }
    } finally {
      setRunning(false);
    }
  }

  const sortedResults = [...results].sort((a, b) => b.utility - a.utility);

  return (
    <main className="lab-shell">
      <section className="hero">
        <div className="eyebrow"><span className="status-dot" /> experiment zero · live prototype</div>
        <h1>Learn where search<br />is worth spending.</h1>
        <p className="hero-copy">
          Faint compares multiple geometric search strategies from the exact same canvas state,
          measures their reconstruction gain and compute cost, then applies the oracle action.
        </p>
        <div className="hero-actions">
          <button className="button button-primary" onClick={() => runSteps(1)} disabled={running}>
            {running ? "Running…" : "Run oracle step"}
          </button>
          <button className="button" onClick={() => runSteps(5)} disabled={running}>Run 5 steps</button>
          <label className="button button-file">
            Upload image
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onUpload} />
          </label>
        </div>
      </section>

      <section className="metric-strip" aria-label="experiment metrics">
        <div><span>RMSE</span><strong>{fmt(score, 4)}</strong><small>current error</small></div>
        <div><span>Improvement</span><strong>{fmt(improvement, 1)}%</strong><small>from average canvas</small></div>
        <div><span>Steps</span><strong>{step}</strong><small>accepted primitives</small></div>
        <div><span>Evaluations</span><strong>{totalEvaluations.toLocaleString()}</strong><small>counterfactual search</small></div>
      </section>

      <section className="workspace-grid">
        <div className="panel canvas-panel">
          <div className="panel-head">
            <div>
              <span className="kicker">01 · reconstruction</span>
              <h2>Canvas state</h2>
            </div>
            <button className="text-button" onClick={() => reset()} disabled={running}>Reset</button>
          </div>

          <div className="canvas-grid">
            <figure>
              <div className="canvas-frame"><canvas ref={targetCanvas} /></div>
              <figcaption><span>Target</span><small>{sourceName}</small></figcaption>
            </figure>
            <figure>
              <div className="canvas-frame current"><canvas ref={currentCanvas} /></div>
              <figcaption><span>Faint</span><small>step {step} · {fmt(score, 4)} rmse</small></figcaption>
            </figure>
          </div>

          <div className="progress-track">
            <div style={{ width: `${Math.max(2, Math.min(100, improvement))}%` }} />
          </div>
          <div className="progress-labels"><span>average-color baseline</span><span>reconstruction progress</span></div>
        </div>

        <aside className="panel thesis-panel">
          <span className="kicker">why this matters</span>
          <h2>The model should choose computation, not pixels.</h2>
          <p>
            Every step branches into six search policies. Each policy gets the same starting image.
            We measure exact RMSE gain, evaluation cost, and a cost-aware utility before committing anything.
          </p>
          <div className="mini-flow">
            <span>state</span><i>→</i><span>6 policies</span><i>→</i><span>exact verifier</span><i>→</i><b>oracle</b>
          </div>
          <div className="callout">
            <strong>Current question</strong>
            <p>Is the per-state oracle materially better than one fixed search configuration?</p>
          </div>
        </aside>
      </section>

      <section className="panel results-panel">
        <div className="panel-head result-heading">
          <div>
            <span className="kicker">02 · counterfactual actions</span>
            <h2>Same state. Different search.</h2>
          </div>
          <div className="run-meta">{results.length ? `${latestEvaluations} evaluations this round` : "run a step to populate"}</div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Search policy</th>
                <th>Region</th>
                <th>Budget</th>
                <th>Gain</th>
                <th>Gain / 1k evals</th>
                <th>Time</th>
                <th>Utility</th>
              </tr>
            </thead>
            <tbody>
              {sortedResults.length ? sortedResults.map((result) => (
                <tr key={result.config.id} className={result.config.id === winnerId ? "winner-row" : ""}>
                  <td>
                    <div className="policy-name">
                      {result.config.id === winnerId && <span className="winner-pill">oracle</span>}
                      <strong>{result.config.label}</strong>
                    </div>
                  </td>
                  <td>{result.config.region}</td>
                  <td>{result.evaluations}</td>
                  <td className="mono">+{fmt(result.gain, 5)}</td>
                  <td className="mono">{result.evaluations ? fmt((result.gain / result.evaluations) * 1000, 4) : "—"}</td>
                  <td className="mono">{fmt(result.elapsedMs, 1)} ms</td>
                  <td className="mono">{fmt(result.utility, 5)}</td>
                </tr>
              )) : (
                <tr className="empty-row"><td colSpan={7}>No counterfactual results yet. Run the first oracle step.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <BenchmarkPanel target={target} baseline={baseline} sourceName={sourceName} width={SIZE} height={SIZE} />
      <BenchmarkSuitePanel />

      <section className="bottom-grid">
        <div className="panel trace-panel">
          <div className="panel-head">
            <div><span className="kicker">03 · search trace</span><h2>Oracle history</h2></div>
          </div>
          <div className="trace-list">
            {trace.length ? [...trace].reverse().slice(0, 8).map((row) => (
              <div className="trace-row" key={`${row.step}-${row.winner}`}>
                <span className="step-index">{String(row.step).padStart(2, "0")}</span>
                <div><strong>{row.winner}</strong><small>gain +{fmt(row.gain, 5)}</small></div>
                <span className="trace-score">{fmt(row.score, 4)}</span>
              </div>
            )) : <p className="muted">The accepted search policy from each step will appear here.</p>}
          </div>
        </div>

        <div className="panel next-panel">
          <span className="kicker">dataset</span>
          <h2>Every decision is training data.</h2>
          <p>
            Faint now persists the complete state/action/outcome record for every oracle step in IndexedDB: pixels before and after,
            all six action outcomes, the winner, exact RMSE, runtime, and renderer-evaluation cost.
          </p>
          <div className="dataset-status">
            <span className={`storage-dot ${persistenceState}`} />
            <strong>{persistenceState === "saved" ? "Persisted locally" : persistenceState === "saving" ? "Saving…" : "Storage unavailable"}</strong>
            <small>{activeRun.steps.length} states in this run · {savedRunCount} saved runs</small>
          </div>
          <div className="export-actions">
            <button
              className="button"
              disabled={!activeRun.steps.length}
              onClick={() => downloadText(`faint-run-${activeRun.id}.json`, JSON.stringify(runToSerializable(activeRun), null, 2), "application/json")}
            >
              Export dataset JSON
            </button>
            <button
              className="button"
              disabled={!activeRun.steps.length}
              onClick={() => downloadText(`faint-run-${activeRun.id}.csv`, runToCsv(activeRun), "text/csv")}
            >
              Export outcomes CSV
            </button>
          </div>
          <div className="stack-tags">
            <span>Next.js 16</span><span>TypeScript optimizer</span><span>IndexedDB</span><span>Counterfactual labels</span><span>No Python</span>
          </div>
        </div>
      </section>
    </main>
  );
}
