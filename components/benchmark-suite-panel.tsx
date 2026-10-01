"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createBuiltInBenchmarkDataset } from "@/lib/benchmark-dataset";
import {
  BenchmarkSuiteProgress,
  BenchmarkSuiteResult,
  benchmarkSuiteToCsv,
  runBenchmarkSuite,
} from "@/lib/benchmark-suite";
import { listBenchmarkSuites, saveBenchmarkSuite } from "@/lib/experiment-store";

function fmt(value: number, digits = 3) {
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

function DatasetPreview({ pixels, width, height }: { pixels: Uint8ClampedArray; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  }, [pixels, width, height]);
  return <canvas ref={ref} className="suite-thumb-canvas" />;
}

export function BenchmarkSuitePanel() {
  const dataset = useMemo(() => createBuiltInBenchmarkDataset(64, 64), []);
  const [steps, setSteps] = useState(12);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BenchmarkSuiteProgress | null>(null);
  const [result, setResult] = useState<BenchmarkSuiteResult | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listBenchmarkSuites()
      .then((items) => {
        setSavedCount(items.length);
        if (!result && items.length) setResult(items[0]);
      })
      .catch(() => setSavedCount(0));
  }, []);

  async function run() {
    if (running) return;
    setRunning(true);
    setError(null);
    setProgress(null);
    try {
      const next = await runBenchmarkSuite(dataset, steps, setProgress);
      setResult(next);
      await saveBenchmarkSuite(next);
      const saved = await listBenchmarkSuites();
      setSavedCount(saved.length);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Benchmark suite failed.");
    } finally {
      setRunning(false);
    }
  }

  const progressPercent = progress
    ? ((progress.imageIndex * progress.totalSteps + progress.completedSteps) /
        Math.max(1, progress.imageCount * progress.totalSteps)) * 100
    : 0;

  return (
    <section className="panel suite-panel" id="suite">
      <div className="panel-head suite-heading">
        <div>
          <span className="kicker">05 · multi-image evidence</span>
          <h2>Does dynamic search still win across domains?</h2>
          <p className="suite-intro">
            Eight deterministic images stress different search regimes. The suite selects one global fixed policy across
            the whole dataset, then compares it with the per-state oracle on every image.
          </p>
        </div>
        <div className="suite-controls">
          <select value={steps} onChange={(event) => setSteps(Number(event.target.value))} disabled={running}>
            <option value={8}>8 steps / image</option>
            <option value={12}>12 steps / image</option>
            <option value={20}>20 steps / image</option>
          </select>
          <button className="button button-primary" onClick={run} disabled={running}>
            {running ? "Running suite…" : "Run multi-image suite"}
          </button>
        </div>
      </div>

      <div className="suite-dataset-grid">
        {dataset.map((item) => (
          <figure className="suite-thumb" key={item.id}>
            <DatasetPreview pixels={item.pixels} width={item.width} height={item.height} />
            <figcaption><strong>{item.label}</strong><span>{item.domain}</span></figcaption>
          </figure>
        ))}
      </div>

      {running && progress && (
        <div className="suite-progress-block">
          <div className="suite-progress-copy">
            <strong>{progress.imageLabel}</strong>
            <span>image {progress.imageIndex + 1}/{progress.imageCount} · step {progress.completedSteps}/{progress.totalSteps}</span>
          </div>
          <div className="suite-progress"><div style={{ width: `${progressPercent}%` }} /></div>
        </div>
      )}

      {error && <div className="suite-error">{error}</div>}

      {result ? (
        <>
          <div className="suite-metrics">
            <div><span>Oracle gap</span><strong>{fmt(result.relativeOracleGapPercent, 2)}%</strong><small>vs one global fixed policy</small></div>
            <div><span>Positive images</span><strong>{result.positiveGapImages}/{result.imageCount}</strong><small>oracle beats global static</small></div>
            <div><span>Global static</span><strong>{result.globalBestStaticLabel}</strong><small>best mean normalized score</small></div>
            <div><span>Teacher evals</span><strong>{result.totalTeacherEvaluations.toLocaleString()}</strong><small>full counterfactual cost</small></div>
          </div>

          <div className="suite-result-grid">
            <div className="suite-card">
              <div className="suite-card-head"><span className="kicker">global policy ranking</span><strong>Lower normalized RMSE is better</strong></div>
              <div className="suite-policy-list">
                {result.policies.map((policy, index) => (
                  <div className="suite-policy-row" key={policy.configId}>
                    <span className="suite-rank">{String(index + 1).padStart(2, "0")}</span>
                    <div><strong>{policy.label}</strong><small>{policy.imageWins} per-image static wins</small></div>
                    <span className="mono">{fmt(policy.meanNormalizedFinalScore, 4)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="suite-card">
              <div className="suite-card-head"><span className="kicker">dataset summary</span><strong>Oracle vs global static</strong></div>
              <div className="suite-image-list">
                {result.images.map((image) => {
                  const globalStatic = image.benchmark.policies.find(
                    (policy) => policy.configId === result.globalBestStaticConfigId,
                  );
                  const gap = (globalStatic?.finalScore ?? image.benchmark.oracleFinalScore) - image.benchmark.oracleFinalScore;
                  return (
                    <div className="suite-image-row" key={image.datasetId}>
                      <div><strong>{image.label}</strong><small>{image.domain}</small></div>
                      <span className={gap > 0 ? "gap-positive mono" : "mono"}>{gap > 0 ? "+" : ""}{fmt(gap, 4)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="suite-footer">
            <span>{savedCount} suite run{savedCount === 1 ? "" : "s"} saved locally</span>
            <div>
              <button className="text-button" onClick={() => downloadText(`faint-suite-${result.id}.json`, JSON.stringify(result, null, 2), "application/json")}>Export JSON</button>
              <button className="text-button" onClick={() => downloadText(`faint-suite-${result.id}.csv`, benchmarkSuiteToCsv(result), "text/csv")}>Export CSV</button>
            </div>
          </div>
        </>
      ) : (
        <div className="suite-empty">Run the suite to measure the dataset-level oracle gap.</div>
      )}
    </section>
  );
}
