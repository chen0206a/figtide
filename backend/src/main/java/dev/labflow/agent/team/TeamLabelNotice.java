package dev.labflow.agent.team;

import com.fasterxml.jackson.databind.JsonNode;

/** Warn about labels to check, without guessing their meaning or changing the proposal. */
final class TeamLabelNotice {
  private TeamLabelNotice() {}

  static String forMappingChange(JsonNode before,JsonNode after){
    boolean xChanged=!before.path("x").equals(after.path("x"));
    boolean xTitleUnchanged=!before.at("/axes/x/title").asText().isBlank()
        && before.at("/axes/x/title").equals(after.at("/axes/x/title"));
    if(xChanged&&xTitleUnchanged)return notice();
    boolean axisUnchanged=!before.at("/axes/y/title").asText().isBlank()
        && before.at("/axes/y/title").equals(after.at("/axes/y/title"));
    for(var oldSeries:before.path("series"))for(var newSeries:after.path("series")){
      if(!oldSeries.path("id").isTextual()||!oldSeries.path("id").equals(newSeries.path("id")))continue;
      if(oldSeries.path("y").equals(newSeries.path("y")))continue;
      boolean nameUnchanged=!oldSeries.path("name").asText().isBlank()&&oldSeries.path("name").equals(newSeries.path("name"));
      if(axisUnchanged||nameUnchanged)return notice();
    }
    return "";
  }
  private static String notice(){return "请核对：数据指标映射已变更，原有坐标轴标题或图例名称可能需要调整。如需修改，请明确说明；确认前请检查当前标签。";}
}
