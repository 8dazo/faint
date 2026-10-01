# 01 — Primitive Codebase Analysis

Reference: [`fogleman/primitive`](https://github.com/fogleman/primitive)

## Algorithm in one sentence

Primitive incrementally reconstructs an image by repeatedly finding a single geometric primitive whose rasterized contribution reduces image error, then permanently committing that primitive and repeating.

```text
Target image
    ↓
Current approximation
    ↓
Generate candidate shapes
    ↓
Compute optimal color
    ↓
Exact partial image-difference score
    ↓
Keep best candidate
    ↓
Hill-climb its parameters
    ↓
Commit shape
    ↓
Repeat
```

The original README describes approximately 50–200 primitives as enough for recognizable abstract results. The code uses RMSE-like normalized pixel difference as its objective.

## Repository map

| File | Responsibility | Relevance to Faint |
|---|---|---|
| `main.go` | CLI, image loading, output and repeated `Model.Step()` calls | Entry point for instrumentation |
| `primitive/model.go` | Global target/current state, score, workers, committed shapes | **Primary controller integration point** |
| `primitive/worker.go` | Random-state generation and candidate search | **Main compute hot path** |
| `primitive/state.go` | Candidate shape, alpha and mutation state | Mutation-control integration point |
| `primitive/optimize.go` | Hill climbing and simulated annealing | Classical optimizer to preserve and benchmark |
| `primitive/core.go` | Color solve, drawing and full/partial image difference | **Exact verifier / reward source** |
| `primitive/shape.go` | Shape interface and shape-type enum | Defines discrete primitive vocabulary |
| `primitive/triangle.go` | Triangle generation, mutation, validation, rasterization | Search operator |
| `primitive/rectangle.go` | Axis-aligned / rotated rectangle search | Search operator |
| `primitive/ellipse.go` | Circle / ellipse / rotated ellipse search | Search operator |
| `primitive/quadratic.go` | Quadratic curve/stroke search | Search operator |
| `primitive/polygon.go` | Polygon search | Search operator |
| `primitive/raster.go` | Scanline rasterization helpers | Keep deterministic |
| `primitive/scanline.go` | Scanline representation / crop | Keep deterministic |
| `primitive/heatmap.go` | Accumulates search coverage | Potential state feature |
| `primitive/color.go` | Color representation | Mostly unchanged |
| `primitive/util.go` | I/O and utility functions | Mostly unchanged |
| `primitive/log.go` | Logging | Useful for traces |
| `scripts/process.py` | Batch experiments over images/configurations | Natural starting point for benchmark generation |
| `bot/main.py` | Historical Flickr/Twitter wrapper with randomized config | Shows macro parameters were already randomized externally |

## The expensive loop

The most important call is in `Model.Step()`:

```go
state := model.runWorkers(shapeType, alpha, 1000, 100, 16)
```

These values represent a broad search regime: many random candidate evaluations, hill climbing, and several independent starts distributed across workers.

Inside `worker.go`, the path is effectively:

```text
BestHillClimbState
    ↓
repeat M times
    ↓
BestRandomState
    ↓
create N random states
    ↓
Energy(candidate)
    ↓
HillClimb(best random state)
    ↓
keep best restart
```

The current implementation therefore spends substantial compute answering the question:

> Which part of this search space is worth exploring?

That is exactly the question Faint should learn to answer.

## What should remain untouched initially

Faint should **not** replace these pieces in v1:

### Exact scoring

`Worker.Energy()` rasterizes the candidate, computes an optimal color for the affected pixels, renders into a temporary buffer, and updates error using `differencePartial()`.

This is valuable because it gives us:

- deterministic ground truth,
- exact reward labels,
- cheap counterfactual evaluation,
- no learned critic required.

### Color optimization

Primitive analytically computes a useful color from target/current pixels covered by the shape rather than asking the stochastic optimizer to search RGB from scratch.

This reduces dimensionality and should stay.

### Rasterizer

The scanline rasterizer is fast, deterministic and tightly integrated with partial-difference evaluation.

### Final acceptance

A learned controller should propose **where to search**, not override the objective.

## Existing random decisions worth exposing

There are several places where the original implementation makes stochastic choices that can become controllable operators.

### Primitive family

In combo mode the shape family is randomly selected from the available primitive types.

Possible learned action:

```text
P(triangle | state)
P(rectangle | state)
P(ellipse | state)
...
```

### Initial location and scale

Constructors sample centers/vertices broadly over the image and use hand-coded scale ranges.

Possible learned action:

```text
region prior
scale bucket
orientation prior
```

### Mutation family

Each shape chooses randomly which parameter group to mutate.

Examples:

- triangle → which vertex,
- ellipse → center vs radius,
- rotated rectangle → position vs size vs angle,
- polygon → point movement vs point swap.

Possible learned action:

```text
position / size / angle / vertex / alpha / mixed
```

### Search budget

Candidate count, hill-climb age and restart count are static inputs to the worker search.

Possible learned action:

```text
proposal_count
hill_age
restarts
```

This is arguably the highest-value macro control because it directly trades quality against computation.

## Why `heatmap.go` is interesting

Primitive already contains a search heatmap abstraction but does not use it as a core decision signal.

For Faint, useful maps include:

- residual magnitude,
- gradient magnitude,
- dominant orientation,
- local variance / entropy,
- historical search coverage,
- accepted-shape coverage,
- failed-proposal density.

These can be downsampled into an `8×8` or `16×16` grid for a lightweight controller.

## Proposed instrumentation points

The first code change should add structured traces around every macro search call.

For each committed primitive:

```json
{
  "image_id": "...",
  "step": 42,
  "score_before": 0.1842,
  "score_after": 0.1787,
  "shape_type": "triangle",
  "evaluations": 9134,
  "elapsed_ms": 27.4,
  "search": {
    "random_candidates": 1000,
    "hill_age": 100,
    "restarts": 16
  }
}
```

For the oracle benchmark, branch from selected states and run multiple configurations without committing them to the canonical trajectory.

## The right abstraction boundary

Faint should introduce something conceptually like:

```go
type SearchAction struct {
    ShapeType     ShapeType
    Region        RegionPrior
    Scale         ScalePrior
    Mutation      MutationPolicy
    Candidates    int
    HillAge       int
    Restarts      int
}

type SearchController interface {
    Choose(state SearchState, actions []SearchAction) Decision
}
```

The renderer and optimizer then execute that action exactly.

## Initial conclusion

Primitive is unusually suitable for this research because:

1. the optimization loop is explicit,
2. candidate outcomes are exactly measurable,
3. search parameters are naturally discrete or bucketable,
4. many current choices are random/static,
5. counterfactual actions can be evaluated from identical states,
6. the learned component can fail safely by falling back to the original search.

The project should preserve that structure rather than replacing it with an end-to-end SVG generator.
