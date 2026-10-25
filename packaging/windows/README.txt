FigTide Windows x64 便携版

把整个文件夹解压到你选择的位置，双击 FigTide.exe。
无需安装 Java、MySQL，也不需要管理员权限。请保留 app 和 runtime 文件夹，不要只移动 EXE。

启动后自动用系统默认浏览器打开界面。关闭浏览器不会退出，请从托盘菜单选择“退出”。
再次双击会打开已经运行的实例。

数据：%LOCALAPPDATA%\FigTide\data
日志：%LOCALAPPDATA%\FigTide\logs\figtide.log
删除程序文件夹不会删除这些数据；重要项目可在界面中导出备份。
从旧版迁移：https://github.com/chen0206a/figtide/blob/main/docs/desktop/MIGRATION.md

默认地址 http://127.0.0.1:17861/；首选端口写在数据目录 desktop.json。
端口占用时本次临时随机，托盘会提示本次无法沿用草稿/偏好；下次仍尝试首选。

数据和所有版本保存在本机。配置模型并明确同意后，绘图助手才会向所选模型服务
发送图表配置与字段摘要，不发送原始数据行和文件名；模型服务可能计费。

第一版未做代码签名，Windows可能显示SmartScreen提示。
请从项目官方Release下载，并按 SHA256SUMS.txt 核对 ZIP；不要运行来源不明的修改版本。
项目代码采用MIT，第三方依赖及Java运行时采用其各自许可证，见LICENSE、
THIRD-PARTY-NOTICES.txt及runtime/legal。

这是一份便携程序，不包含安装向导、自动更新或跨浏览器草稿迁移。
