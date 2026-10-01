# 02 — Related Work

This survey focuses on the research areas that overlap most strongly with Faint: geometric image abstraction, image vectorization, differentiable rendering, neural painting, render-feedback systems, and dynamic algorithm configuration.

The goal is not to collect every SVG paper. It is to understand **which parts of the Faint idea are already occupied** and where a defensible contribution remains.

---

## 1. Classical geometric abstraction

### Primitive — Fogleman

Repository: https://github.com/fogleman/primitive

Primitive reconstructs an image by greedily adding one geometric primitive at a time. Candidate shapes are randomly generated, scored against the target, locally improved with hill climbing, then committed.

Important properties:

- sequential primitive placement,
- black-box numerical optimization,
- exact raster-space objective,
- multiple primitive families,
- no learned model,
- highly interpretable output.

**Relationship to Faint:** this is our primary environment and classical baseline.

### Geometrize

Repository: https://github.com/Tw1ddle/geometrize

Geometrize is a mature continuation of this family of shape-based image recreation systems and supports a broad set of geometric primitives and practical tooling.

**Lesson:** Faint should benchmark against a tuned modern implementation, not imply that Fogleman's original repository is the only relevant classical baseline.

---

## 2. Differentiable vector rendering

### diffvg — Li et al., SIGGRAPH Asia 2020

Paper/repository: https://github.com/BachiLi/diffvg

**Differentiable Vector Graphics Rasterization for Editing and Learning** makes vector rasterization differentiable, enabling gradient descent directly on vector geometry and appearance parameters.

Why it matters:

- continuous primitive parameters can sometimes be optimized far more directly than random hill climbing,
- gradients offer a strong alternative to black-box search,
- differentiable rendering underpins many later vectorization and sketching systems.

**Boundary for Faint:** Faint's strongest case is where the search problem includes discrete primitive/operator/configuration choices or where we intentionally preserve a lightweight non-differentiable renderer. We should compare against differentiable optimization where representations overlap.

---

## 3. Raster-supervised vectorization

### Im2Vec — Reddy et al., CVPR 2021

Paper: https://openaccess.thecvf.com/content/CVPR2021/html/Reddy_Im2Vec_Synthesizing_Vector_Graphics_Without_Vector_Supervision_CVPR_2021_paper.html

Im2Vec learns vector graphics from raster supervision without requiring paired ground-truth vector representations. It renders generated vector shapes through a differentiable pipeline and trains from the resulting raster comparison.

**Lesson:** "we do not need vector labels" is not a novel claim by itself.

### LIVE — Ma et al., CVPR 2022

Paper: https://openaccess.thecvf.com/content/CVPR2022/html/Ma_Towards_Layer-Wise_Image_Vectorization_CVPR_2022_paper.html

Repository: https://github.com/Picsart-AI-Research/LIVE-Layerwise-Image-Vectorization

LIVE progressively adds Bézier paths and optimizes them with a layer-wise framework. It includes component-wise path initialization and specifically focuses new paths on parts of the image that remain poorly reconstructed.

This is one of the most important overlaps with our initial idea.

**What it occupies:**

- residual-aware placement,
- progressively adding vector paths,
- optimization after path initialization,
- compact layer-wise SVG reconstruction.

**Consequence:** "use a residual map to choose where the next primitive should go" is not a sufficient contribution for Faint.

---

## 4. Primitive-based neural abstraction

### Neural Primitive Assembly — Chen et al., ICCV 2023

Paper: https://openaccess.thecvf.com/content/ICCV2023/html/Chen_Editable_Image_Geometric_Abstraction_via_Neural_Primitive_Assembly_ICCV_2023_paper.html

The system reconstructs images from a predefined pool of simple parametric primitives — triangle, rectangle, circle and semicircle — and simultaneously predicts primitive assignments, transformations, and color parameters.

The paper explicitly frames the task as a combination of:

- combinatorial primitive selection,
- continuous parameter optimization.

It replaces expensive matching/search with a neural token-translation framework and uses differentiable rasterization for self-supervision.

**Very close overlap:** a model selecting geometric primitive types and parameters from raster images already exists.

**What remains different for Faint:** Faint does not directly predict the final primitive set. It learns **which optimizer computation to execute next**, allowing a classical exact optimizer to remain in the loop.

---

## 5. Neural painting and sequential action policies

### Learning to Paint — Huang, Heng & Zhou, ICCV 2019

Paper: https://openaccess.thecvf.com/content_ICCV_2019/html/Huang_Learning_to_Paint_With_Model-Based_Deep_Reinforcement_Learning_ICCV_2019_paper.html

Repository: https://github.com/hzwer/ICCV2019-LearningToPaint

This work uses model-based deep reinforcement learning and a neural renderer. The policy learns the position and color of sequential strokes and develops coarse-to-fine behavior without human stroke supervision.

**What it occupies:**

- sequential learned painting,
- long-horizon stroke planning,
- neural policy over rendering actions.

**Consequence:** Faint should not be described simply as "RL learns which primitive to draw next."

### Hierarchical / regional neural painters

Later painting systems introduce high-level policies that select regions and low-level policies that paint them.

**Consequence:** a hierarchy of "choose region → draw locally" is also not enough for novelty.

---

## 6. Semantic and diffusion-guided vector sketching

### CLIPasso — Vinker et al., SIGGRAPH 2022

Repository: https://github.com/yael-vinker/CLIPasso

CLIPasso models a sketch as Bézier curves and optimizes their parameters through differentiable rendering with CLIP-based perceptual/semantic losses.

**Lesson:** pixel RMSE is not the only useful objective. Faint may later include perceptual utility terms, but compute efficiency should remain its distinguishing axis.

### DiffSketcher

DiffSketcher combines vector optimization with diffusion-model guidance and uses learned attention/information to initialize strokes in useful image regions.

**Lesson:** learned spatial initialization of vector strokes is already established. Faint's controller must make decisions about the **search procedure and budget**, not only location.

---

## 7. Multimodal SVG generation

### StarVector — Rodriguez et al., CVPR 2025

Paper: https://openaccess.thecvf.com/content/CVPR2025/html/Rodriguez_StarVector_Generating_Scalable_Vector_Graphics_Code_from_Images_and_Text_CVPR_2025_paper.html

StarVector treats SVG generation as multimodal code generation. It is trained on the SVG-Stack dataset (roughly 2M samples) and handles semantic primitives, text, image vectorization, and diagram generation.

StarVector also introduces SVG-Bench and argues that pure pixel-space metrics such as MSE fail to capture important vector-graphics properties.

**Lesson for Faint:**

- direct VLM-to-SVG generation is already a strong, crowded direction,
- evaluation should include complexity and perceptual metrics in addition to RMSE,
- Faint should not compete primarily on semantic SVG code generation.

### Rendering-aware RL / RLRF

Recent SVG-generation systems use rasterized output as reinforcement feedback for generated SVG code, combining visual and semantic signals.

**Lesson:** "render generated SVG and use the render as reward" is not novel by itself.

---

## 8. Closed-loop SVG generation

### Render-in-the-Loop — Liang et al., ECCV 2026

Repository: https://github.com/Yukinonooo/Render-in-the-Loop

The central critique is that open-loop SVG generators are effectively "blind drawing": they emit the full SVG sequence without observing intermediate renderings. Render-in-the-Loop renders the current SVG after each fragment and feeds the visual result back into the model. It also introduces Render-and-Verify to reject ineffective/repetitive primitives.

**Strong overlap with naive Faint framing:**

```text
model → primitive → render → inspect canvas → next primitive
```

is already occupied.

**Key difference for Faint:** the learned model should choose **optimization actions** while the classical solver still produces/verifies the primitive.

---

## 9. Practical vectorization representations

### VectorArk — Gehlaut et al., CVPR 2026

Paper: https://openaccess.thecvf.com/content/CVPR2026/html/Gehlaut_VectorArk_Learning_Practical_Image_Vectorization_with_Rounded_Polygon_Representation_CVPR_2026_paper.html

Project: https://vectorark.github.io/

VectorArk argues that recent VLM vectorizers can struggle on real-world/degraded inputs. It introduces a rounded-polygon representation plus a degradation model to improve practical robustness.

**Lesson:** representation design itself can strongly affect vectorization quality and learnability.

For Faint, this suggests a future extension in which the available search actions include multiple primitive vocabularies. However, representation learning is not the v1 research question.

---

## 10. Dynamic Algorithm Configuration (DAC)

### Biedenkapp et al., ECAI 2020

Paper: https://doi.org/10.3233/FAIA200122

**Dynamic Algorithm Configuration: Foundation of a New Meta-Algorithmic Framework** formalizes the idea that algorithm parameters should be adjusted online because different configurations can be optimal at different points during a run. The work frames DAC as a contextual Markov Decision Process and studies reinforcement learning as a policy-learning mechanism.

This is the closest conceptual research family to Faint's final formulation.

Faint maps naturally onto DAC:

| DAC concept | Faint |
|---|---|
| Problem instance | target image |
| Algorithm state | current canvas + residual + search trace |
| Configurable parameters | shape family, proposals, hill age, restarts, mutation policy |
| Action | search configuration |
| Reward | quality improvement minus compute cost |
| Budget | renderer evaluations / time |

### Automated Dynamic Algorithm Configuration — Adriaensen et al., 2022

Survey/preprint: https://arxiv.org/abs/2205.13881

This work provides a broader formal account of DAC and positions learned dynamic parameter policies against static algorithm configuration and hand-designed adaptation.

**Lesson:** Faint can borrow experimental methodology from DAC rather than inventing evaluation terminology from scratch.

### Graph-Supported DAC — Reijnen et al., ICML 2025

Paper: https://proceedings.mlr.press/v267/reijnen25a.html

Uses graph representations of optimization state to dynamically configure evolutionary methods and studies transfer/generalization.

**Lesson:** representing the *trajectory* of the optimizer, not only the raw problem instance, can materially improve dynamic control.

### Deep RL for DAC — Nguyen et al., 2026

DOI: https://doi.org/10.1145/3821217

Recent work studies DDQN and PPO for dynamic control of evolutionary-algorithm parameters and highlights practical issues such as under-exploration, planning-horizon coverage, reward shaping, and training instability.

**Lesson:** Faint should not jump immediately to PPO. Supervised counterfactual learning and contextual bandits may be much easier because the environment can cheaply generate exact action outcomes offline.

---

## 11. Adaptive operator selection

Evolutionary-computation literature contains a long history of choosing mutation/search operators dynamically based on their observed rewards.

This maps directly to primitive mutation choices:

```text
move position
change scale
rotate
change vertex
change alpha
restart
```

**Implication:** adaptive mutation selection itself is not novel. Faint's contribution must come from the full combination of:

- visual residual state,
- optimizer trajectory state,
- search-operator selection,
- compute-budget allocation,
- counterfactual exact supervision,
- calibrated uncertainty/fallback,
- geometric image abstraction.

---

## 12. What the literature tells us NOT to claim

We should avoid claims like:

- "first neural system to reconstruct images from primitives"
- "first learned method to choose primitives"
- "first system to use raster feedback"
- "first vectorization method without vector labels"
- "first progressive vectorizer"
- "first residual-guided primitive placement"
- "first RL painter"
- "first system to dynamically select optimization operators"

All of these have clear prior art or close precedents.

---

## 13. The gap Faint can target

The strongest research gap found in this survey is:

> **Learn a cost-aware, uncertainty-aware policy that dynamically configures a classical geometric optimizer from both visual residuals and optimizer trajectory state, while retaining exact renderer-based verification and training from counterfactual optimizer outcomes.**

This is not guaranteed to be globally unique; novelty requires a proper paper-level search before publication. But it is substantially more defensible than the original "decision model chooses the next shape" idea.

The first empirical requirement is to prove that a dynamic configuration gap exists at all.
