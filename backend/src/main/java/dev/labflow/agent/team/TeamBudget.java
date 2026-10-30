package dev.labflow.agent.team;

/** Cumulative ceilings carry unused allowance forward; there is still one run reservation. */
public final class TeamBudget {
  private TeamBudget() {}
  public static final class Limit extends RuntimeException {
    public Limit(String message){super(message);}
  }
  public static long ceiling(String role,int reservation,boolean reviewOnly){
    int share=reviewOnly?100:switch(role){case "coordinator"->15;case "data"->45;case "plotter"->85;case "reviewer"->100;default->throw new IllegalArgumentException(role);};
    return (long)reservation*share/100;
  }
  public static int[] percentages(com.fasterxml.jackson.databind.JsonNode value){
    if(value.isMissingNode()||value.isNull())return null;
    var names=java.util.List.of("coordinator","data","plotter","reviewer");
    if(!value.isObject()||value.size()!=4)throw dev.labflow.api.ApiException.bad("角色配额需要四个角色的整数百分比，总和为100");
    int sum=0;int[] cumulative=new int[4];
    for(int i=0;i<names.size();i++){var part=value.path(names.get(i));if(!part.isIntegralNumber()||!part.canConvertToInt()||part.asInt()<1||part.asInt()>100)throw dev.labflow.api.ApiException.bad("角色配额每项须为1–100的整数，总和为100");sum+=part.asInt();cumulative[i]=sum;}
    if(sum!=100)throw dev.labflow.api.ApiException.bad("角色配额百分比总和须为100");return cumulative;
  }
  public static long ceiling(String role,int reservation,boolean reviewOnly,int[] cumulative){
    int index=java.util.List.of("coordinator","data","plotter","reviewer").indexOf(role);
    if(index<0)throw new IllegalArgumentException(role);
    return reviewOnly||cumulative==null?reservation:(long)reservation*cumulative[index]/100;
  }
}
