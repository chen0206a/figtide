package dev.labflow.eval;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.*;
final class TeamBootstrap {
  private TeamBootstrap(){}
  static ObjectNode interval(ObjectMapper json,double[] samples,long seed){
    var out=json.createObjectNode().put("n",samples.length).put("resamples",1000).put("seed",seed);
    if(samples.length==0)return out.putNull("mean").putNull("lower_95").putNull("upper_95");
    double sum=0;for(double sample:samples){if(!Double.isFinite(sample))throw new IllegalArgumentException("Nonfinite bootstrap sample");sum+=sample;}
    Random random=new Random(seed);double[] means=new double[1000];
    for(int b=0;b<means.length;b++){double value=0;for(int i=0;i<samples.length;i++)value+=samples[random.nextInt(samples.length)];means[b]=value/samples.length;}
    Arrays.sort(means);return out.put("mean",sum/samples.length).put("lower_95",means[24]).put("upper_95",means[974]);
  }
}
