package dev.labflow.agent.team;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.util.*;

public final class TeamRoles {
  private TeamRoles(){}
  public static ArrayNode summarize(JsonNode trace,ObjectMapper json){
    Map<String,ObjectNode> roles=new LinkedHashMap<>();
    for(var event:trace){String role=event.path("role").asText();if(role.isBlank())continue;
      var item=roles.computeIfAbsent(role,key->json.createObjectNode().put("role",key).put("steps",0).put("tokens",0).put("status","running").put("summary","处理中").put("prompt_version",TeamPrompts.version(key)));
      if(event.path("event").asText().equals("model_request"))item.put("steps",item.path("steps").asInt()+1);
      if(event.path("event").asText().equals("model_response"))item.put("tokens",item.path("tokens").asLong()+event.path("tokens").asLong());
      if(event.path("event").asText().equals("role_end")){item.put("status",event.path("status").asText("complete"));item.put("summary",event.path("summary").asText("已完成"));}
    }
    var out=json.createArrayNode();roles.values().forEach(out::add);return out;
  }
}
