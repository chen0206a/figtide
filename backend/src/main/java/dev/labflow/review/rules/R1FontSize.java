package dev.labflow.review.rules;
import dev.labflow.review.*;
import java.util.*;
import static dev.labflow.review.ReviewIssue.*;

public class R1FontSize implements ReviewRule {
  public String id(){return "R1";}
  public List<ReviewIssue> check(ReviewContext c){
    double px=c.baseFontPx()-(c.config().path("legend").path("show").asBoolean()?1:0);
    if(c.facts()!=null && !c.facts().path("texts").isEmpty())
      for(var text:c.facts().path("texts")) px=Math.min(px,text.path("fontPx").asDouble());
    double pt=c.points(px); if(pt+1e-6>=c.minFont())return List.of();
    double target=c.minFont()+.5;
    var fix=List.of(operation("set_style",c.physical()?"fontPt":"fontSize",c.physical()?target:Math.ceil(c.pixels(target)+1)));
    return List.of(issue(id(),"font","成品文字字号太小",String.format(Locale.ROOT,"按 %.1f mm 成品换算，最小文字约 %.2f pt，低于 %.1f pt。",c.widthMm(),pt,c.minFont()),fix,"axis","y"));
  }
}
