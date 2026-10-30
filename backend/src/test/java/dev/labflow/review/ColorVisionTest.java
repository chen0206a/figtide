package dev.labflow.review;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
class ColorVisionTest {
  @Test void machadoSeverityOnePublishedPrimaryComponents(){
    assertArrayEquals(new double[]{.152286,.114503,0},ColorVision.simulateLinear(new double[]{1,0,0},0),1e-6);
    assertArrayEquals(new double[]{.860646,.672501,.042940},ColorVision.simulateLinear(new double[]{0,1,0},1),1e-6);
    assertArrayEquals(new double[]{0,.147602,.303900},ColorVision.simulateLinear(new double[]{0,0,1},2),1e-6);
  }
  @Test void sharmaPublishedCiede2000ReferencePairs(){
    assertEquals(2.0425,ColorVision.deltaE(new double[]{50,2.6772,-79.7751},new double[]{50,0,-82.7485}),.0001);
    assertEquals(2.8615,ColorVision.deltaE(new double[]{50,3.1571,-77.2803},new double[]{50,0,-82.7485}),.0001);
    assertEquals(7.2195,ColorVision.deltaE(new double[]{50,2.49,-.001},new double[]{50,-2.49,.0011}),.0001);
    assertEquals(0,ColorVision.minimum("#0072B2","#0072B2"),1e-9);
    assertTrue(ColorVision.minimum("#000000","#FFFFFF")>90);
  }
}
