package dev.labflow;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import dev.labflow.api.TestSupportController;
import dev.labflow.repository.WorkspaceRepository;
import org.junit.jupiter.api.Test;

class TestSupportBoundaryTest {
  @Test
  void ordinaryDatabaseIsRejectedBeforeAnySqlEvenWithTestFlag() throws Exception {
    var db = mock(WorkspaceRepository.class);
    var controller = new TestSupportController(db, "jdbc:mysql://127.0.0.1:33316/labflow?x=1");
    var method = TestSupportController.class.getDeclaredMethod("cleanup", long.class, String.class);
    method.setAccessible(true);
    var error = assertThrows(java.lang.reflect.InvocationTargetException.class,
        () -> method.invoke(controller, 1L, "1"));
    assertInstanceOf(dev.labflow.api.ApiException.class, error.getCause());
    assertEquals(403, ((dev.labflow.api.ApiException) error.getCause()).status);
    verifyNoInteractions(db);
  }
}
