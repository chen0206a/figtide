# Windows便携包构建与发布

交付Windows x64便携ZIP，解压后双击`FigTide/FigTide.exe`。整个`app/`与`runtime/`都必须保留，无需另装Java或MySQL。不是单文件EXE，也没有MSI安装向导。当前未签名，SmartScreen可能提示；只使用可信来源并核对SHA256。真实托盘/SmartScreen人工项见SMOKE-14-5.md。

## 本地构建

开发机需要Windows x64、JDK21完整工具链、Node22.12+、Maven和Git。首次安装依赖需要联网；运行便携包不需要这些工具。优先使用JAVA_HOME，否则寻找仓库私有`.runtime/java/`。

```powershell
# 仓库根目录，默认重新构建前后端
./scripts/package-desktop.ps1
# 只复用已校验JAR与其原始依赖目录；已有输出不覆盖
./scripts/package-desktop.ps1 -SkipBuild -OutputDirectory dist/desktop/another-build
# 验证真实EXE（只使用独立临时目录）
./scripts/test-desktop-package.ps1 -Application 'dist/desktop/FigTide-0.1.0-windows-x64/FigTide'
```

输出目录`dist/desktop/FigTide-0.1.0-windows-x64/`包含应用文件夹和`release/`。发布资产为ZIP、manifest.json和SHA256SUMS.txt；不把源码工作区、`.runtime`或用户目录作为输入。manifest记录版本、Git提交/是否脏工作区、JAR/锁文件SHA和25个运行时模块（实际模块以每次构建为准）。保留`runtime/legal`、项目MIT和THIRD-PARTY-NOTICES；后端依赖的许可也保留在嵌套JAR中。

版本必须同时匹配`frontend/package.json`和`backend/pom.xml`。`-SkipBuild`仅检查JAR对应的构建元数据与依赖目录，不保证它反映最新源码；发布应使用默认完整构建且从干净提交执行。构建产物不保证逐字节可复现，manifest提供追溯信息。

## 自动化发布

`.github/workflows/desktop-release.yml`：Windows2022 + Node22 + Temurin21，先运行前端/H2/迁移测试，再打包、进行真实EXE探针、上传workflow artifact。后续14-5补充产物完整浏览器E2E。

- 手动workflow_dispatch只生成artifact。
- 推送匹配源码版本的`vX.Y.Z`标签后才走Release：先建草稿、附三个文件、最后公开；已有正式Release拒绝覆盖。
- 本次仅本地验证和提交，GitHub实际执行、签名与公开Release均未执行。

核对下载文件：

```powershell
Get-FileHash ./FigTide-0.1.0-windows-x64.zip -Algorithm SHA256
```

与同一发布的SHA256SUMS.txt比较，ZIP校验一致后解压。校验只能证明文件一致性，不能代替可信下载来源。数据位于`%LOCALAPPDATA%\FigTide\data`，日志位于`%LOCALAPPDATA%\FigTide\logs`；删除程序目录不删除这些数据。用项目备份导出/恢复转移数据，旧MySQL迁移见[MIGRATION.md](MIGRATION.md)。

打包采用JDK自带[jpackage](https://docs.oracle.com/en/java/javase/21/jpackage/packaging-overview.html)；Release使用[GitHub CLI](https://cli.github.com/manual/gh_release)。本机无WiX，因此选择app-image ZIP，安装向导不属于本次交付。
