"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BenchmarkProgress,
  BenchmarkResult,
  benchmarkToCsv,
  runOracleGapBenchmark,
} from "@/lib/benchmark";
import { listBenchmarkResults, saveBenchmarkResult } from "@/lib/experiment-store";

const WIDTH = 760;
const HEIGHT = 250;
const PAD = 34;

function fmt(value: number, digits = 4) {
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

function CurveChart({ result }: { result: BenchmarkResult }) {
  const bestId = result.bestStaticConfigId;
  const values = result.curve.flatMap((point) => [point.oracleScore, point.staticScores[bestId]]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.0001, max - min);
  const x = (index: number) => PAD + (index / Math.max(1, result.curve.length - 1)) * (WIDTH - PAD * 2);
  const y = (value: number) => PAD + ((max - value) / range) * (HEIGHT - PAD * 2);

  const oracle = result.curve.map((point, index) => `${x(index)},${y(point.oracleScore)}`).join(" ");
  const staticLine = result.curve.map((point, index) => `${x(index)},${y(point.staticScores[bestId])}`).join(" ");

  return (
    <div className="benchmark-chart-wrap">
      <svg className="benchmark-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Oracle versus best static RMSE curve">
        <line x1={PAD} y1={HEIGHT - PAD} x2={WIDTH - PAD} y2={HEIGHT - PAD} className="chart-axis" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={HEIGHT - PAD} className="chart-axis" />
        {[0, 0.5, 1].map((fraction) => {
          const yy = PAD + fraction * (HEIGHT - PAD * 2);
          const value = max - fraction * range;
          return (
            <g key={fraction}>
              <line x1={PAD} y1={yy} x2={WIDTH - PAD} y2={yy} className="chart-grid" />
              <text x={PAD - 8} y={yy + 4} textAnchor="end" className="chart-label">{value.toFixed(3)}</text>
            </g>
          );
        })}
        <polyline points={staticLine} className="chart-line chart-static" />
        <polyline points={oracle} className="chart-line chart-oracle" />
        <text x={PAD} y={HEIGHT - 8} className="chart-label">0</text>
        <text x={WIDTH - PAD} y={HEIGHT - 8} textAnchor="end" className="chart-label">{result.steps} steps</text>
      </svg>
      <div className="chart-legend">
        <span><i className="legend-oracle" /> per-state oracle</span>
        <span><i className="legend-static" /> best static · {result.policies.find((p) => p.configId === bestId)?.label}</span>
      </div>
    </div>
  );
}

export function BenchmarkPanel({
  target,
  baseline,
  sourceName,
  width,
  height,
}: {
  target: Uint8ClampedArray;
  baseline: Uint8ClampedArray;
  sourceName: string;
  width: number;
  height: number;
}) {
  const [steps, setSteps] = useState(20);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BenchmarkProgress | null>(null);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listBenchmarkResults().then((items) => setSavedCount(items.length)).catch(() => setSavedCount(0));
  }, []);

  useEffect(() => {
    setResult(null);
    setProgress(null);
  }, [sourceName, target]);

  async function runBenchmark() {
    if (running) return;
    setRunning(true);
    setError(null);
    setProgress({ completedSteps: 0, totalSteps: steps, latestOracleScore: 0 });
    try {
      const next = await runOracleGapBenchmark(
        target,
        baseline,
        width,
        height,
        sourceName,
        steps,
        undefined,
        setProgress,
      );
      setResult(next);
      await saveBenchmarkResult(next);
      const stored = await listBenchmarkResults();
      setSavedCount(stored.length);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Benchmark failed.");
    } finally {
      setRunning(false);
    }
  }

  const progressPercent = progress ? (progress.completedSteps / Math.max(1, progress.totalSteps)) * 100 : 0;
  const bestStatic = useMemo(
    () => result?.policies.find((policy) => policy.configId === result.bestStaticConfigId) ?? null,
    [result],
  );

  return (
    <section className="panel benchmark-panel" id="benchmark">
      <div className="panel-head benchmark-head">
        <div>
          <span className="kicker">04 · experiment zero benchmark</span>
          <h2>Measure the oracle gap.</h2>
          <p className="section-copy">
            Replay every fixed search policy from the same baseline, then compare its full trajectory against a per-state oracle.
          </p>
        </div>
        <div className="benchmark-controls">
          <select value={steps} onChange={(event) => setSteps(Number(event.target.value))} disabled={running} aria-label="Benchmark steps">
            <option value={10}>10 steps</option>
            <option value={20}>20 steps</option>
            <option value={40}>40 steps</option>
          </select>
          <button className="button button-primary" onClick={runBenchmark} disabled={running}>
            {running ? `Benchmarking ${progress?.completedSteps ?? 0}/${steps}` : "Run benchmark"}
          </button>
        </div>
      </div>

      {running && (
        <div className="benchmark-progress">
          <div style={{ width: `${progressPercent}%` }} />
        </div>
      )}

      {error && <div className="error-callout">{error}</div>}

      {result ? (
        <>
          <div className="benchmark-metrics">
            <div><span>Oracle final RMSE</span><strong>{fmt(result.oracleFinalScore)}</strong></div>
            <div><span>Best static RMSE</span><strong>{fmt(result.bestStaticFinalScore)}</strong></div>
            <div><span>Oracle gap</span><strong className={result.absoluteOracleGap > 0 ? "positive" : ""}>{result.absoluteOracleGap > 0 ? "+" : ""}{fmt(result.absoluteOracleGap, 5)}</strong></div>
            <div><span>Relative gap</span><strong>{fmt(result.relativeOracleGapPercent, 2)}%</strong></div>
          </div>

          <div className="benchmark-grid">
            <CurveChart result={result} />
            <aside className="benchmark-verdict">
              <span className="kicker">signal</span>
              <h3>{result.absoluteOracleGap > 0 ? "Dynamic configuration has room to learn." : "Static search is still competitive."}</h3>
              <p>
                The oracle finished at {fmt(result.oracleFinalScore)} RMSE versus {fmt(result.bestStaticFinalScore)} for the best fixed policy
                {bestStatic ? ` (${bestStatic.label})` : ""}. This is the first empirical signal for whether a learned controller is justified.
              </p>
              <dl>
                <div><dt>Teacher evaluations</dt><dd>{result.oracleTeacherEvaluations.toLocaleString()}</dd></div>
                <div><dt>Executed-policy evals</dt><dd>{result.oracleExecutedEvaluations.toLocaleString()}</dd></div>
                <div><dt>Saved benchmarks</dt><dd>{savedCount}</dd></div>
              </dl>
              <div className="export-actions">
                <button className="button" onClick={() => downloadText(`faint-benchmark-${result.id}.json`, JSON.stringify(result, null, 2), "application/json")}>Export JSON</button>
                <button className="button" onClick={() => downloadText(`faint-benchmark-${result.id}.csv`, benchmarkToCsv(result), "text/csv")}>Export CSV</button>
              </div>
            </aside>
          </div>

          <div className="table-wrap benchmark-table">
            <table>
              <thead><tr><th>Static policy</th><th>Final RMSE</th><th>Improvement</th><th>Evaluations</th><th>Time</th></tr></thead>
              <tbody>
                {[...result.policies].sort((a, b) => a.finalScore - b.finalScore).map((policy) => (
                  <tr key={policy.configId} className={policy.configId === result.bestStaticConfigId ? "winner-row" : ""}>
                    <td><strong>{policy.label}</strong>{policy.configId === result.bestStaticConfigId && <span className="winner-pill">best static</span>}</td>
                    <td className="mono">{fmt(policy.finalScore)}</td>
                    <td className="mono">{fmt(policy.improvement, 2)}%</td>
                    <td className="mono">{policy.evaluations.toLocaleString()}</td>
                    <td className="mono">{fmt(policy.elapsedMs, 1)} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="benchmark-empty">
          <div className="benchmark-equation"><span>best fixed policy</span><b>vs</b><span>per-state oracle</span></div>
          <p>Run this before training any decision model. A meaningful gap is the evidence that Faint has something learnable to exploit.</p>
          <small>{savedCount} benchmark{savedCount === 1 ? "" : "s"} stored locally in this browser.</small>
        </div>
      )}
    </section>
  );
}
