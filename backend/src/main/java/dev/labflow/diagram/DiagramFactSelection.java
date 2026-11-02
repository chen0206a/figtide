package dev.labflow.diagram;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import java.util.*;
import java.util.regex.Pattern;
import static dev.labflow.diagram.DiagramValidator.*;

/** Server-owned provenance and reversible exclusion. Never trusts client-supplied documents. */
public final class DiagramFactSelection {
  private static final ObjectMapper JSON=new ObjectMapper();
  public static final List<String> FIELDS=List.of("zones","nodes","edges","annotations");
  private DiagramFactSelection(){}
  public static SortedSet<Integer> indices(JsonNode input,int count,boolean allowEmpty){
    var result=new TreeSet<Integer>();
    if(input==null||input.isMissingNode()){for(int i=0;i<count;i++)result.add(i);return result;}
    require(input.isArray()&&input.size()<=40,"事实选择格式无效");
    for(var value:input)require(value.isIntegralNumber()&&value.canConvertToInt()&&value.asInt()>=0&&value.asInt()<count&&result.add(value.asInt()),"事实索引重复或无效");
    require(allowEmpty||!result.isEmpty(),"请至少选择一条有出处的事实");return result;
  }
  private static boolean mentions(JsonNode fact,String label){
    if(label.isBlank())return false;
    String source=fact.path("text").asText()+"\n"+fact.path("quote").asText();
    String boundary="(?<![\\p{L}\\p{N}_])"+Pattern.quote(label)+"(?![\\p{L}\\p{N}_])";
    return label.codePoints().anyMatch(c->c>255)?source.toLowerCase(Locale.ROOT).contains(label.toLowerCase(Locale.ROOT)):Pattern.compile(boundary,Pattern.CASE_INSENSITIVE|Pattern.UNICODE_CASE).matcher(source).find();
  }
  private static Set<Integer> matching(JsonNode facts,String label){var out=new TreeSet<Integer>();for(int i=0;i<facts.size();i++)if(mentions(facts.get(i),label))out.add(i);return out;}
  private static JsonNode item(JsonNode doc,String field,String id){for(var n:doc.path(field))if(n.path("id").asText().equals(id))return n;return NullNode.instance;}
  public static ArrayNode bindings(JsonNode before,JsonNode after,JsonNode semantic,JsonNode facts){
    var explicit=new HashMap<String,Set<Integer>>();
    for(var op:semantic){String id=op.at("/arguments/id").asText();if(op.path("arguments").has("fact_indices"))explicit.put(id,indices(op.at("/arguments/fact_indices"),facts.size(),false));}
    var inferred=new HashMap<String,Set<Integer>>();for(var n:after.path("nodes"))inferred.put(n.path("id").asText(),matching(facts,n.path("label").asText()));for(var n:before.path("nodes"))inferred.putIfAbsent(n.path("id").asText(),matching(facts,n.path("label").asText()));
    var out=JSON.createArrayNode();
    for(String field:FIELDS){var ids=new LinkedHashSet<String>();for(var n:before.path(field))ids.add(n.path("id").asText());for(var n:after.path(field))ids.add(n.path("id").asText());
      for(String id:ids){var old=item(before,field,id);var next=item(after,field,id);if(old.equals(next))continue;var value=next.isNull()?old:next;Set<Integer> matches;
        if(field.equals("nodes"))matches=inferred.getOrDefault(id,Set.of());
        else if(field.equals("edges")){matches=new TreeSet<>(inferred.getOrDefault(value.path("from").asText(),Set.of()));matches.retainAll(inferred.getOrDefault(value.path("to").asText(),Set.of()));}
        else matches=matching(facts,value.path("label").asText(value.path("text").asText()));
        var assigned=explicit.get(id);if(assigned!=null){if(!matches.isEmpty()){var common=new TreeSet<>(assigned);common.retainAll(matches);if(!common.isEmpty())matches=common;}else matches=assigned;}
        if(matches.isEmpty()){matches=new TreeSet<>();for(int i=0;i<facts.size();i++)matches.add(i);}
        var row=out.addObject().put("field",field).put("id",id);row.set("facts",JSON.valueToTree(matches));row.set("before",old.deepCopy());int index=0;for(var n:before.path(field)){if(n.path("id").asText().equals(id))break;index++;}row.put("index",index);
      }
    }return out;
  }
  public static ObjectNode select(JsonNode proposal,JsonNode requested){
    var doc=(ObjectNode)proposal.path("config").deepCopy();
    if(!proposal.has("facts")){require(requested==null||requested.isMissingNode(),"旧提案不支持事实筛选，请重新生成");return doc;}
    var chosen=indices(requested,proposal.path("facts").size(),true);var bindings=proposal.path("fact_bindings");
    for(String field:FIELDS){var dropped=new HashMap<String,JsonNode>();for(var b:bindings)if(b.path("field").asText().equals(field)&&!b.path("facts").isEmpty()){boolean keep=false;for(var i:b.path("facts"))keep|=chosen.contains(i.asInt());if(!keep)dropped.put(b.path("id").asText(),b);}
      var array=(ArrayNode)doc.path(field);for(int i=array.size()-1;i>=0;i--){var binding=dropped.get(array.get(i).path("id").asText());if(binding!=null){if(binding.path("before").isNull())array.remove(i);else array.set(i,binding.path("before").deepCopy());}}
      var restore=new ArrayList<JsonNode>();for(var b:dropped.values())if(!b.path("before").isNull()&&item(doc,field,b.path("id").asText()).isNull())restore.add(b);restore.sort(Comparator.comparingInt(b->b.path("index").asInt()));for(var b:restore)array.insert(Math.min(array.size(),b.path("index").asInt()),b.path("before").deepCopy());
    }
    var nodes=new HashSet<String>();var zones=new HashSet<String>();for(var n:doc.path("nodes"))nodes.add(n.path("id").asText());for(var z:doc.path("zones"))zones.add(z.path("id").asText());
    for(var n:doc.path("nodes"))if(n.path("zone").isTextual()&&!zones.contains(n.path("zone").asText()))((ObjectNode)n).putNull("zone");for(var z:doc.path("zones"))if(z.path("zoom_of").isTextual()&&!zones.contains(z.path("zoom_of").asText())&&!nodes.contains(z.path("zoom_of").asText()))((ObjectNode)z).putNull("zoom_of");
    var edges=(ArrayNode)doc.path("edges");for(int i=edges.size()-1;i>=0;i--)if(!nodes.contains(edges.get(i).path("from").asText())||!nodes.contains(edges.get(i).path("to").asText()))edges.remove(i);
    var annotations=(ArrayNode)doc.path("annotations");for(int i=annotations.size()-1;i>=0;i--)if(!nodes.contains(annotations.get(i).path("target").asText())&&!zones.contains(annotations.get(i).path("target").asText()))annotations.remove(i);
    var meta=(ObjectNode)doc.path("meta");var facts=meta.putArray("facts");var sources=meta.putArray("fact_sources");for(int i:chosen){var fact=proposal.path("facts").get(i);facts.add(fact.path("text").asText());sources.add(fact.deepCopy());}
    if(meta.path("ai_labels").isArray()){var labels=(ArrayNode)meta.path("ai_labels");for(int i=labels.size()-1;i>=0;i--)if(!nodes.contains(labels.get(i).path("id").asText()))labels.remove(i);}
    validate(doc);return doc;
  }
  public static boolean applicable(JsonNode doc,JsonNode operation){String tool=operation.path("tool").asText();String field=tool.endsWith("node")?"nodes":tool.endsWith("edge")?"edges":tool.endsWith("zone")?"zones":null;return field==null||tool.startsWith("add_")||!item(doc,field,operation.at("/arguments/id").asText()).isNull();}
}
