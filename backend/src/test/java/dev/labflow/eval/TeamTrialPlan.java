package dev.labflow.eval;

import java.util.*;

/** Repeated trials remain clustered by task; scheduling never changes product behavior. */
final class TeamTrialPlan {
  record Pair(String id, int repetition, List<String> modes) {}

  static List<Pair> pairs(Collection<String> ids, int repetitions, long seed) {
    if (repetitions < 1 || repetitions > 10) throw new IllegalArgumentException("Repetitions must be 1..10");
    var unique = new LinkedHashSet<>(ids);
    if (unique.size() != ids.size()) throw new IllegalArgumentException("Duplicate task ID");
    var result = new ArrayList<Pair>();
    int index = 0;
    for (int repeat = 1; repeat <= repetitions; repeat++) {
      var shuffled = new ArrayList<>(unique);
      Collections.shuffle(shuffled, new Random(seed + repeat));
      for (String id : shuffled) {
        result.add(new Pair(id, repeat, index++ % 2 == 0
            ? List.of("single", "team") : List.of("team", "single")));
      }
    }
    return result;
  }

  static Map<String, Double> taskMeans(Map<String, List<Double>> samples) {
    var means = new LinkedHashMap<String, Double>();
    samples.forEach((id, values) -> {
      if (!values.isEmpty()) means.put(id, values.stream().mapToDouble(Double::doubleValue).average().orElseThrow());
    });
    return means;
  }
}
