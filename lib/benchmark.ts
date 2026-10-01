import {
  DEFAULT_SEARCH_CONFIGS,
  SearchConfig,
  applyCandidate,
  rmse,
  runOracleStep,
  runSearchConfig,
} from "@/lib/search";

export type BenchmarkPoint = {
  step: number;
  oracleScore: number;
  staticScores: Record<string, number>;
};

export type BenchmarkPolicySummary = {
  configId: string;
  label: string;
  finalScore: number;
  improvement: number;
  evaluations: number;
  elapsedMs: number;
};

export type BenchmarkResult = {
  id: string;
  sourceName: string;
  createdAt: string;
  steps: number;
  baselineScore: number;
  oracleFinalScore: number;
  oracleImprovement: number;
  oracleTeacherEvaluations: number;
  oracleExecutedEvaluations: number;
  oracleElapsedMs: number;
  bestStaticConfigId: string;
  bestStaticFinalScore: number;
  absoluteOracleGap: number;
  relativeOracleGapPercent: number;
  curve: BenchmarkPoint[];
  policies: BenchmarkPolicySummary[];
};

export type BenchmarkProgress = {
  completedSteps: number;
  totalSteps: number;
  latestOracleScore: number;
};

function benchmarkId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function runOracleGapBenchmark(
  target: Uint8ClampedArray,
  baseline: Uint8ClampedArray,
  width: number,
  height: number,
  sourceName: string,
  steps = 20,
  configs: SearchConfig[] = DEFAULT_SEARCH_CONFIGS,
  onProgress?: (progress: BenchmarkProgress) => void,
): Promise<BenchmarkResult> {
  const baselineScore = rmse(target, baseline, width, height);
  let oracleCurrent = new Uint8ClampedArray(baseline);
  const staticCurrents = new Map(configs.map((config) => [config.id, new Uint8ClampedArray(baseline)]));
  const staticEvaluations = new Map(configs.map((config) => [config.id, 0]));
  const staticElapsed = new Map(configs.map((config) => [config.id, 0]));

  let oracleTeacherEvaluations = 0;
  let oracleExecutedEvaluations = 0;
  let oracleElapsedMs = 0;

  const initialStaticScores = Object.fromEntries(configs.map((config) => [config.id, baselineScore]));
  const curve: BenchmarkPoint[] = [{ step: 0, oracleScore: baselineScore, staticScores: initialStaticScores }];

  for (let step = 0; step < steps; step++) {
    const oracle = runOracleStep(target, oracleCurrent, width, height, step, configs);
    oracleCurrent = oracle.current;
    oracleTeacherEvaluations += oracle.results.reduce((sum, result) => sum + result.evaluations, 0);
    oracleExecutedEvaluations += oracle.winner?.evaluations ?? 0;
    oracleElapsedMs += oracle.results.reduce((sum, result) => sum + result.elapsedMs, 0);

    const staticScores: Record<string, number> = {};

    for (let configIndex = 0; configIndex < configs.length; configIndex++) {
      const config = configs[configIndex];
      const current = staticCurrents.get(config.id) ?? new Uint8ClampedArray(baseline);
      const seed = (step + 1) * 1009 + configIndex * 7919;
      const result = runSearchConfig(target, current, width, height, config, seed);
      const next = result.candidate && result.gain > 0
        ? applyCandidate(current, width, height, result.candidate)
        : new Uint8ClampedArray(current);

      staticCurrents.set(config.id, next);
      staticEvaluations.set(config.id, (staticEvaluations.get(config.id) ?? 0) + result.evaluations);
      staticElapsed.set(config.id, (staticElapsed.get(config.id) ?? 0) + result.elapsedMs);
      staticScores[config.id] = rmse(target, next, width, height);
    }

    const oracleScore = rmse(target, oracleCurrent, width, height);
    curve.push({ step: step + 1, oracleScore, staticScores });
    onProgress?.({ completedSteps: step + 1, totalSteps: steps, latestOracleScore: oracleScore });

    // Give React a chance to paint progress during longer browser-side runs.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  const finalPoint = curve[curve.length - 1];
  const policies = configs.map((config) => {
    const finalScore = finalPoint.staticScores[config.id];
    return {
      configId: config.id,
      label: config.label,
      finalScore,
      improvement: baselineScore > 0 ? ((baselineScore - finalScore) / baselineScore) * 100 : 0,
      evaluations: staticEvaluations.get(config.id) ?? 0,
      elapsedMs: staticElapsed.get(config.id) ?? 0,
    };
  });

  const bestStatic = policies.reduce((best, policy) => (policy.finalScore < best.finalScore ? policy : best), policies[0]);
  const oracleFinalScore = finalPoint.oracleScore;
  const absoluteOracleGap = bestStatic.finalScore - oracleFinalScore;

  return {
    id: benchmarkId(),
    sourceName,
    createdAt: new Date().toISOString(),
    steps,
    baselineScore,
    oracleFinalScore,
    oracleImprovement: baselineScore > 0 ? ((baselineScore - oracleFinalScore) / baselineScore) * 100 : 0,
    oracleTeacherEvaluations,
    oracleExecutedEvaluations,
    oracleElapsedMs,
    bestStaticConfigId: bestStatic.configId,
    bestStaticFinalScore: bestStatic.finalScore,
    absoluteOracleGap,
    relativeOracleGapPercent: bestStatic.finalScore > 0 ? (absoluteOracleGap / bestStatic.finalScore) * 100 : 0,
    curve,
    policies,
  };
}

export function benchmarkToCsv(result: BenchmarkResult) {
  const configIds = result.policies.map((policy) => policy.configId);
  const header = ["step", "oracle", ...configIds];
  const rows = result.curve.map((point) => [
    String(point.step),
    String(point.oracleScore),
    ...configIds.map((id) => String(point.staticScores[id])),
  ]);
  return [header, ...rows].map((row) => row.join(",")).join("\n");
}
