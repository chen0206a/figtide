# 参与 LabFlow

项目当前为单用户本地科研绘图工作台。先阅读 README、docs/API.md 和各批交付记录，再调整接口或配置字段。

## 开发与验证

Windows 启动使用 `powershell -ExecutionPolicy Bypass -File scripts/start.ps1`。后端要求 Java 21 与真实 MySQL 8；集成测试使用独立 labflow_test 数据库，禁止指向用户实验库。

提交前执行：

```powershell
mvn -f backend/pom.xml test
cd frontend
npm test
npm run build
npm run e2e
```

E2E 通过真实 API 创建合成验收项目，会在本地保留这些项目。不要删除或覆盖用户原始数据；截图和样例必须明确注明合成。新增绘图算法要用已知数值做边界验证，同时检查实际导出文件，不能只比较配置对象。

配置扩展采用可选字段，保留 schema_version:1 历史数据的打开能力；变更必须同时更新 TypeScript、Java 校验、API 文档和保存恢复测试。任何过滤、分箱、归一化或统计计算都需要显式规则及可复现参数。

## 提交说明

说明触发场景、用户可见变化、验证命令与已知限制。PR 使用演示数据，避免真实研究结果和私人数据。UI 按钮需要有真实作用，未实现功能不展示可点击入口。

## 发布准备

项目许可证尚待所有者选择；此文件不授予额外使用权限，也不构成最终许可证。第三方依赖分别遵循各自许可证，复制外部 skill、代码或素材前须核实许可。GitHub Actions 已配置前后端测试工作流，但本地创建工作流不等于已经在远端执行通过；浏览器 E2E 当前由本机 Chrome 验证。
