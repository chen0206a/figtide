package dev.labflow;

import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.test.context.support.TestPropertySourceUtils;

/**
 * 测试数据源参数化（任务 14-1-4.1）。集成测试不再各自写死 MySQL 地址，统一通过本初始化器读取环境变量
 * {@code LABFLOW_TEST_DB}：
 *
 * <ul>
 *   <li>{@code mysql}（默认，行为与 14-1 之前完全一致）：{@code jdbc:mysql://127.0.0.1:33316/labflow_test}
 *   <li>{@code h2}：内存 H2（MODE=MySQL，与 desktop profile 同一套 URL 参数），Flyway 位置指向
 *       {@code classpath:db/migration-h2}
 * </ul>
 *
 * <p>用法一（简单类）：直接标注 {@code @LabflowIntegrationTest}；用法二（还需要额外 inlined
 * properties 的类）：保留 {@code @SpringBootTest(properties=...)} 并叠加 {@code
 * @ContextConfiguration(initializers = TestDatasourceInitializer.class)}。不要在各测试类里再写一份数据源地址。
 */
public final class TestDatasourceInitializer
    implements ApplicationContextInitializer<ConfigurableApplicationContext> {

  /** 环境变量只读一次；与 surefire 进程一致，整个 JVM 内不可变。 */
  public static final String TEST_DB =
      System.getenv().getOrDefault("LABFLOW_TEST_DB", "mysql").trim().toLowerCase();

  static final String MYSQL_URL =
      "jdbc:mysql://127.0.0.1:33316/labflow_test?useUnicode=true&characterEncoding=UTF-8&serverTimezone=UTC";

  static final String H2_URL =
      "jdbc:h2:mem:labflow_test;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE;DB_CLOSE_DELAY=-1";

  public static boolean isMysql() {
    return "mysql".equals(TEST_DB);
  }

  @Override
  public void initialize(ConfigurableApplicationContext context) {
    switch (TEST_DB) {
      case "mysql" -> TestPropertySourceUtils.addInlinedPropertiesToEnvironment(
          context, "spring.datasource.url=" + MYSQL_URL);
      case "h2" -> TestPropertySourceUtils.addInlinedPropertiesToEnvironment(
          context,
          "spring.datasource.url=" + H2_URL,
          "spring.datasource.username=sa",
          "spring.datasource.password=",
          "spring.flyway.locations=classpath:db/migration-h2");
      default -> throw new IllegalStateException(
          "LABFLOW_TEST_DB 仅支持 mysql 或 h2，当前值: '" + TEST_DB + "'");
    }
  }
}
