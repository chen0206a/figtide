package dev.labflow;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Inherited;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ContextConfiguration;

/**
 * {@code @SpringBootTest} 的组合注解（任务 14-1-4.1）：不带额外属性的 Spring Boot 集成测试直接用它，
 * 数据源由 {@link TestDatasourceInitializer} 按 {@code LABFLOW_TEST_DB} 注入（mysql 默认 / h2）。
 * 需要额外 inlined properties 的类请回到 {@code @SpringBootTest(properties=...)} 并自行叠加
 * {@code @ContextConfiguration(initializers = TestDatasourceInitializer.class)}。
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Inherited
@SpringBootTest
@ContextConfiguration(initializers = TestDatasourceInitializer.class)
public @interface LabflowIntegrationTest {}
