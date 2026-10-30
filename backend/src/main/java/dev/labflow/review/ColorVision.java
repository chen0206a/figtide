package dev.labflow.review;

/** Machado et al. 2009, severity 1.0 on linear sRGB. CIELAB D65 and CIEDE2000 (k=1). */
public final class ColorVision {
  public static final double MIN_DELTA_E = 20;
  public static final String[] OKABE_ITO = {"#0072B2", "#E69F00", "#009E73", "#D55E00", "#CC79A7", "#56B4E9", "#F0E442", "#000000"};
  private static final double[][][] MATRICES = {
      {{.152286,1.052583,-.204868},{.114503,.786281,.099216},{-.003882,-.048116,1.051998}},
      {{.367322,.860646,-.227968},{.280085,.672501,.047413},{-.011820,.042940,.968881}},
      {{1.255528,-.076749,-.178779},{-.078411,.930809,.147602},{.004733,.691367,.303900}}
  };
  private ColorVision() {}
  public static double[] simulateLinear(double[] rgb, int deficiency) {
    double[] out = new double[3];
    for (int i=0;i<3;i++) for (int j=0;j<3;j++) out[i] += MATRICES[deficiency][i][j]*rgb[j];
    for (int i=0;i<3;i++) out[i] = Math.clamp(out[i], 0, 1);
    return out;
  }
  private static double linear(double v) { return v <= .04045 ? v/12.92 : Math.pow((v+.055)/1.055,2.4); }
  public static double[] lab(String hex, int deficiency) {
    int rgb = Integer.parseInt(hex.substring(1),16);
    double[] c = {linear(((rgb>>16)&255)/255d),linear(((rgb>>8)&255)/255d),linear((rgb&255)/255d)};
    if (deficiency >= 0) c=simulateLinear(c,deficiency);
    double x=f((.4124564*c[0]+.3575761*c[1]+.1804375*c[2])/.95047);
    double y=f(.2126729*c[0]+.7151522*c[1]+.0721750*c[2]);
    double z=f((.0193339*c[0]+.1191920*c[1]+.9503041*c[2])/1.08883);
    return new double[]{116*y-16,500*(x-y),200*(y-z)};
  }
  private static double f(double v) { return v>216d/24389 ? Math.cbrt(v) : (24389d/27*v+16)/116; }
  private static double cos(double d) { return Math.cos(Math.toRadians(d)); }
  private static double sin(double d) { return Math.sin(Math.toRadians(d)); }
  private static double hue(double a,double b) { double h=Math.toDegrees(Math.atan2(b,a)); return h<0?h+360:h; }
  public static double deltaE(double[] a,double[] b) {
    double c1=Math.hypot(a[1],a[2]),c2=Math.hypot(b[1],b[2]),bar=(c1+c2)/2;
    double g=.5*(1-Math.sqrt(Math.pow(bar,7)/(Math.pow(bar,7)+Math.pow(25,7))));
    double ap1=(1+g)*a[1],ap2=(1+g)*b[1];
    double cp1=Math.hypot(ap1,a[2]),cp2=Math.hypot(ap2,b[2]);
    double h1=hue(ap1,a[2]),h2=hue(ap2,b[2]);
    double dl=b[0]-a[0],dc=cp2-cp1,dh=h2-h1;
    if(cp1*cp2==0)dh=0; else if(dh>180)dh-=360;else if(dh< -180)dh+=360;
    double dH=2*Math.sqrt(cp1*cp2)*sin(dh/2),l=(a[0]+b[0])/2,c=(cp1+cp2)/2,h;
    if(cp1*cp2==0)h=h1+h2;else if(Math.abs(h1-h2)<=180)h=(h1+h2)/2;else h=(h1+h2+(h1+h2<360?360:-360))/2;
    double t=1-.17*cos(h-30)+.24*cos(2*h)+.32*cos(3*h+6)-.20*cos(4*h-63);
    double sl=1+.015*(l-50)*(l-50)/Math.sqrt(20+(l-50)*(l-50)),sc=1+.045*c,sh=1+.015*c*t;
    double rt=-2*Math.sqrt(Math.pow(c,7)/(Math.pow(c,7)+Math.pow(25,7)))*sin(60*Math.exp(-Math.pow((h-275)/25,2)));
    return Math.sqrt(Math.pow(dl/sl,2)+Math.pow(dc/sc,2)+Math.pow(dH/sh,2)+rt*(dc/sc)*(dH/sh));
  }
  public static double minimum(String a,String b) {
    double min=Double.POSITIVE_INFINITY;
    for(int deficiency=0;deficiency<3;deficiency++) min=Math.min(min,deltaE(lab(a,deficiency),lab(b,deficiency)));
    return min;
  }
}
