# 07 — Bibliography & Source Map

This is the working bibliography for Faint. Prefer primary papers, official project pages, and original repositories when adding future references.

---

## Base systems

### Fogleman — Primitive

**Primitive Pictures: Reproducing images with geometric primitives**  
Repository: https://github.com/fogleman/primitive

Classical incremental shape-search baseline used as the starting environment for Faint.

### Tw1ddle — Geometrize

Repository: https://github.com/Tw1ddle/geometrize

A mature shape-based image geometrization implementation and useful engineering/comparison baseline.

---

## Differentiable rendering & vector learning

### Li et al. — diffvg

Tzu-Mao Li, Michal Lukáč, Michaël Gharbi, Jonathan Ragan-Kelley.  
**Differentiable Vector Graphics Rasterization for Editing and Learning.**  
ACM Transactions on Graphics / SIGGRAPH Asia, 2020.

Repository: https://github.com/BachiLi/diffvg

### Reddy et al. — Im2Vec

Pradyumna Reddy, Michael Gharbi, Michal Lukac, Niloy J. Mitra.  
**Im2Vec: Synthesizing Vector Graphics Without Vector Supervision.**  
CVPR 2021.

Paper: https://openaccess.thecvf.com/content/CVPR2021/html/Reddy_Im2Vec_Synthesizing_Vector_Graphics_Without_Vector_Supervision_CVPR_2021_paper.html

### Ma et al. — LIVE

Xu Ma, Yuqian Zhou, Xingqian Xu, Bin Sun, Valerii Filev, Nikita Orlov, Yun Fu, Humphrey Shi.  
**Towards Layer-Wise Image Vectorization.**  
CVPR 2022, pp. 16314–16323.

Paper: https://openaccess.thecvf.com/content/CVPR2022/html/Ma_Towards_Layer-Wise_Image_Vectorization_CVPR_2022_paper.html  
Repository: https://github.com/Picsart-AI-Research/LIVE-Layerwise-Image-Vectorization

---

## Geometric primitive prediction

### Chen et al. — Neural Primitive Assembly

Ye Chen, Bingbing Ni, Xuanhong Chen, Zhangli Hu.  
**Editable Image Geometric Abstraction via Neural Primitive Assembly.**  
ICCV 2023, pp. 23514–23523.

Paper: https://openaccess.thecvf.com/content/ICCV2023/html/Chen_Editable_Image_Geometric_Abstraction_via_Neural_Primitive_Assembly_ICCV_2023_paper.html

Key relevance: direct neural primitive assignment + parameter prediction from raster images with differentiable rasterization.

---

## Neural painting

### Huang, Heng & Zhou — Learning to Paint

Zhewei Huang, Wen Heng, Shuchang Zhou.  
**Learning to Paint With Model-Based Deep Reinforcement Learning.**  
ICCV 2019, pp. 8709–8718.

Paper: https://openaccess.thecvf.com/content_ICCV_2019/html/Huang_Learning_to_Paint_With_Model-Based_Deep_Reinforcement_Learning_ICCV_2019_paper.html  
Repository: https://github.com/hzwer/ICCV2019-LearningToPaint

Key relevance: sequential learned stroke actions and model-based RL.

---

## Semantic vector sketching

### Vinker et al. — CLIPasso

**CLIPasso: Semantically-Aware Object Sketching.**  
SIGGRAPH 2022.

Repository: https://github.com/yael-vinker/CLIPasso

Key relevance: Bézier sketch optimization using differentiable rendering and CLIP-based semantic objectives.

### DiffSketcher

**DiffSketcher: Text Guided Vector Sketch Synthesis through Latent Diffusion Models.**

Project/repository lookup: https://github.com/ximinng/DiffSketcher

Key relevance: diffusion-guided vector optimization and learned/attention-driven initialization.

---

## Multimodal SVG generation

### Rodriguez et al. — StarVector

Juan A. Rodriguez, Abhay Puri, Shubham Agarwal, Issam H. Laradji, Pau Rodriguez, Sai Rajeswar, David Vazquez, Christopher Pal, Marco Pedersoli.  
**StarVector: Generating Scalable Vector Graphics Code from Images and Text.**  
CVPR 2025, pp. 16175–16186.

Paper: https://openaccess.thecvf.com/content/CVPR2025/html/Rodriguez_StarVector_Generating_Scalable_Vector_Graphics_Code_from_Images_and_Text_CVPR_2025_paper.html

Key relevance: direct multimodal SVG-code generation, SVG-Stack, and SVG-Bench.

### Render-in-the-Loop — Liang et al.

Guotao Liang, Zhangcheng Wang, Juncheng Hu, Haitao Zhou, Ziteng Xue, Jing Zhang, Dong Xu, Qian Yu.  
**Render-in-the-Loop: Vector Graphics Generation via Visual Self-Feedback.**  
ECCV 2026.

Repository: https://github.com/Yukinonooo/Render-in-the-Loop

Key relevance: intermediate render feedback and Render-and-Verify during sequential SVG generation.

### Gehlaut et al. — VectorArk

Tarun Gehlaut, Difan Liu, Charu Bansal, Krutik Malani, Souymodip Chakraborty, Ankit Phogat, Matthew Fisher, Vineet Batra.  
**VectorArk: Learning Practical Image Vectorization with Rounded Polygon Representation.**  
CVPR 2026, pp. 31619–31627.

Paper: https://openaccess.thecvf.com/content/CVPR2026/html/Gehlaut_VectorArk_Learning_Practical_Image_Vectorization_with_Rounded_Polygon_Representation_CVPR_2026_paper.html  
Project: https://vectorark.github.io/

Key relevance: robust real-world vectorization and representation design.

---

## Dynamic Algorithm Configuration

### Biedenkapp et al. — DAC foundation

André Biedenkapp, H. Furkan Bozkurt, Theresa Eimer, Frank Hutter, Marius Lindauer.  
**Dynamic Algorithm Configuration: Foundation of a New Meta-Algorithmic Framework.**  
ECAI 2020.

DOI: https://doi.org/10.3233/FAIA200122  
Repository/benchmark implementation: https://github.com/automl/DAC

Key relevance: formalizes online state-dependent algorithm configuration as a contextual decision problem.

### Adriaensen et al. — Automated Dynamic Algorithm Configuration

Steven Adriaensen, André Biedenkapp, Gresa Shala, Noor Awad, Theresa Eimer, Marius Lindauer, Frank Hutter.  
**Automated Dynamic Algorithm Configuration.**  
2022.

Preprint: https://arxiv.org/abs/2205.13881

Key relevance: broad formalization and survey of learned dynamic parameter adaptation.

### Reijnen et al. — Graph-Supported DAC

Robbert Reijnen, Yaoxin Wu, Zaharah Bukhsh, Yingqian Zhang.  
**Graph-Supported Dynamic Algorithm Configuration for Multi-Objective Combinatorial Optimization.**  
ICML 2025.

Paper: https://proceedings.mlr.press/v267/reijnen25a.html

Key relevance: learned representation of optimization state/trajectory for dynamic configuration.

### Nguyen et al. — Deep RL for DAC

Tai Nguyen, Phong Le, André Biedenkapp, Carola Doerr, Nguyen Dang.  
**Deep reinforcement learning for dynamic algorithm configuration: a case study on optimizing OneMax with the (1+(λ,λ))-GA.**  
ACM Transactions on Evolutionary Learning and Optimization, 2026.

DOI: https://doi.org/10.1145/3821217

Key relevance: modern practical study of DDQN/PPO for DAC, including exploration and training-stability issues.

---

## Decision models

### Jev — TypeSafe AI

TypeSafe describes Jev as a hosted **System One** decision model returning structured choices/scores/probabilities rather than generated prose.

Useful references:

- https://laya.studio/learn/what-is-jev
- https://typesafe.ai/ (official company/project source when accessible)

Important current limitation for Faint: structured/text state rather than native image input, so a compact residual/trajectory representation is required.

### Laya

Open-source decision-model implementation following a similar structured decision interface.

References:

- https://github.com/NandhaKishorM/laya
- https://laya.studio/learn/what-is-jev

Key relevance: local/open baseline for evaluating whether a generic decision model can rank Faint search actions before training a bespoke visual policy.

### OpenAI Decisions API

Announced at OpenAI DevDay 2026 as an API for structured/repeated decision tasks. Public details are still evolving.

For Faint, it should be treated as an optional `DecisionProvider`, not a foundational dependency, until stable public documentation and access are available.

---

## Topics for the next literature pass

Before writing any paper draft, expand the bibliography in these areas:

- adaptive operator selection in evolutionary computation,
- learning to optimize / optimizer selection,
- algorithm selection and per-instance configuration,
- metareasoning / value of computation,
- budgeted inference / adaptive computation,
- amortized optimization,
- learned proposal distributions for black-box optimization,
- neural-guided program synthesis/search,
- neural combinatorial optimization,
- Bayesian optimization acquisition-cost modeling,
- anytime algorithms and performance profiles,
- learned local search / hyper-heuristics.

Those areas are likely to contain the closest conceptual precedents to Faint's final research framing.

---

## Citation hygiene

Before publication:

1. replace secondary explainers with official docs/papers wherever possible,
2. verify venue/year/page details,
3. perform Scholar/Semantic Scholar/arXiv keyword searches for every proposed novelty claim,
4. add papers that attempt learned compute allocation inside visual/vector optimization,
5. avoid any "first" claim unless the literature search supports it.
