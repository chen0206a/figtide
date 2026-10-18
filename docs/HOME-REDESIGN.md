# 首页与品牌更新 · 2026-10-18

本轮在既有 LabFlow 上调整首页与品牌，不扩展第二阶段绘图功能。

## 视觉与交互

- 暖白背景、白色功能区、石墨色主按钮、淡蓝品牌点缀；采用统一无衬线排版和轻量边框。
- 原创 LF 连笔矢量标志，统一用于首页、导航与 favicon；不使用第三方品牌素材。
- 首次进入依次展示标志、名称、介绍、操作入口与工作区；整个过程不阻塞操作。当前标签页再次进入跳过入场动画。
- 使用 CSS opacity / transform 与标志路径动画，不新增动画依赖；支持 prefers-reduced-motion、键盘焦点和悬停反馈。
- 绘图、上传、实验与数据入口连接现有真实功能；最近项目与图表读取服务端数据，并提供加载、空白与错误状态。
- 移除首页旧静态图版组件；科研绘图编辑器与数据解析流程沿用既有实现。DeepSeek 提议的上传确认向导未在本轮实现。

## 本轮验证

- 前端单元测试：8/8 通过。
- TypeScript 检查与生产构建通过；Plotly 编辑器分包仍存在体积提示。
- Chrome / Playwright：6/6 通过，包含原有编辑器与上传保存导出流程，以及新增的入场时序、返回首页、真实功能导航、减少动态效果、键盘访问、1280px 无横向溢出验证。
- 真实后端与 MySQL 在运行；本轮没有修改 Java 代码，也未重新运行 Java 测试。
- 查看了 1560px 与 1280px 首页截图。浏览器测试会在本地数据库创建验收项目；没有删除既有项目。

## 运行与检查

```powershell
cd 'D:\RAG-agent项目\LabFlow'
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
cd frontend
npm test
npm run build
npm run e2e
```

访问 http://127.0.0.1:5176 。要重新查看完整入场动画，可在新标签页打开。

- [首页截图](screenshots/home.png)
- [1280px 首页截图](screenshots/home-1280.png)

桌面优先；本轮未验证 Safari、Firefox 与移动端。此前测试报告中的旧首页图版说明不再描述当前首页。
