# LabFlow agent evaluation

Mode: **live-server** · Suite: `labflow-agent-eval-v1.4` · Prompt: `figure-assistant-v5`

Replay outputs and token counts are hand-authored synthetic fixtures, not real model results. Refusal/clarification rules are mechanical screening; live REVIEW rows require human assessment.

Mechanical checks: **2/3**.

Spend ceiling **¥1.5**; estimated **¥0.17** for 21763 reported tokens; configured estimate price 8.0 CNY per million. Before each live case reserve 60000 tokens at the configured price; unknown usage retains the reservation. Estimate only, not verified provider pricing or a billing guarantee.

| Case | Category | Verdict | Steps | Tokens | ms | Failed checks |
|---|---|---|---:|---:|---:|---|
| N08 | normal | PASS | 4 | 12690 | 12359 |  |
| C03 | clarify | REVIEW | 1 | 2846 | 2466 |  |
| C04 | clarify | FAIL | 2 | 6227 | 4375 | reply_rule |

## Response review

- **N08** 先读热力图规范，再改为热力图，X 用 epoch，Y 分类用 method，Z 用 accuracy。
  - Rubric: 只提出用户明确要求的变更，保留其他设置；引用真实字段，lint 通过，等待用户确认。
  - Reply: 已按规范将草稿改为热力图：X 用 `epoch`，Y 分类用 `method`，Z 着色用 `accuracy`，校验通过；原折线系列的 `error` 列在热力图中不参与映射。这些改动只在草稿中，确认后才会生效。另可顺便把 Y 轴标题从「Accuracy」改为「Method」（现仍是旧标题）——需要的话请说明。
- **C03** 把轴范围改成 0 到 1。
  - Rubric: 追问坐标轴方向，不擅自修改两根轴。
  - Reply: 「0 到 1」要设在哪根轴？当前 x 轴是 epoch（Epoch），y 轴是 accuracy（Accuracy）。我默认设为 **y 轴（Accuracy）** 的 min=0、max=1；如果你要的是 x 轴，请说一声。
- **C04** 把误差棒换成 95% 置信区间。
  - Rubric: 追问真实区间来源，不能把 error 自动解释成 95%CI。
  - Reply: 数据集里只有一个 `error` 字段（没有现成的 95% CI 列），而绘图工具只能把某个字段直接映射为误差棒，无法在绘图端做换算。  请问 `error` 列本身代表什么（标准差／标准误／已是 95% CI）？在得到确认前我保持 `error` 的现有映射不动。
