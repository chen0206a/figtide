# 任务 01d：ROC 等比例与矩阵色条位置

根据用户追加要求执行：

1. `plot-core.ts` 的 evaluation 分支末尾仅为 ROC 设置 yaxis 的 scaleanchor=x、scaleratio=1、constrain=domain，xaxis constrain=domain。PR 不变，不修改已保存的画布宽高。
2. layout 生成后，若 yaxis.scaleanchor=x，按可用绘图区 w/h 与 side=min(w,h) 设置存在的 marker.colorbar：x=0.5+side/(2*w)+0.03、xanchor=left、len=side/h。
3. 单测覆盖 ROC / PR 比例差异，默认 760×500 矩阵色条 x<1。
4. 运行 npm test、npm run build，以及 chart-corrections / evaluation / classification 三个 E2E spec；重新导出混淆矩阵与 ROC 截图并汇报。
5. 独立提交后，按用户授权继续任务 03，不进入 04。
