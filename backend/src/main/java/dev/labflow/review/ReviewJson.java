package dev.labflow.review;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.NullNode;
import java.nio.charset.StandardCharsets;
public final class ReviewJson {
  private ReviewJson(){}
  public static JsonNode read(ObjectMapper json,Object value){
    if(value==null)return NullNode.instance;
    try{
      String text=value instanceof java.sql.Clob c?c.getSubString(1,Math.toIntExact(c.length()))
          :value instanceof byte[] bytes?new String(bytes,StandardCharsets.UTF_8):String.valueOf(value);
      return json.readTree(text);
    }catch(Exception e){throw new IllegalStateException("审稿记录格式无效",e);}
  }
}
