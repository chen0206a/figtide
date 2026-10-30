package dev.labflow.review;

import java.util.List;

public interface ReviewRule {
  String id();
  List<ReviewIssue> check(ReviewContext context);
}
