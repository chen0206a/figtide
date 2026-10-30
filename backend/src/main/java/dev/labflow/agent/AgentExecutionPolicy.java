package dev.labflow.agent;

/** Internal execution policy; evaluation exemptions are never accepted from HTTP requests. */
public enum AgentExecutionPolicy {
  USER_CONFIGURED,
  EVALUATION_UNBOUNDED
}
