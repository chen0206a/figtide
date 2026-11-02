package dev.labflow.diagram;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class SvgSanitizerTest {
  String wrap(String contents){return "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"60\" viewBox=\"0 0 100 60\">"+contents+"</svg>";}
  @Test void rejectsDoctypeEntitiesOversizeDepthAndElementBombs(){
    assertThrows(RuntimeException.class,()->SvgSanitizer.sanitize("<!DOCTYPE svg [<!ENTITY x SYSTEM 'file:///C:/Windows/win.ini'>]>"+wrap("<text>&x;</text>")));
    assertThrows(RuntimeException.class,()->SvgSanitizer.sanitize("<!DOCTYPE svg [<!ENTITY a '123'><!ENTITY b '&a;&a;&a;'>]>"+wrap("<text>&b;</text>")));
    assertThrows(RuntimeException.class,()->SvgSanitizer.sanitize(wrap(" ".repeat(SvgSanitizer.MAX_BYTES))));
    assertThrows(RuntimeException.class,()->SvgSanitizer.sanitize(wrap("<g>".repeat(64)+"</g>".repeat(64))));
    assertThrows(RuntimeException.class,()->SvgSanitizer.sanitize(wrap("<rect/>".repeat(20000))));
  }
  @Test void stripsActiveElementsBitmapsExternalReferencesAndEventAttributes(){
    String clean=SvgSanitizer.sanitize(wrap("""
      <script>alert(1)</script><foreignObject><iframe src="http://evil.invalid"/></foreignObject>
      <image href="data:image/png;base64,AA=="/><image href="https://evil.invalid/x.png"/>
      <rect width="30" height="20" onload="alert(2)" style="fill:url(https://evil.invalid/x);stroke:red;filter:url(#x)"/>
      <use href="javascript:alert(3)"/><use href="https://evil.invalid/a.svg#id"/>
      """));
    assertFalse(clean.contains("script"));assertFalse(clean.contains("foreignObject"));assertFalse(clean.contains("iframe"));assertFalse(clean.contains("image"));assertFalse(clean.contains("onload"));assertFalse(clean.contains("evil.invalid"));assertFalse(clean.contains("data:"));assertTrue(clean.contains("stroke:red"));
  }
  @Test void flattensAllowlistedCssAndKeepsLocalGradientsClipsAndUses(){
    String clean=SvgSanitizer.sanitize(wrap("""
      <style>@import url(https://evil.invalid/a.css); .shape{fill:url(#paint);stroke:#123456}.toolbar{position:fixed;background:url(https://evil.invalid/x)}</style>
      <defs><linearGradient id="paint"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#0072B2"/></linearGradient><clipPath id="clip"><circle cx="50" cy="30" r="28"/></clipPath><path id="curve" d="M10 30 Q50 5 90 30"/></defs>
      <g clip-path="url(#clip)"><rect class="shape" x="0" y="0" width="100" height="60"/><use href="#curve" fill="none" stroke="#009E73"/></g><text x="12" y="50">Safe &amp; editable</text>
      """));
    assertFalse(clean.contains("<style"));assertFalse(clean.contains("class="));assertFalse(clean.contains("position"));assertFalse(clean.contains("evil.invalid"));assertTrue(clean.contains("url(#paint)"));assertTrue(clean.contains("href=\"#curve\""));assertTrue(clean.contains("Safe &amp; editable"));assertEquals(clean,SvgSanitizer.sanitize(clean));
  }
  @Test void forbidsRecursiveUsesAndDropsMissingIds(){
    assertThrows(RuntimeException.class,()->SvgSanitizer.sanitize(wrap("<g id='loop'><use href='#loop'/></g>")));
    assertThrows(RuntimeException.class,()->SvgSanitizer.sanitize(wrap("<defs><g id='a'><use href='#b'/></g><g id='b'><use href='#a'/></g></defs><use href='#a'/>")));
    assertFalse(SvgSanitizer.sanitize(wrap("<use href='#missing'/>" )).contains("href"));
    assertThrows(RuntimeException.class,()->SvgSanitizer.sanitize(wrap("<g id='duplicate'/><g id='duplicate'/>")));
  }
  @Test void canonicalSvgBytesUseLfOnEveryPlatform(){
    String input=wrap("\r\n<g>\r\n<text x='1' y='2'>Original words</text>\r\n</g>\r\n");String clean=SvgSanitizer.sanitize(input);assertFalse(clean.contains("\r"));assertEquals(clean,SvgSanitizer.sanitize(input.replace("\r\n","\n")));assertEquals(clean,SvgSanitizer.sanitize(clean));
  }

}
