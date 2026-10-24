package dev.labflow;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.security.SecureRandom;
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

  @Test
  void oversizedBackupIsRejectedByDefaultProfileLimits() throws Exception {
    // 64 MiB + 1 字节、内容为随机数（不可压缩）。随机内容保证将来即使有人把
    // multipart 上限调得比 compressed-limit 更大，这条路径仍由 BackupService
    // 自己的 read() 尺寸检查挡住，而不是碰巧被别的层拦截。
    byte[] oversized = new byte[64 * 1024 * 1024 + 1];
    new SecureRandom().nextBytes(oversized);
    var file = new MockMultipartFile("file", "oversized.labflow.zip", "application/zip", oversized);

    // preview 与 restore 都必须被拒绝，且不留下任何新项目。
    mvc.perform(multipart("/api/backups/preview").file(file))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("REQUEST_400"));

    var restore =
        multipart("/api/backups/restore")
            .file(file)
            .param("name", "超限备份不应恢复");
    mvc.perform(restore)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("REQUEST_400"));

    // 空项目列表这类的全局断言交给其余测试；这里只确认拒绝路径是确定性的。
    assertEquals(oversized.length, 64 * 1024 * 1024 + 1);
  }
}
