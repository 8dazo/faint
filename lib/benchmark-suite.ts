import { createAverageCanvas } from "@/lib/search";
import { BenchmarkResult, runOracleGapBenchmark } from "@/lib/benchmark";
import { BenchmarkDatasetItem } from "@/lib/benchmark-dataset";

export type BenchmarkSuiteImageResult = {
  datasetId: string;
  label: string;
  domain: string;
  benchmark: BenchmarkResult;
};

export type BenchmarkSuitePolicySummary = {
  configId: string;
  label: string;
  meanNormalizedFinalScore: number;
  meanImprovementPercent: number;
  imageWins: number;
};

export type BenchmarkSuiteResult = {
  id: string;
  createdAt: string;
  suiteName: string;
  stepsPerImage: number;
  imageCount: number;
  globalBestStaticConfigId: string;
  globalBestStaticLabel: string;
  globalBestStaticMeanNormalizedScore: number;
  oracleMeanNormalizedScore: number;
  meanOracleImprovementPercent: number;
  relativeOracleGapPercent: number;
  positiveGapImages: number;
  totalTeacherEvaluations: number;
  totalOracleExecutedEvaluations: number;
  policies: BenchmarkSuitePolicySummary[];
  images: BenchmarkSuiteImageResult[];
};

export type BenchmarkSuiteProgress = {
  imageIndex: number;
  imageCount: number;
  imageLabel: string;
  completedSteps: number;
  totalSteps: number;
};

function id() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function runBenchmarkSuite(
  dataset: BenchmarkDatasetItem[],
  stepsPerImage = 12,
  onProgress?: (progress: BenchmarkSuiteProgress) => void,
): Promise<BenchmarkSuiteResult> {
  if (!dataset.length) throw new Error("Benchmark dataset is empty.");

  const images: BenchmarkSuiteImageResult[] = [];

  for (let imageIndex = 0; imageIndex < dataset.length; imageIndex++) {
    const item = dataset[imageIndex];
    const baseline = createAverageCanvas(item.pixels, item.width, item.height);
    const benchmark = await runOracleGapBenchmark(
      item.pixels,
      baseline,
      item.width,
      item.height,
      item.label,
      stepsPerImage,
      undefined,
      (progress) =>
        onProgress?.({
          imageIndex,
          imageCount: dataset.length,
          imageLabel: item.label,
          completedSteps: progress.completedSteps,
          totalSteps: progress.totalSteps,
        }),
    );

    images.push({
      datasetId: item.id,
      label: item.label,
      domain: item.domain,
      benchmark,
    });
  }

  const configIds = images[0].benchmark.policies.map((policy) => policy.configId);
  const policies: BenchmarkSuitePolicySummary[] = configIds.map((configId) => {
    const label = images[0].benchmark.policies.find((policy) => policy.configId === configId)?.label ?? configId;
    const normalizedScores = images.map((image) => {
      const policy = image.benchmark.policies.find((candidate) => candidate.configId === configId);
      return policy ? policy.finalScore / Math.max(image.benchmark.baselineScore, 1e-9) : 1;
    });
    const improvements = images.map((image) =>
      image.benchmark.policies.find((candidate) => candidate.configId === configId)?.improvement ?? 0,
    );
    const imageWins = images.filter((image) => image.benchmark.bestStaticConfigId === configId).length;

    return {
      configId,
      label,
      meanNormalizedFinalScore: normalizedScores.reduce((sum, value) => sum + value, 0) / normalizedScores.length,
      meanImprovementPercent: improvements.reduce((sum, value) => sum + value, 0) / improvements.length,
      imageWins,
    };
  });

  const globalBest = policies.reduce(
    (best, policy) => policy.meanNormalizedFinalScore < best.meanNormalizedFinalScore ? policy : best,
    policies[0],
  );

  const oracleNormalizedScores = images.map((image) =>
    image.benchmark.oracleFinalScore / Math.max(image.benchmark.baselineScore, 1e-9),
  );
  const oracleMeanNormalizedScore =
    oracleNormalizedScores.reduce((sum, value) => sum + value, 0) / oracleNormalizedScores.length;
  const meanOracleImprovementPercent =
    images.reduce((sum, image) => sum + image.benchmark.oracleImprovement, 0) / images.length;

  const positiveGapImages = images.filter((image) => {
    const globalPolicy = image.benchmark.policies.find((policy) => policy.configId === globalBest.configId);
    return globalPolicy ? image.benchmark.oracleFinalScore < globalPolicy.finalScore : false;
  }).length;

  return {
    id: id(),
    createdAt: new Date().toISOString(),
    suiteName: "Faint built-in multi-domain suite",
    stepsPerImage,
    imageCount: images.length,
    globalBestStaticConfigId: globalBest.configId,
    globalBestStaticLabel: globalBest.label,
    globalBestStaticMeanNormalizedScore: globalBest.meanNormalizedFinalScore,
    oracleMeanNormalizedScore,
    meanOracleImprovementPercent,
    relativeOracleGapPercent:
      globalBest.meanNormalizedFinalScore > 0
        ? ((globalBest.meanNormalizedFinalScore - oracleMeanNormalizedScore) / globalBest.meanNormalizedFinalScore) * 100
        : 0,
    positiveGapImages,
    totalTeacherEvaluations: images.reduce((sum, image) => sum + image.benchmark.oracleTeacherEvaluations, 0),
    totalOracleExecutedEvaluations: images.reduce((sum, image) => sum + image.benchmark.oracleExecutedEvaluations, 0),
    policies: policies.sort((a, b) => a.meanNormalizedFinalScore - b.meanNormalizedFinalScore),
    images,
  };
}

export function benchmarkSuiteToCsv(result: BenchmarkSuiteResult) {
  const rows = [[
    "dataset_id",
    "label",
    "domain",
    "baseline_rmse",
    "oracle_rmse",
    "oracle_improvement_percent",
    "per_image_best_static",
    "global_static_rmse",
    "oracle_vs_global_static_gap",
  ]];

  for (const image of result.images) {
    const globalPolicy = image.benchmark.policies.find(
      (policy) => policy.configId === result.globalBestStaticConfigId,
    );
    rows.push([
      image.datasetId,
      image.label,
      image.domain,
      String(image.benchmark.baselineScore),
      String(image.benchmark.oracleFinalScore),
      String(image.benchmark.oracleImprovement),
      image.benchmark.bestStaticConfigId,
      String(globalPolicy?.finalScore ?? ""),
      String((globalPolicy?.finalScore ?? image.benchmark.oracleFinalScore) - image.benchmark.oracleFinalScore),
    ]);
  }

  return rows
    .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
    .join("\n");
}
