Release正文由工作流从CHANGELOG.md对应版本自动提取。以下为历史打包背景，不再作为发布正文。

Windows x64 portable build. Extract the entire ZIP and open `FigTide.exe`.

- Includes a trimmed Java 21 runtime and embedded H2. No system JDK or MySQL needed.
- Data stays in `%LOCALAPPDATA%\FigTide\data`, separately from the program folder.
- This release is unsigned. Verify the download with `SHA256SUMS.txt`.
- Old MySQL projects can be copied with the documented migration tool; keep backups and the old database.
- Agent history and sessions are not included in project migration. Model assistance is optional and requires explicit configuration and consent.

Includes the project MIT license, dependency notices and Java runtime legal notices.
