# 06 — Experiment Plan

The research should proceed from the cheapest falsification test to the most expensive learned controller.

The goal is to avoid spending weeks training a model before proving that dynamic control can beat static search.

---

## Stage 0 — Reproducible baseline

### Goal

Reproduce original Primitive behavior and measure it precisely.

### Required instrumentation

Per accepted primitive:

- score before / after,
- shape family,
- number of exact `Energy()` evaluations,
- random proposals,
- hill-climb iterations / accepted mutations,
- restart count,
- wall-clock time,
- primitive parameters,
- region coverage,
- random seed.

### Output

A benchmark runner that can execute a fixed image set deterministically under explicit seeds and output JSONL/Parquet/CSV traces.

---

## Stage 1 — Static configuration sweep

Before learning dynamic policies, tune static search settings.

Candidate dimensions:

```text
proposal count: 32, 64, 128, 256, 512, 1000
hill age:      16, 32, 64, 100, 192
restarts:      1, 2, 4, 8, 16
shape mode:    fixed families + mixed
```

A full Cartesian product can be expensive, so start with a fractional design or successive-halving sweep.

### Why

The original default must not be treated as an optimized baseline. Faint should beat the **best reasonable static configuration at the same budget**.

---

## Stage 2 — Oracle-gap experiment

This is the most important experiment in the project.

### Protocol

1. Run canonical trajectories on 100–500 diverse images.
2. Snapshot selected states, e.g. steps 1, 5, 10, 20, 40, 80, 120.
3. From each exact snapshot, evaluate the same portfolio of search actions.
4. Do not commit counterfactual actions to the canonical run.
5. Compute utility for each action.

Example action portfolio:

```text
A triangle · local residual · 64 candidates · age 32 · 2 restarts
B ellipse  · local residual · 64 candidates · age 32 · 2 restarts
C rot-rect · edge prior     · 64 candidates · age 64 · 2 restarts
D mixed    · global         · 128 candidates · age 64 · 4 restarts
E mixed    · global         · 1000 candidates · age 100 · 16 restarts
```

### Compare

- best fixed action,
- best fixed schedule by step number,
- simple residual heuristic,
- per-state oracle.

### Decision criterion

If the per-state oracle provides little advantage over a strong fixed schedule, stop or radically simplify the project.

If the gap is large, proceed.

---

## Stage 3 — Non-neural adaptive baselines

These are essential because a complex decision model is only justified if it beats simple adaptation.

### Heuristic residual controller

Rules based on:

- top residual tile,
- edge density,
- score slope,
- late/early step number.

### Multi-armed bandit

Treat search configurations as arms and update their reward online.

Variants:

- epsilon-greedy,
- UCB1,
- Thompson sampling.

### Contextual bandit

Condition action values on state features.

This is likely one of the strongest simple baselines.

---

## Stage 4 — Jev / Laya shadow evaluation

Do not let the model control production trajectories initially.

For every sampled state:

1. serialize compact structured features,
2. present available actions,
3. request decision probabilities,
4. compare against counterfactual outcomes already measured.

Metrics:

- top-1 oracle-action accuracy,
- top-k recall,
- pairwise ranking accuracy,
- regret,
- Brier score,
- ECE / calibration,
- decision latency,
- end-to-end cost estimate.

This tells us whether general-purpose structured decision models understand the optimization state without any domain training.

---

## Stage 5 — Supervised local policy

Train on counterfactual outcomes.

### Input

```text
visual tile features
trajectory statistics
budget state
action features
```

### Targets

Prefer raw targets:

```text
error improvement
exact evaluations
wall-clock time
complexity
```

Then derive utility separately.

### Baseline models

- linear / logistic model,
- gradient-boosted trees,
- MLP,
- tiny CNN + MLP,
- tiny ViT only if image-map representation justifies it.

Do not skip trees/MLPs. If they solve the task, a larger vision model may be unnecessary.

---

## Stage 6 — Closed-loop controller

Allow the trained policy to choose macro search actions during actual reconstruction.

Evaluate full trajectories under fixed budgets.

### Headline curves

Plot reconstruction quality against:

- exact renderer evaluations,
- wall-clock milliseconds,
- accepted primitive count.

At minimum show:

```text
original Primitive
best static
residual heuristic
contextual bandit
learned local policy
oracle upper bound
```

Jev/Laya can be added if latency makes full-loop use meaningful.

---

## Stage 7 — Budget-conditioned policy

Train/evaluate the same model with explicit remaining budget.

Example modes:

```text
5k evaluations
10k evaluations
25k evaluations
50k evaluations
100k evaluations
```

Test whether strategy changes sensibly:

- low budget → high-return broad primitives,
- high budget → finer detail search,
- late budget → selective expensive refinement only when justified.

---

## Stage 8 — Mutation operator control

Only after macro-control gains are established.

Expose shape-specific mutation families as actions.

Examples:

```text
ellipse: move center / radius-x / radius-y
rotated rectangle: position / scale / rotation
triangle: vertex 1 / 2 / 3
polygon: move vertex / swap vertices
```

Compare:

- random mutation selection,
- bandit mutation selection,
- learned mutation policy.

---

# Datasets

The first benchmark does not require paired vectors.

## Natural images

Use a diverse subset of a standard natural-image dataset such as COCO or an equivalently licensed corpus.

Stratify by rough content:

```text
portraits / people
animals
landscapes
architecture
objects
high-texture scenes
low-texture scenes
```

## Graphic / synthetic images

Include:

```text
icons
logos where licensing permits
flat illustrations
simple diagrams
synthetic geometric scenes
```

## Cross-domain test

Train controller on one mixture and hold out structurally different domains.

This tests whether the model learned search behavior rather than visual memorization.

---

# Metrics

## Reconstruction

- RMSE / MSE
- PSNR
- SSIM
- LPIPS
- optional DINO/CLIP similarity

## Compute

- exact renderer/energy evaluations
- wall-clock milliseconds
- CPU time
- peak memory

## Representation

- primitive count
- path/vertex count where applicable
- serialized SVG size

## Controller

- top-1 / top-k action accuracy
- regret against per-state oracle
- utility correlation
- Brier score
- Expected Calibration Error
- fallback frequency

## Anytime metrics

Quality at fixed checkpoints:

```text
1k / 5k / 10k / 25k / 50k exact evaluations
```

and/or:

```text
10 / 25 / 50 / 100 / 250 / 500 ms
```

Anytime curves should be considered primary, not supplementary.

---

# Baselines

A credible paper should include at least:

1. Original Primitive defaults.
2. Tuned best-static Primitive.
3. Step-conditioned static schedule.
4. Residual-guided heuristic.
5. Random controller.
6. UCB/contextual bandit.
7. Learned supervised controller.
8. Per-state oracle.

Where practical also include:

- Geometrize-like modern search implementation,
- differentiable optimization baseline for compatible shape families,
- LIVE-inspired residual/path initialization,
- Jev/Laya zero-shot decision controllers.

Direct SVG generators such as StarVector/VectorArk answer a somewhat different question, but can be included qualitatively if the project later targets full vectorization rather than search-control efficiency.

---

# Core ablations

### State ablation

```text
visual only
trajectory only
visual + trajectory
visual + trajectory + budget
```

### Action ablation

```text
shape only
shape + region
shape + region + compute budget
full macro action
```

### Supervision ablation

```text
winner label only
pairwise ranking
utility regression
multi-target outcome regression
```

### Uncertainty ablation

```text
no fallback
fixed epsilon exploration
entropy-triggered fallback
learned broad-search action
```

### Generalization ablation

```text
in-domain
held-out image category
held-out resolution
held-out primitive family
new action portfolio
```

---

# Statistical protocol

Because Primitive is stochastic, do not compare one run per image.

Use:

- fixed published seeds,
- multiple seeds per image/controller,
- paired comparisons from identical initial states where possible,
- confidence intervals / bootstrap intervals,
- per-image as well as aggregate plots.

For oracle/counterfactual comparisons, branching from identical state snapshots dramatically reduces variance and should be preferred.

---

# Milestones

## M0 — Instrumentation

- deterministic runner
- exact evaluation counter
- trace export
- state snapshot/restore

## M1 — Oracle benchmark

- 100+ images
- 10k+ counterfactual states
- static vs oracle gap report

## M2 — Simple controllers

- residual heuristic
- UCB/contextual bandit
- shadow-evaluation framework

## M3 — Decision-model baseline

- Laya/Jev state serializer
- latency + regret + calibration report

## M4 — Learned local policy

- supervised training dataset
- local inference
- closed-loop anytime benchmark

## M5 — Research extensions

- budget conditioning
- mutation control
- dynamic primitive vocabulary
- cross-domain transfer

---

# Stop conditions

A research plan should state when to stop.

Reconsider the project if:

- oracle gap is negligible,
- simple static schedules capture nearly all oracle gain,
- controller inference consistently costs more than search saved,
- learned policies fail to generalize beyond training image distributions,
- gains disappear when compared at equal exact-evaluation budgets.

A negative result at Experiment Zero is valuable: it prevents us from forcing AI into a search loop that does not need it.
