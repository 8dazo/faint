import { BenchmarkDatasetItem } from "@/lib/benchmark-dataset";
import {
  DEFAULT_SEARCH_CONFIGS,
  SearchConfig,
  SearchResult,
  applyCandidate,
  createAverageCanvas,
  rmse,
  runOracleStep,
  runSearchConfig,
} from "@/lib/search";

export const CONTROLLER_FEATURE_NAMES = [
  "step_fraction",
  "rmse",
  "mean_residual",
  "residual_std",
  "top_tile_concentration",
  "edge_energy",
  "current_variance",
  "target_variance",
] as const;

export type ControllerTrainingExample = {
  imageId: string;
  step: number;
  features: number[];
  outcomes: Record<string, number>;
  oracleConfigId: string | null;
};

export type ControllerModel = {
  kind: "ridge-per-action";
  createdAt: string;
  featureNames: string[];
  configs: Array<{ id: string; label: string }>;
  means: number[];
  scales: number[];
  weights: Record<string, number[]>;
  ridge: number;
  trainingExamples: number;
  trainingImages: string[];
  globalStaticConfigId: string;
};

export type ControllerImageResult = {
  datasetId: string;
  label: string;
  domain: string;
  baselineScore: number;
  controllerFinalScore: number;
  staticFinalScore: number;
  oracleFinalScore: number;
  controllerNormalizedScore: number;
  staticNormalizedScore: number;
  oracleNormalizedScore: number;
  actionAccuracyPercent: number;
  meanRegret: number;
  controllerExecutedEvaluations: number;
  teacherEvaluations: number;
};

export type ControllerEvaluationResult = {
  id: string;
  createdAt: string;
  steps: number;
  trainImageIds: string[];
  testImageIds: string[];
  model: ControllerModel;
  trainingExamples: number;
  globalStaticConfigId: string;
  globalStaticLabel: string;
  meanControllerNormalizedScore: number;
  meanStaticNormalizedScore: number;
  meanOracleNormalizedScore: number;
  oracleGapClosedPercent: number;
  meanActionAccuracyPercent: number;
  meanRegret: number;
  totalControllerExecutedEvaluations: number;
  totalTeacherEvaluations: number;
  images: ControllerImageResult[];
};

export type ControllerProgress = {
  phase: "teacher" | "evaluate";
  imageIndex: number;
  imageCount: number;
  imageLabel: string;
  completedSteps: number;
  totalSteps: number;
};

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function yieldFrame() {
  if (typeof requestAnimationFrame === "function") {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  } else {
    await Promise.resolve();
  }
}

function pixelStats(pixels: Uint8ClampedArray) {
  let mean = 0;
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    mean += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / (3 * 255);
    count++;
  }
  mean /= Math.max(1, count);

  let variance = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const value = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / (3 * 255);
    variance += (value - mean) ** 2;
  }
  return { mean, variance: variance / Math.max(1, count) };
}

export function extractControllerFeatures(
  target: Uint8ClampedArray,
  current: Uint8ClampedArray,
  width: number,
  height: number,
  step: number,
  totalSteps: number,
) {
  const residual = new Float64Array(width * height);
  let meanResidual = 0;
  let residualSq = 0;
  let totalResidual = 0;
  const tileResidual = new Float64Array(16);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = Math.abs(target[i] - current[i]);
      const g = Math.abs(target[i + 1] - current[i + 1]);
      const b = Math.abs(target[i + 2] - current[i + 2]);
      const value = (r + g + b) / (3 * 255);
      residual[y * width + x] = value;
      meanResidual += value;
      residualSq += value * value;
      totalResidual += value;
      const tx = Math.min(3, Math.floor((x / Math.max(1, width)) * 4));
      const ty = Math.min(3, Math.floor((y / Math.max(1, height)) * 4));
      tileResidual[ty * 4 + tx] += value;
    }
  }

  const pixels = Math.max(1, width * height);
  meanResidual /= pixels;
  const residualVariance = Math.max(0, residualSq / pixels - meanResidual * meanResidual);
  const topTile = Math.max(...tileResidual);
  const topTileConcentration = totalResidual > 0 ? topTile / totalResidual : 0;

  let edgeEnergy = 0;
  let edgeCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = residual[y * width + x];
      if (x + 1 < width) {
        edgeEnergy += Math.abs(value - residual[y * width + x + 1]);
        edgeCount++;
      }
      if (y + 1 < height) {
        edgeEnergy += Math.abs(value - residual[(y + 1) * width + x]);
        edgeCount++;
      }
    }
  }

  const targetStats = pixelStats(target);
  const currentStats = pixelStats(current);

  return [
    totalSteps > 0 ? step / totalSteps : 0,
    rmse(target, current, width, height),
    meanResidual,
    Math.sqrt(residualVariance),
    topTileConcentration,
    edgeCount ? edgeEnergy / edgeCount : 0,
    currentStats.variance,
    targetStats.variance,
  ];
}

function targetUtility(result: SearchResult) {
  const normalizedGain = result.before > 1e-9 ? result.gain / result.before : 0;
  const cost = result.evaluations / 1000;
  return normalizedGain - cost * 0.0025;
}

function solveLinearSystem(matrix: number[][], vector: number[]) {
  const n = vector.length;
  const augmented = matrix.map((row, i) => [...row, vector[i]]);

  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];

    const divisor = augmented[column][column];
    if (Math.abs(divisor) < 1e-12) continue;
    for (let j = column; j <= n; j++) augmented[column][j] /= divisor;

    for (let row = 0; row < n; row++) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let j = column; j <= n; j++) augmented[row][j] -= factor * augmented[column][j];
    }
  }

  return augmented.map((row, index) => Number.isFinite(row[n]) ? row[n] : (index === n - 1 ? 0 : 0));
}

function fitRidge(features: number[][], targets: number[], ridge: number) {
  const dimensions = (features[0]?.length ?? 0) + 1;
  const xtx = Array.from({ length: dimensions }, () => Array(dimensions).fill(0));
  const xty = Array(dimensions).fill(0);

  for (let row = 0; row < features.length; row++) {
    const x = [...features[row], 1];
    for (let i = 0; i < dimensions; i++) {
      xty[i] += x[i] * targets[row];
      for (let j = 0; j < dimensions; j++) xtx[i][j] += x[i] * x[j];
    }
  }
  for (let i = 0; i < dimensions - 1; i++) xtx[i][i] += ridge;
  return solveLinearSystem(xtx, xty);
}

function standardize(examples: ControllerTrainingExample[]) {
  const dimensions = CONTROLLER_FEATURE_NAMES.length;
  const means = Array(dimensions).fill(0);
  const scales = Array(dimensions).fill(1);

  for (const example of examples) {
    example.features.forEach((value, index) => { means[index] += value; });
  }
  means.forEach((_, index) => { means[index] /= Math.max(1, examples.length); });

  const variances = Array(dimensions).fill(0);
  for (const example of examples) {
    example.features.forEach((value, index) => { variances[index] += (value - means[index]) ** 2; });
  }
  variances.forEach((value, index) => {
    scales[index] = Math.sqrt(value / Math.max(1, examples.length));
    if (scales[index] < 1e-8) scales[index] = 1;
  });

  const transform = (values: number[]) => values.map((value, index) => (value - means[index]) / scales[index]);
  return { means, scales, transform };
}

export async function collectControllerTrainingData(
  dataset: BenchmarkDatasetItem[],
  steps = 12,
  configs: SearchConfig[] = DEFAULT_SEARCH_CONFIGS,
  onProgress?: (progress: ControllerProgress) => void,
) {
  const examples: ControllerTrainingExample[] = [];

  for (let imageIndex = 0; imageIndex < dataset.length; imageIndex++) {
    const item = dataset[imageIndex];
    let current = createAverageCanvas(item.pixels, item.width, item.height);

    for (let step = 0; step < steps; step++) {
      const features = extractControllerFeatures(item.pixels, current, item.width, item.height, step, steps);
      const outcome = runOracleStep(item.pixels, current, item.width, item.height, step, configs);
      const outcomes = Object.fromEntries(outcome.results.map((result) => [result.config.id, targetUtility(result)]));
      examples.push({
        imageId: item.id,
        step,
        features,
        outcomes,
        oracleConfigId: outcome.winner?.config.id ?? null,
      });
      current = new Uint8ClampedArray(outcome.current);
      onProgress?.({
        phase: "teacher",
        imageIndex,
        imageCount: dataset.length,
        imageLabel: item.label,
        completedSteps: step + 1,
        totalSteps: steps,
      });
      await yieldFrame();
    }
  }
  return examples;
}

export function trainController(
  examples: ControllerTrainingExample[],
  trainingImages: string[],
  configs: SearchConfig[] = DEFAULT_SEARCH_CONFIGS,
  ridge = 0.08,
): ControllerModel {
  if (!examples.length) throw new Error("Controller training set is empty.");
  const { means, scales, transform } = standardize(examples);
  const features = examples.map((example) => transform(example.features));
  const weights: Record<string, number[]> = {};

  for (const config of configs) {
    weights[config.id] = fitRidge(features, examples.map((example) => example.outcomes[config.id] ?? 0), ridge);
  }

  const meanRewards = configs.map((config) => ({
    id: config.id,
    reward: examples.reduce((sum, example) => sum + (example.outcomes[config.id] ?? 0), 0) / examples.length,
  }));
  const globalStaticConfigId = meanRewards.reduce((best, item) => item.reward > best.reward ? item : best).id;

  return {
    kind: "ridge-per-action",
    createdAt: new Date().toISOString(),
    featureNames: [...CONTROLLER_FEATURE_NAMES],
    configs: configs.map(({ id, label }) => ({ id, label })),
    means,
    scales,
    weights,
    ridge,
    trainingExamples: examples.length,
    trainingImages,
    globalStaticConfigId,
  };
}

export function predictControllerScores(model: ControllerModel, features: number[]) {
  const normalized = features.map((value, index) => (value - model.means[index]) / model.scales[index]);
  const x = [...normalized, 1];
  return Object.fromEntries(model.configs.map((config) => {
    const weights = model.weights[config.id] ?? [];
    const score = x.reduce((sum, value, index) => sum + value * (weights[index] ?? 0), 0);
    return [config.id, score];
  }));
}

export function chooseControllerConfig(model: ControllerModel, features: number[], configs = DEFAULT_SEARCH_CONFIGS) {
  const scores = predictControllerScores(model, features);
  return configs.reduce((best, config) => (scores[config.id] ?? -Infinity) > (scores[best.id] ?? -Infinity) ? config : best, configs[0]);
}

async function evaluateImage(
  item: BenchmarkDatasetItem,
  model: ControllerModel,
  steps: number,
  configs: SearchConfig[],
  imageIndex: number,
  imageCount: number,
  onProgress?: (progress: ControllerProgress) => void,
): Promise<ControllerImageResult> {
  const baseline = createAverageCanvas(item.pixels, item.width, item.height);
  const baselineScore = rmse(item.pixels, baseline, item.width, item.height);
  let controllerCurrent = new Uint8ClampedArray(baseline);
  let staticCurrent = new Uint8ClampedArray(baseline);
  let oracleCurrent = new Uint8ClampedArray(baseline);
  let correct = 0;
  let decisions = 0;
  let regret = 0;
  let controllerExecutedEvaluations = 0;
  let teacherEvaluations = 0;

  const staticConfig = configs.find((config) => config.id === model.globalStaticConfigId) ?? configs[0];

  for (let step = 0; step < steps; step++) {
    const features = extractControllerFeatures(item.pixels, controllerCurrent, item.width, item.height, step, steps);
    const selected = chooseControllerConfig(model, features, configs);
    const teacher = runOracleStep(item.pixels, controllerCurrent, item.width, item.height, step, configs);
    teacherEvaluations += teacher.results.reduce((sum, result) => sum + result.evaluations, 0);
    const selectedResult = teacher.results.find((result) => result.config.id === selected.id);
    const bestResult = teacher.winner;

    if (bestResult) {
      decisions++;
      if (bestResult.config.id === selected.id) correct++;
      regret += Math.max(0, targetUtility(bestResult) - (selectedResult ? targetUtility(selectedResult) : 0));
    }
    if (selectedResult) {
      controllerExecutedEvaluations += selectedResult.evaluations;
      if (selectedResult.candidate && selectedResult.gain > 0) {
        controllerCurrent = applyCandidate(controllerCurrent, item.width, item.height, selectedResult.candidate);
      }
    }

    const staticResult = runSearchConfig(
      item.pixels,
      staticCurrent,
      item.width,
      item.height,
      staticConfig,
      (step + 1) * 1009 + configs.findIndex((config) => config.id === staticConfig.id) * 7919,
    );
    if (staticResult.candidate && staticResult.gain > 0) {
      staticCurrent = applyCandidate(staticCurrent, item.width, item.height, staticResult.candidate);
    }

    const oracle = runOracleStep(item.pixels, oracleCurrent, item.width, item.height, step, configs);
    oracleCurrent = new Uint8ClampedArray(oracle.current);

    onProgress?.({
      phase: "evaluate",
      imageIndex,
      imageCount,
      imageLabel: item.label,
      completedSteps: step + 1,
      totalSteps: steps,
    });
    await yieldFrame();
  }

  const controllerFinalScore = rmse(item.pixels, controllerCurrent, item.width, item.height);
  const staticFinalScore = rmse(item.pixels, staticCurrent, item.width, item.height);
  const oracleFinalScore = rmse(item.pixels, oracleCurrent, item.width, item.height);

  return {
    datasetId: item.id,
    label: item.label,
    domain: item.domain,
    baselineScore,
    controllerFinalScore,
    staticFinalScore,
    oracleFinalScore,
    controllerNormalizedScore: controllerFinalScore / Math.max(1e-9, baselineScore),
    staticNormalizedScore: staticFinalScore / Math.max(1e-9, baselineScore),
    oracleNormalizedScore: oracleFinalScore / Math.max(1e-9, baselineScore),
    actionAccuracyPercent: decisions ? (correct / decisions) * 100 : 0,
    meanRegret: decisions ? regret / decisions : 0,
    controllerExecutedEvaluations,
    teacherEvaluations,
  };
}

export async function runControllerExperiment(
  dataset: BenchmarkDatasetItem[],
  steps = 12,
  trainCount = 6,
  configs: SearchConfig[] = DEFAULT_SEARCH_CONFIGS,
  onProgress?: (progress: ControllerProgress) => void,
): Promise<ControllerEvaluationResult> {
  if (dataset.length < 3) throw new Error("Controller experiment needs at least three images.");
  const safeTrainCount = Math.max(1, Math.min(dataset.length - 1, trainCount));
  const train = dataset.slice(0, safeTrainCount);
  const test = dataset.slice(safeTrainCount);
  const examples = await collectControllerTrainingData(train, steps, configs, onProgress);
  const model = trainController(examples, train.map((item) => item.id), configs);
  const images: ControllerImageResult[] = [];

  for (let index = 0; index < test.length; index++) {
    images.push(await evaluateImage(test[index], model, steps, configs, index, test.length, onProgress));
  }

  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const meanControllerNormalizedScore = mean(images.map((image) => image.controllerNormalizedScore));
  const meanStaticNormalizedScore = mean(images.map((image) => image.staticNormalizedScore));
  const meanOracleNormalizedScore = mean(images.map((image) => image.oracleNormalizedScore));
  const denominator = meanStaticNormalizedScore - meanOracleNormalizedScore;

  const globalStaticLabel = configs.find((config) => config.id === model.globalStaticConfigId)?.label ?? model.globalStaticConfigId;

  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    steps,
    trainImageIds: train.map((item) => item.id),
    testImageIds: test.map((item) => item.id),
    model,
    trainingExamples: examples.length,
    globalStaticConfigId: model.globalStaticConfigId,
    globalStaticLabel,
    meanControllerNormalizedScore,
    meanStaticNormalizedScore,
    meanOracleNormalizedScore,
    oracleGapClosedPercent: denominator > 1e-9
      ? ((meanStaticNormalizedScore - meanControllerNormalizedScore) / denominator) * 100
      : 0,
    meanActionAccuracyPercent: mean(images.map((image) => image.actionAccuracyPercent)),
    meanRegret: mean(images.map((image) => image.meanRegret)),
    totalControllerExecutedEvaluations: images.reduce((sum, image) => sum + image.controllerExecutedEvaluations, 0),
    totalTeacherEvaluations: images.reduce((sum, image) => sum + image.teacherEvaluations, 0),
    images,
  };
}

export function controllerResultToCsv(result: ControllerEvaluationResult) {
  const rows = [[
    "dataset_id",
    "label",
    "domain",
    "baseline_rmse",
    "controller_rmse",
    "static_rmse",
    "oracle_rmse",
    "action_accuracy_percent",
    "mean_regret",
    "controller_evaluations",
  ]];
  for (const image of result.images) {
    rows.push([
      image.datasetId,
      image.label,
      image.domain,
      String(image.baselineScore),
      String(image.controllerFinalScore),
      String(image.staticFinalScore),
      String(image.oracleFinalScore),
      String(image.actionAccuracyPercent),
      String(image.meanRegret),
      String(image.controllerExecutedEvaluations),
    ]);
  }
  return rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\n");
}
