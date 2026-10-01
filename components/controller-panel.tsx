"use client";

import { useMemo, useState } from "react";
import { createBuiltInBenchmarkDataset } from "@/lib/benchmark-dataset";
import {
  ControllerEvaluationResult,
  ControllerProgress,
  controllerResultToCsv,
  runControllerExperiment,
} from "@/lib/controller";

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

export function ControllerPanel() {
  const dataset = useMemo(() => createBuiltInBenchmarkDataset(64, 64), []);
  const [steps, setSteps] = useState(12);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ControllerProgress | null>(null);
  const [result, setResult] = useState<ControllerEvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (running) return;
    setRunning(true);
    setProgress(null);
    setError(null);
    try {
      const next = await runControllerExperiment(dataset, steps, 6, undefined, setProgress);
      setResult(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Controller experiment failed.");
    } finally {
      setRunning(false);
    }
  }

  const phaseLabel = progress?.phase === "teacher" ? "Collecting teacher data" : "Evaluating held-out policy";
  const progressPercent = progress
    ? ((progress.imageIndex * progress.totalSteps + progress.completedSteps) /
        Math.max(1, progress.imageCount * progress.totalSteps)) * 100
    : 0;

  const closesGap = (result?.oracleGapClosedPercent ?? 0) > 0;

  return (
    <section className="panel controller-panel" id="controller">
      <div className="panel-head controller-heading">
        <div>
          <span className="kicker">06 · first learned controller</span>
          <h2>Can a tiny local policy predict which search to run?</h2>
          <p className="controller-intro">
            Faint trains six ridge reward models from exact counterfactual outcomes on six images, then freezes the model
            and evaluates it on two held-out images. No API calls, no Python, and no test-state labels enter training.
          </p>
        </div>
        <div className="controller-controls">
          <select value={steps} onChange={(event) => setSteps(Number(event.target.value))} disabled={running}>
            <option value={8}>8 steps</option>
            <option value={12}>12 steps</option>
            <option value={20}>20 steps</option>
          </select>
          <button className="button button-primary" onClick={run} disabled={running}>
            {running ? "Training…" : "Train + evaluate controller"}
          </button>
        </div>
      </div>

      <div className="controller-split">
        <div>
          <span>train</span>
          <strong>6 images</strong>
          <small>{dataset.slice(0, 6).map((item) => item.label).join(" · ")}</small>
        </div>
        <div>
          <span>held out</span>
          <strong>2 images</strong>
          <small>{dataset.slice(6).map((item) => item.label).join(" · ")}</small>
        </div>
        <div>
          <span>model</span>
          <strong>6 × linear reward heads</strong>
          <small>8 standardized state features + bias</small>
        </div>
      </div>

      {running && progress && (
        <div className="controller-progress-block">
          <div className="controller-progress-copy">
            <strong>{phaseLabel}</strong>
            <span>{progress.imageLabel} · {progress.completedSteps}/{progress.totalSteps}</span>
          </div>
          <div className="controller-progress"><div style={{ width: `${progressPercent}%` }} /></div>
        </div>
      )}

      {error && <div className="suite-error">{error}</div>}

      {result ? (
        <>
          <div className="controller-metrics">
            <div>
              <span>Gap closed</span>
              <strong className={closesGap ? "metric-good" : ""}>{fmt(result.oracleGapClosedPercent, 1)}%</strong>
              <small>static → oracle gap recovered</small>
            </div>
            <div>
              <span>Action accuracy</span>
              <strong>{fmt(result.meanActionAccuracyPercent, 1)}%</strong>
              <small>held-out oracle choice match</small>
            </div>
            <div>
              <span>Mean regret</span>
              <strong>{fmt(result.meanRegret, 5)}</strong>
              <small>utility lost per decision</small>
            </div>
            <div>
              <span>Training labels</span>
              <strong>{result.trainingExamples}</strong>
              <small>counterfactual states</small>
            </div>
          </div>

          <div className="controller-score-grid">
            <div className="controller-score-card static">
              <span>global fixed</span>
              <strong>{fmt(result.meanStaticNormalizedScore, 4)}</strong>
              <small>{result.globalStaticLabel}</small>
            </div>
            <div className="controller-score-card learned">
              <span>learned controller</span>
              <strong>{fmt(result.meanControllerNormalizedScore, 4)}</strong>
              <small>{result.totalControllerExecutedEvaluations.toLocaleString()} selected-action evals</small>
            </div>
            <div className="controller-score-card oracle">
              <span>oracle ceiling</span>
              <strong>{fmt(result.meanOracleNormalizedScore, 4)}</strong>
              <small>{result.totalTeacherEvaluations.toLocaleString()} teacher evals</small>
            </div>
          </div>

          <div className="controller-result-grid">
            <div className="controller-card">
              <div className="controller-card-head">
                <span className="kicker">held-out images</span>
                <strong>Normalized RMSE · lower is better</strong>
              </div>
              <div className="controller-image-list">
                {result.images.map((image) => (
                  <div className="controller-image-row" key={image.datasetId}>
                    <div>
                      <strong>{image.label}</strong>
                      <small>{image.domain} · accuracy {fmt(image.actionAccuracyPercent, 1)}%</small>
                    </div>
                    <div className="controller-triplet mono">
                      <span title="static">S {fmt(image.staticNormalizedScore, 3)}</span>
                      <span title="learned">L {fmt(image.controllerNormalizedScore, 3)}</span>
                      <span title="oracle">O {fmt(image.oracleNormalizedScore, 3)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="controller-card">
              <div className="controller-card-head">
                <span className="kicker">model card</span>
                <strong>Local, interpretable baseline</strong>
              </div>
              <div className="controller-model-list">
                <div><span>algorithm</span><strong>ridge regression per action</strong></div>
                <div><span>ridge λ</span><strong>{result.model.ridge}</strong></div>
                <div><span>features</span><strong>{result.model.featureNames.length}</strong></div>
                <div><span>action heads</span><strong>{result.model.configs.length}</strong></div>
                <div><span>test leakage</span><strong>none by split</strong></div>
              </div>
              <div className="controller-feature-tags">
                {result.model.featureNames.map((feature) => <span key={feature}>{feature}</span>)}
              </div>
            </div>
          </div>

          <div className="controller-footer">
            <p>
              This baseline is intentionally small. If it beats the training-selected global static policy on held-out
              images, the next comparison is a contextual bandit / nonlinear tiny model; if it does not, we improve the
              state representation or action space before adding model complexity.
            </p>
            <div className="controller-export-actions">
              <button className="text-button" onClick={() => downloadText(`faint-controller-${result.id}.json`, JSON.stringify(result, null, 2), "application/json")}>Export run</button>
              <button className="text-button" onClick={() => downloadText(`faint-controller-${result.id}.csv`, controllerResultToCsv(result), "text/csv")}>Export CSV</button>
              <button className="text-button" onClick={() => downloadText(`faint-model-${result.id}.json`, JSON.stringify(result.model, null, 2), "application/json")}>Export model</button>
            </div>
          </div>
        </>
      ) : (
        <div className="controller-empty">Run the experiment to train the first policy and evaluate it only on held-out images.</div>
      )}
    </section>
  );
}
