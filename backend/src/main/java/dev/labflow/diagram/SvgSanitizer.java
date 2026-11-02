package dev.labflow.diagram;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.*;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.*;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import org.w3c.dom.*;
import org.xml.sax.*;
import org.xml.sax.helpers.DefaultHandler;
import static dev.labflow.diagram.DiagramValidator.require;

/** One allowlisted SVG boundary for shipped icons, imported artwork and restored documents. */
public final class SvgSanitizer {
  public static final int MAX_BYTES=2*1024*1024,MAX_ELEMENTS=20000,MAX_DEPTH=64;
  private static final String SVG="http://www.w3.org/2000/svg";
  private static final Set<String> ELEMENTS=Set.of("svg","g","defs","path","rect","circle","ellipse","line","polyline","polygon","text","tspan","textPath","linearGradient","radialGradient","stop","clipPath","use","title","desc");
  private static final Set<String> ATTRS=Set.of("id","x","y","x1","y1","x2","y2","cx","cy","r","rx","ry","width","height","viewBox","preserveAspectRatio","d","points","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-dasharray","stroke-dashoffset","fill-rule","clip-rule","fill-opacity","stroke-opacity","opacity","transform","font-family","font-size","font-weight","font-style","text-anchor","dominant-baseline","letter-spacing","word-spacing","textLength","lengthAdjust","dx","dy","rotate","offset","stop-color","stop-opacity","gradientUnits","gradientTransform","spreadMethod","fx","fy","fr","clipPathUnits","clip-path","href");
  private static final Set<String> PRESENTATION=Set.of("fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-dasharray","stroke-dashoffset","fill-rule","clip-rule","fill-opacity","stroke-opacity","opacity","font-family","font-size","font-weight","font-style","text-anchor","dominant-baseline","letter-spacing","word-spacing","stop-color","stop-opacity","clip-path");
  private static final Pattern LOCAL_URL=Pattern.compile("url\\(\\s*['\"]?#([A-Za-z_][A-Za-z0-9_.:-]{0,127})['\"]?\\s*\\)",Pattern.CASE_INSENSITIVE);
  private static final Pattern CSS_RULE=Pattern.compile("([^{}]+)\\{([^{}]*)}");
  private record Rule(String selector,Map<String,String> values,int priority,int order){}
  private SvgSanitizer(){}
  private static String local(Node n){return n.getLocalName()==null?n.getNodeName():n.getLocalName();}
  private static String safeValue(String name,String value){
    String v=value.strip();if(v.length()>300000||v.indexOf('\\')>=0||v.codePoints().anyMatch(c->c<32&&!Character.isWhitespace(c)))return null;
    String lower=v.toLowerCase(Locale.ROOT);if(lower.contains("javascript:")||lower.contains("data:")||lower.contains("@import")||lower.contains("expression(")||lower.contains("var("))return null;
    if(name.equals("href"))return v.matches("#[A-Za-z_][A-Za-z0-9_.:-]{0,127}")?v:null;
    if(name.equals("id"))return v.matches("[A-Za-z_][A-Za-z0-9_.:-]{0,127}")?v:null;
    if(lower.contains("url(")){var m=LOCAL_URL.matcher(v);return m.matches()?"url(#"+m.group(1)+")":null;}
    if(lower.contains("://")||lower.contains("//")||lower.contains("@"))return null;
    if(name.equals("d"))return v.matches("[MmZzLlHhVvCcSsQqTtAa0-9eE+.,\\s-]*")?v:null;
    if(Set.of("transform","gradientTransform").contains(name))return v.matches("(?:(?:matrix|translate|scale|rotate|skewX|skewY)\\s*\\([0-9eE+.,\\s-]+\\)\\s*)+")?v:null;
    if(name.equals("font-family"))return v.length()<=200&&v.matches("[\\p{L}\\p{N} ,'\"_-]+")?v:null;
    if(Set.of("fill","stroke","stop-color").contains(name))return v.matches("#[0-9a-fA-F]{3,8}|[A-Za-z]+|rgba?\\([0-9.%+,\\s-]+\\)|hsla?\\([0-9.%+,\\s-]+\\)")?v:null;
    return v.matches("[A-Za-z0-9_+.,%\\s-]*")?v:null;
  }
  private static Map<String,String> declarations(String text){
    var values=new LinkedHashMap<String,String>();if(text.length()>300000)return values;
    String clean=text.replaceAll("(?s)/\\*.*?\\*/","");for(String part:clean.split(";")){int colon=part.indexOf(':');if(colon<1)continue;String key=part.substring(0,colon).strip().toLowerCase(Locale.ROOT);if(!PRESENTATION.contains(key))continue;String value=safeValue(key,part.substring(colon+1));if(value!=null)values.put(key,value);}
    return values;
  }
  private static Map<String,List<Rule>> rules(Document input){
    Map<String,List<Rule>> rules=new HashMap<>();var styles=input.getElementsByTagNameNS("*","style");int order=0;
    for(int i=0;i<styles.getLength();i++){
      String css=styles.item(i).getTextContent().replaceAll("(?s)/\\*.*?\\*/","").replaceAll("(?i)@import[^;]*;","");require(css.length()<=300000,"SVG样式过大");var matcher=CSS_RULE.matcher(css);
      while(matcher.find()){require(order++<512,"SVG样式规则过多");var values=declarations(matcher.group(2));if(values.isEmpty())continue;
        for(String raw:matcher.group(1).split(",")){String selector=raw.strip();if(!selector.matches("[.#]?[A-Za-z_][A-Za-z0-9_-]{0,127}"))continue;int priority=selector.startsWith("#")?2:selector.startsWith(".")?1:0;rules.computeIfAbsent(selector,k->new ArrayList<>()).add(new Rule(selector,values,priority,order));}
      }
    }return rules;
  }
  private static Element copy(Element source,Document output,int depth,Map<String,List<Rule>> css){
    require(depth<=MAX_DEPTH,"SVG嵌套超过64层");String name=local(source);String namespace=source.getNamespaceURI();if(!ELEMENTS.contains(name)||namespace!=null&&!namespace.isEmpty()&&!namespace.equals(SVG))return null;
    var target=output.createElementNS(SVG,name);var attributes=source.getAttributes();
    for(int i=0;i<attributes.getLength();i++){var a=attributes.item(i);String key=local(a);if(!ATTRS.contains(key)||key.toLowerCase(Locale.ROOT).startsWith("on"))continue;String uri=a.getNamespaceURI();if(uri!=null&&!uri.isEmpty()&&!uri.equals("http://www.w3.org/1999/xlink"))continue;String safe=safeValue(key,a.getNodeValue());if(safe!=null)target.setAttribute(key,safe);}
    if(source.hasAttributeNS(XMLConstants.XML_NS_URI,"space")){String space=source.getAttributeNS(XMLConstants.XML_NS_URI,"space");if(Set.of("preserve","default").contains(space))target.setAttributeNS(XMLConstants.XML_NS_URI,"xml:space",space);}
    // Flatten a small safe CSS subset. Never let imported selectors style the surrounding app.
    var matched=new ArrayList<Rule>();matched.addAll(css.getOrDefault(name,List.of()));matched.addAll(css.getOrDefault("#"+source.getAttribute("id"),List.of()));String[] classes=source.getAttribute("class").split("\\s+");require(classes.length<=64,"SVG类名过多");for(String cls:classes)matched.addAll(css.getOrDefault("."+cls,List.of()));matched.sort(Comparator.comparingInt(Rule::priority).thenComparingInt(Rule::order));
    var values=new LinkedHashMap<String,String>();for(var rule:matched)values.putAll(rule.values());values.putAll(declarations(source.getAttribute("style")));if(!values.isEmpty()){var style=new StringJoiner(";");values.forEach((k,v)->style.add(k+":"+v));target.setAttribute("style",style.toString());}
    for(Node child=source.getFirstChild();child!=null;child=child.getNextSibling())if(child instanceof Element e){var allowed=copy(e,output,depth+1,css);if(allowed!=null)target.appendChild(allowed);}else if(child.getNodeType()==Node.TEXT_NODE||child.getNodeType()==Node.CDATA_SECTION_NODE)target.appendChild(output.createTextNode(child.getNodeValue()));
    return target;
  }
  private static void references(Element root){
    var ids=new HashMap<String,Element>();var all=root.getElementsByTagName("*");var elements=new ArrayList<Element>();elements.add(root);for(int i=0;i<all.getLength();i++)elements.add((Element)all.item(i));
    for(var element:elements)if(element.hasAttribute("id"))require(ids.put(element.getAttribute("id"),element)==null,"SVG存在重复ID");
    Map<String,Set<String>> graph=new HashMap<>();
    for(var element:elements){var refs=new HashSet<String>();var attrs=element.getAttributes();for(int i=attrs.getLength()-1;i>=0;i--){var a=attrs.item(i);String value=a.getNodeValue();var m=LOCAL_URL.matcher(value);String ref=a.getNodeName().equals("href")?value.substring(1):m.find()?m.group(1):null;if(ref==null)continue;if(!ids.containsKey(ref)){element.removeAttribute(a.getNodeName());continue;}refs.add(ref);}
      if(refs.isEmpty())continue;for(Node current=element;current instanceof Element parent;current=current.getParentNode())if(parent.hasAttribute("id"))graph.computeIfAbsent(parent.getAttribute("id"),k->new HashSet<>()).addAll(refs);
    }
    var done=new HashSet<String>();for(String id:graph.keySet())visit(id,graph,new HashSet<>(),done,0);
  }
  private static void visit(String id,Map<String,Set<String>> graph,Set<String> active,Set<String> done,int depth){
    require(depth<=MAX_DEPTH,"SVG引用链过深");if(done.contains(id))return;require(active.add(id),"SVG存在递归引用");for(String next:graph.getOrDefault(id,Set.of()))visit(next,graph,active,done,depth+1);active.remove(id);done.add(id);
  }
  public static String sanitize(String svg){
    require(svg!=null&&svg.getBytes(StandardCharsets.UTF_8).length<=MAX_BYTES,"SVG超过2MB");
    try{
      var factory=DocumentBuilderFactory.newInstance();factory.setNamespaceAware(true);factory.setXIncludeAware(false);factory.setExpandEntityReferences(false);factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING,true);factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);factory.setFeature("http://xml.org/sax/features/external-general-entities",false);factory.setFeature("http://xml.org/sax/features/external-parameter-entities",false);factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD,"");factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA,"");factory.setAttribute("http://www.oracle.com/xml/jaxp/properties/maxElementDepth",MAX_DEPTH);
      var parser=factory.newDocumentBuilder();parser.setErrorHandler(new DefaultHandler(){@Override public void error(SAXParseException e)throws SAXException{throw e;}@Override public void fatalError(SAXParseException e)throws SAXException{throw e;}});parser.setEntityResolver((publicId,systemId)->{throw new SAXException("external entity forbidden");});
      var input=parser.parse(new InputSource(new StringReader(svg)));require(input.getElementsByTagName("*").getLength()<=MAX_ELEMENTS,"SVG元素超过20000个");require(local(input.getDocumentElement()).equals("svg"),"根元素必须为SVG");var output=parser.newDocument();var root=copy(input.getDocumentElement(),output,1,rules(input));require(root!=null,"SVG命名空间无效");root.setAttribute("xmlns",SVG);output.appendChild(root);
      if(!root.hasAttribute("viewBox")){String w=root.getAttribute("width").replaceFirst("(px|pt|mm|cm|in)$",""),h=root.getAttribute("height").replaceFirst("(px|pt|mm|cm|in)$","");if(w.matches("[0-9.]+")&&h.matches("[0-9.]+"))root.setAttribute("viewBox","0 0 "+w+" "+h);}
      references(root);var transformers=TransformerFactory.newInstance();transformers.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING,true);transformers.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD,"");transformers.setAttribute(XMLConstants.ACCESS_EXTERNAL_STYLESHEET,"");var transformer=transformers.newTransformer();transformer.setOutputProperty(OutputKeys.OMIT_XML_DECLARATION,"yes");var writer=new StringWriter();transformer.transform(new DOMSource(output),new StreamResult(writer));String result=writer.toString().replace("\r\n","\n");require(result.getBytes(StandardCharsets.UTF_8).length<=MAX_BYTES,"净化后的SVG超过2MB");return result;
    }catch(dev.labflow.api.ApiException e){throw e;}catch(Exception e){throw dev.labflow.api.ApiException.bad("SVG格式无效或包含被禁止的XML结构");}
  }
}
