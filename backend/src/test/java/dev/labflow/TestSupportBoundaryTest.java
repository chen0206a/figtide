package dev.labflow;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import dev.labflow.api.TestSupportController;
import dev.labflow.repository.WorkspaceRepository;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * 任务 14-1-4.2：测试清理接口的库守卫。MySQL 规则保持不变；H2 测试库（labflow_test / labflow_e2e）允许，
 * 真实工作区库无论哪种数据库都必须在执行任何 SQL 之前拒绝。
 */
class TestSupportBoundaryTest {
  @Test
  void ordinaryDatabaseIsRejectedBeforeAnySqlEvenWithTestFlag() throws Exception {
    var db = mock(WorkspaceRepository.class);
    var controller = new TestSupportController(db, "jdbc:mysql://127.0.0.1:33316/labflow?x=1");
    var error = assertThrows(java.lang.reflect.InvocationTargetException.class,
        () -> method().invoke(controller, 1L, "1"));
    assertInstanceOf(dev.labflow.api.ApiException.class, error.getCause());
    assertEquals(403, ((dev.labflow.api.ApiException) error.getCause()).status);
    verifyNoInteractions(db);
  }

  @Test
  void h2InMemoryTestDatabaseIsAccepted() throws Exception {
    var db = mock(WorkspaceRepository.class);
    when(db.query(anyString(), any(Object[].class))).thenReturn(List.of());
    var controller =
        new TestSupportController(db, "jdbc:h2:mem:labflow_test;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1");
    @SuppressWarnings("unchecked")
    Map<String, Object> result = (Map<String, Object>) method().invoke(controller, 1L, "1");
    assertEquals(0, ((Number) result.get("deleted")).intValue());
    verify(db, never()).update(anyString(), any(Object[].class));
  }

  @Test
  void h2FileTestDatabaseIsAccepted() throws Exception {
    var db = mock(WorkspaceRepository.class);
    when(db.query(anyString(), any(Object[].class))).thenReturn(List.of());
    var controller = new TestSupportController(db, "jdbc:h2:file:./.runtime/tmp-e2e/labflow_e2e;MODE=MySQL");
    @SuppressWarnings("unchecked")
    Map<String, Object> result = (Map<String, Object>) method().invoke(controller, 1L, "1");
    assertEquals(0, ((Number) result.get("deleted")).intValue());
    verify(db, never()).update(anyString(), any(Object[].class));
  }

  @Test
  void h2RealWorkspaceDatabaseIsRejectedBeforeAnySql() throws Exception {
    var db = mock(WorkspaceRepository.class);
    var controller =
        new TestSupportController(
            db, "jdbc:h2:file:./.runtime/desktop-data/figtide;MODE=MySQL;DATABASE_TO_LOWER=TRUE");
    var error =
        assertThrows(
            InvocationTargetException.class, () -> method().invoke(controller, 1L, "1"));
    assertInstanceOf(dev.labflow.api.ApiException.class, error.getCause());
    assertEquals(403, ((dev.labflow.api.ApiException) error.getCause()).status);
    verifyNoInteractions(db);
  }

  @Test
  void h2DatabaseWhoseNameOnlyStartsWithTestSuffixIsRejected() throws Exception {
    var db = mock(WorkspaceRepository.class);
    var controller = new TestSupportController(db, "jdbc:h2:mem:labflow_test_backup");
    var error =
        assertThrows(
            InvocationTargetException.class, () -> method().invoke(controller, 1L, "1"));
    assertInstanceOf(dev.labflow.api.ApiException.class, error.getCause());
    assertEquals(403, ((dev.labflow.api.ApiException) error.getCause()).status);
    verifyNoInteractions(db);
  }

  private static Method method() throws NoSuchMethodException {
    var method = TestSupportController.class.getDeclaredMethod("cleanup", long.class, String.class);
    method.setAccessible(true);
    return method;
  }
}
