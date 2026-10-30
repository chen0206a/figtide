package dev.labflow.agent.team;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import dev.labflow.agent.AuditSanitizer;
import dev.labflow.review.ProposalReviewService;
import org.springframework.stereotype.Service;

@Service
public class TeamDecisionService {
  private final TeamProcessingCommitter committer;private final ProposalReviewService reviews;private final ObjectMapper json;
  public TeamDecisionService(TeamProcessingCommitter committer,ProposalReviewService reviews,ObjectMapper json){this.committer=committer;this.reviews=reviews;this.json=json;}
  public ObjectNode decide(long project,String id,ObjectNode proposal,JsonNode request){
    var body=(ObjectNode)request.deepCopy();if(!body.has("accepted_fixes"))body.set("accepted_fixes",json.createArrayNode());
    long dataset=committer.create(project,id,proposal,body);var materialized=proposal.deepCopy();((ObjectNode)materialized.path("config")).put("datasetVersionId",dataset);
    try{
      var response=reviews.decide(project,id,body,true,AuditSanitizer.hash(proposal.path("config")),materialized);
      response.set("processing_commit",committer.mark(project,id,"passed"));return response;
    }catch(RuntimeException error){committer.mark(project,id,"failed");throw error;}
  }
}
