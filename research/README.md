# Faint Research Notebook

This folder captures the research and design work behind **Faint**: a learned controller for geometric search inspired by [`fogleman/primitive`](https://github.com/fogleman/primitive).

The key design decision is to **preserve exact rendering and verification** while learning which search action is worth spending compute on next.

## Research thesis

Classical geometric abstraction repeatedly solves a local black-box optimization problem from scratch. A learned controller can amortize experience from many previous optimization trajectories and use it to allocate search more efficiently.

We therefore study:

> **state-aware, cost-aware control of geometric optimization under a finite compute budget.**

This is closer to **dynamic algorithm configuration**, **adaptive operator selection**, and **metareasoning** than to direct neural painting.

## Documents

1. **[Primitive codebase analysis](./01-primitive-codebase.md)** — exact algorithm, search loop, hot paths, intervention points.
2. **[Related work](./02-related-work.md)** — vectorization, differentiable rendering, primitive assembly, RL painting, render feedback, dynamic configuration.
3. **[Decision models](./03-decision-models.md)** — Jev, Laya, OpenAI Decisions, local models, latency and interface constraints.
4. **[Novelty and positioning](./04-novelty.md)** — crowded ideas to avoid, defensible contribution, claims we should and should not make.
5. **[Proposed architecture](./05-architecture.md)** — controller state, action space, exact verifier, uncertainty, fallback, data format.
6. **[Experiment plan](./06-experiments.md)** — oracle-gap experiment, baselines, metrics, datasets, ablations, milestones.
7. **[Bibliography](./07-bibliography.md)** — papers, repositories and primary links.

## What changed after literature review

The first version of the idea was roughly:

```text
residual image → decision model → choose next region / primitive → optimize
```

That is not enough. Several prior systems already initialize or predict primitives from poorly reconstructed regions, learn primitive arrangements, learn sequential stroke placement, or feed intermediate renders back into the model.

The stronger version is:

```text
visual state + optimization trajectory + remaining compute
                         ↓
                  learned controller
                         ↓
     choose what SEARCH PROCEDURE to execute next
                         ↓
             classical exact optimizer
                         ↓
                 exact verification
```

The distinction is fundamental: the learned component controls **computation**, not pixels.

## Current hypothesis

For a state `s`, the best configuration of shape type, location prior, proposal count, hill-climb age, mutation operator, and restart budget changes during optimization.

If a per-state oracle can consistently outperform the best fixed configuration at the same evaluation budget, then a learnable control problem exists.

That oracle gap is the first thing Faint must measure.
