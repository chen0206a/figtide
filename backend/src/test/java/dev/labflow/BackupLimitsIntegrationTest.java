package dev.labflow;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import dev.labflow.service.BackupService;
import dev.labflow.service.WorkspaceService;
import dev.labflow.repository.WorkspaceRepository;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 任务 14-3-1：备份大小上限改为配置项后，默认 profile（测试上下文未覆盖任何
 * labflow.backup.* 配置）必须仍然按 64 MiB / 96 MiB 拒绝超限备份。desktop profile
 * 的 512/768 MiB 上限由迁移工具的 E2E（scripts/migrate-to-desktop.ps1）覆盖。
 */
@LabflowIntegrationTest
@AutoConfigureMockMvc
class BackupLimitsIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired BackupService backups;
  @Autowired WorkspaceService workspace;
  @Autowired WorkspaceRepository db;
  static final int MIB = 1024 * 1024;

  byte[] validBackup() {
    var project = workspace.createProject("边界测试 · 合成", "test only");
    return backups.export(((Number) project.get("id")).longValue());
  }

  long projectCount() { return ((Number) db.one("SELECT COUNT(*) n FROM projects").get("n")).longValue(); }

  @Test
  void oversizedBackupIsRejectedByDefaultProfileLimits() throws Exception {
    // A real two-entry backup plus trailing padding remains readable by the
    // product's ZipInputStream. Acceptance at 64 MiB rules out format failures.
    byte[] valid = validBackup();
    byte[] atLimit = Arrays.copyOf(valid, 64 * MIB);
    mvc.perform(multipart("/api/backups/preview")
        .file(new MockMultipartFile("file", "limit.zip", "application/zip", atLimit)))
        .andExpect(status().isOk());
    byte[] oversized = Arrays.copyOf(valid, 64 * MIB + 1);
    var file = new MockMultipartFile("file", "oversized.labflow.zip", "application/zip", oversized);

    long before = projectCount();
    mvc.perform(multipart("/api/backups/preview").file(file))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("REQUEST_400"))
        .andExpect(jsonPath("$.message").value("项目备份：压缩文件须在 64 MiB 以内"));

    var restore =
        multipart("/api/backups/restore")
            .file(file)
            .param("name", "超限备份不应恢复");
    mvc.perform(restore)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("REQUEST_400"))
        .andExpect(jsonPath("$.message").value("项目备份：压缩文件须在 64 MiB 以内"));
    assertEquals(before, projectCount());
  }

  @Test
  void expandedLimitAcceptsExactly96MiBAndRejectsOneExtraByte() throws Exception {
    byte[] original = validBackup(), manifest;
    try (var input = new ZipInputStream(new ByteArrayInputStream(original))) {
      assertEquals("manifest.json", input.getNextEntry().getName());
      manifest = input.readAllBytes();
    }
    // Trailing JSON whitespace keeps the manifest valid without inflating a
    // field, row count or string beyond its independent validation limit.
    byte[] exact = expandedZip(manifest, 96 * MIB - 64);
    mvc.perform(multipart("/api/backups/preview")
        .file(new MockMultipartFile("file", "exact.zip", "application/zip", exact)))
        .andExpect(status().isOk());
    byte[] tooLarge = expandedZip(manifest, 96 * MIB - 64 + 1);
    long before = projectCount();
    for (String endpoint : List.of("preview", "restore")) {
      mvc.perform(multipart("/api/backups/" + endpoint)
          .file(new MockMultipartFile("file", "expanded.zip", "application/zip", tooLarge))
          .param("name", "超限不恢复"))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.message").value("项目备份：展开内容超过 96 MiB"));
    }
    assertEquals(before, projectCount());
  }

  byte[] expandedZip(byte[] manifest, int expandedBytes) throws Exception {
    var output = new ByteArrayOutputStream();
    var digest = MessageDigest.getInstance("SHA-256");
    try (var zip = new ZipOutputStream(output)) {
      zip.putNextEntry(new ZipEntry("manifest.json"));
      zip.write(manifest); digest.update(manifest);
      byte[] spaces = new byte[8192]; Arrays.fill(spaces, (byte) ' ');
      for (int remaining = expandedBytes - manifest.length; remaining > 0; ) {
        int count = Math.min(remaining, spaces.length);
        zip.write(spaces, 0, count); digest.update(spaces, 0, count); remaining -= count;
      }
      zip.closeEntry(); zip.putNextEntry(new ZipEntry("sha256.txt"));
      zip.write(HexFormat.of().formatHex(digest.digest()).getBytes(StandardCharsets.US_ASCII));
      zip.closeEntry();
    }
    return output.toByteArray();
  }
}
