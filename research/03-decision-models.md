# 03 — Decision Models

Faint needs a controller that maps a compact optimizer state plus a set of possible search actions to a structured decision. This document compares Jev, Laya, OpenAI Decisions, and smaller local alternatives.

The important distinction is that **the controller is not the renderer**. Its job is to choose a bounded search action.

---

## Required interface

A useful controller API should look conceptually like:

```text
input:
  optimizer state
  available actions
  remaining budget

output:
  probability / utility for each action
  confidence or uncertainty
```

For example:

```json
{
  "state": {
    "score": 0.1842,
    "step": 47,
    "remaining_evals": 10000,
    "residual_features": "...",
    "trajectory_features": "..."
  },
  "actions": [
    "triangle_local_64",
    "ellipse_global_128",
    "rot_rect_edge_32",
    "fallback_broad_search"
  ]
}
```

Desired output:

```json
{
  "triangle_local_64": 0.46,
  "ellipse_global_128": 0.12,
  "rot_rect_edge_32": 0.34,
  "fallback_broad_search": 0.08
}
```

This distribution is more useful than a single hard label because it supports exploration, calibrated fallback, and regret analysis.

---

## Jev / System One

TypeSafe's Jev is a hosted decision model designed to return typed decisions and probabilities rather than free-form text. Current public documentation describes state as text/JSON-like structured input and supports bounded question types such as choice, scoring, and yes/no probabilities.

Reference explainer: https://laya.studio/learn/what-is-jev

### Why it fits

Faint's macro-controller naturally has a bounded action set:

```text
choice among search configurations
score expected usefulness
estimate whether broad fallback search is needed
```

A decision-oriented model is a cleaner abstraction than asking an autoregressive LLM to emit coordinates or JSON and then validating it.

### Limitations

- hosted inference introduces network latency,
- current interfaces are text/structured-state oriented rather than raw vision,
- model internals/weights are not public,
- per-step calls could cost more time than the search they save,
- domain-specific fine-tuning may be limited.

### Correct role in Faint

Use Jev as a **macro-policy benchmark** or shadow controller, not as a dependency in the inner mutation loop.

---

## Laya

Laya is an open-source decision-model project following the same broad System-One pattern: provide state and bounded questions, receive typed probabilistic answers.

Useful references:

- Explainer: https://laya.studio/learn/what-is-jev
- Search/project references: https://github.com/NandhaKishorM/laya

Published descriptions use an encoder-style architecture (e.g. ModernBERT/mmBERT variants) with a decision head rather than an autoregressive decoder.

### Why it is useful for Faint

- local inference,
- inspectable/open implementation,
- potential domain fine-tuning,
- dynamic candidate labels/actions,
- easier to benchmark against a custom local policy.

### Main mismatch

The natural input is still structured/textual state, while our underlying task is spatial.

Therefore v1 should not serialize an entire image into prose. Instead, derive compact state features:

```text
8×8 or 16×16 residual statistics
edge orientation histogram
local entropy
region ranking
recent search outcomes
operator success rates
remaining budget
```

This lets us test the *decision-model hypothesis* before training a dedicated vision policy.

---

## OpenAI Decisions API

OpenAI announced a Decisions API at DevDay 2026 for repeated structured business/software decisions. Public details are still emerging, so Faint should avoid making it foundational to the architecture.

The useful abstraction is similar:

```text
state + predefined actions → structured decision
```

### Role in Faint

Treat it as a provider behind a common interface once access/documentation are sufficiently stable.

```go
type DecisionProvider interface {
    Decide(state SearchState, actions []SearchAction) Decision
}
```

Providers could include:

```text
UniformProvider
HeuristicProvider
BanditProvider
LayaProvider
JevProvider
OpenAIDecisionsProvider
LocalPolicyProvider
```

This keeps the research question independent of any vendor.

---

## Why a normal LLM is not the preferred controller

A general LLM can certainly choose actions, but it introduces several unnecessary properties:

- autoregressive decoding overhead,
- string parsing,
- unstable formatting,
- excessive model capacity,
- poor latency-to-value ratio for tiny decisions.

A general LLM may still be useful for debugging or qualitative analysis, but it is not the right final controller.

---

## The likely final model: a small native policy

If the oracle-gap experiment succeeds, the strongest production/research controller is probably a small visual + trajectory model.

Possible architecture:

```text
residual pyramid ──► tiny CNN / ViT ──┐
                                     │
trajectory stats ──► MLP ────────────┼─► action scorer
                                     │
action embedding ────────────────────┘
```

The controller should ideally score a **dynamic set of actions** rather than use one fixed softmax head.

A simple form is:

\[
q(s,a) = f(\phi(s), \psi(a))
\]

where:

- `phi(s)` embeds visual + optimization state,
- `psi(a)` embeds a search action,
- `q` predicts utility / improvement / regret.

This makes it possible to introduce new search actions later.

---

## Candidate learning formulations

### 1. Supervised action ranking

Generate counterfactual outcomes and learn to rank actions by utility.

Pros:

- simple,
- stable,
- fully offline,
- exact labels.

This should be the first learned baseline.

### 2. Utility regression

Predict:

```text
expected error reduction
expected evaluations
expected wall-clock time
```

Then compose utility at inference time.

Advantage: one model can support different trade-offs / budgets.

### 3. Contextual bandit

Treat each macro step as a state with candidate actions and observe reward after selecting one.

Useful for online adaptation, but should come after supervised counterfactual experiments.

### 4. Offline RL / sequential policy

Useful only if long-horizon effects matter materially — e.g. an action with poor immediate gain prepares a better future decomposition.

This is more expensive and harder to debug.

### 5. Full RL

DDQN/PPO-style dynamic algorithm configuration is academically relevant but should not be the starting point. DAC literature shows training instability and exploration problems can dominate.

---

## Confidence and fallback

The controller must not be forced to act confidently.

Possible policy:

```text
high confidence   → narrow cheap search
medium confidence → moderate search
low confidence    → broad search / original Primitive
```

More formally, mix model and exploration policies:

\[
q'(a|s)=(1-\epsilon_s)q(a|s)+\epsilon_s U(a)
\]

where `epsilon_s` increases with uncertainty.

This turns uncertainty into a compute-allocation signal.

---

## Latency constraint

A decision model only helps if:

```text
controller cost < search compute saved
```

Therefore decision frequency should be coarse.

Bad design:

```text
remote model call → one tiny mutation → remote model call → ...
```

Better design:

```text
one controller call
      ↓
execute 32–1000 numerical evaluations locally
      ↓
next controller call
```

Eventually, the local controller should run in the same process or through a lightweight runtime such as ONNX / native inference.

---

## Recommended progression

1. Uniform/random controller.
2. Hand-written residual heuristic.
3. UCB/contextual-bandit baseline.
4. Laya/Jev in **shadow mode**.
5. Supervised local action-ranking model.
6. Vision + trajectory local policy.
7. Online adaptation / sequential RL only if experiments justify it.

The controller family should remain a benchmark dimension, not the definition of the project.
