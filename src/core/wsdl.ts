/**
 * F61 — SOAP/WSDL import and SOAP body generation.
 *
 * Pure, host-agnostic module (no `vscode` imports — see GUARDRAILS.md §3) that:
 *   1. Parses a WSDL XML document into a structured `WsdlDocument`.
 *   2. Generates a SOAP request envelope per operation, with sample values
 *      derived from the XSD schemas.
 *   3. Exposes enough metadata for the request UI to render an operation
 *      picker and regenerate envelopes on demand.
 *
 * Supported: WSDL 1.1 (SOAP 1.1 + SOAP 1.2 bindings), document/literal and
 * rpc/literal styles, qualified + unqualified element forms, named and inline
 * complex/simple types (including enumerations and complex-content bases).
 */

export interface WsdlElementRef {
  ns: string;
  local: string;
}

export interface WsdlAttribute {
  name: string;
  typeRef?: WsdlElementRef;
  defaultValue?: string;
}

export interface WsdlElementDef {
  name: string;
  typeRef?: WsdlElementRef;
  defaultValue?: string;
  minOccurs: number;
  maxOccurs: number; // -1 == unbounded
  nillable: boolean;
  baseRef?: WsdlElementRef; // complexContent/simpleContent extension base
  complexChildren: WsdlElementDef[];
  attributes: WsdlAttribute[];
  simpleBase?: WsdlElementRef;
}

export interface WsdlSimpleType {
  name?: string;
  base?: WsdlElementRef;
  enumeration: string[];
}

export interface XsdSchema {
  targetNamespace: string;
  elementFormDefault: "qualified" | "unqualified";
  elements: Map<string, WsdlElementDef>;
  complexTypes: Map<string, WsdlElementDef>;
  simpleTypes: Map<string, WsdlSimpleType>;
}

export interface WsdlMessagePart {
  name: string;
  element?: WsdlElementRef;
  type?: WsdlElementRef;
}

export interface WsdlHeaderPart {
  part: string;
  element?: WsdlElementRef;
  type?: WsdlElementRef;
  use: string;
}

export interface WsdlOperation {
  name: string;
  binding: string;
  soapAction: string;
  style: "document" | "rpc";
  use: "literal" | "encoded";
  bodyNamespace?: string;
  inputMessage?: string;
  inputParts: WsdlMessagePart[];
  inputElement?: WsdlElementRef;
  headerParts: WsdlHeaderPart[];
  isSoap12: boolean;
  location?: string;
}

export interface WsdlPort {
  name: string;
  binding: string;
  location: string;
  isSoap12: boolean;
}

export interface WsdlDocument {
  name: string;
  targetNamespace: string;
  prefixToNs: Map<string, string>;
  schemas: Map<string, XsdSchema>;
  operations: WsdlOperation[];
  ports: WsdlPort[];
  isSoap12: boolean;
}

/** Per-request metadata persisted on imported requests so the webview can
 *  render the operation picker and regenerate envelopes without re-fetching. */
export interface SoapOperationMeta {
  name: string;
  soapAction: string;
  location?: string;
  isSoap12: boolean;
  body: string;
}

export interface SoapRequestMeta {
  wsdl: string;
  operation: string;
  targetNamespace: string;
  isSoap12: boolean;
  operations: SoapOperationMeta[];
}

const XSD_NS = "http://www.w3.org/2001/XMLSchema";
const SOAP11_ENV_NS = "http://schemas.xmlsoap.org/soap/envelope/";
const SOAP12_ENV_NS = "http://www.w3.org/2003/05/soap-envelope";
const SOAP11_ENC_NS = "http://schemas.xmlsoap.org/soap/encoding/";
const SOAP11_BINDING_NS = "http://schemas.xmlsoap.org/wsdl/soap/";
const SOAP12_BINDING_NS = "http://schemas.xmlsoap.org/wsdl/soap12/";
const SOAP11_HTTP_TRANSPORT = "http://schemas.xmlsoap.org/soap/http";
const SOAP12_HTTP_TRANSPORT = "http://www.w3.org/2003/05/soap/bindings/HTTP/";
const WSSE_NS = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
const WSSE_PASSWORD_TEXT_URI = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText";
const XENC_NS = "http://www.w3.org/2001/04/xmlenc#";
const DS_NS = "http://www.w3.org/2000/09/xmldsig#";

/** SOAP Content-Type for a given binding version. */
export function soapContentType(isSoap12: boolean): string {
  return isSoap12 ? "application/soap+xml; charset=utf-8" : "text/xml; charset=utf-8";
}

// ─── Lightweight XML parser (node tree) ──────────────────────────────────────

export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

interface XmlParserState {
  src: string;
  pos: number;
}

function parseXml(xml: string): XmlNode | null {
  const s: XmlParserState = { src: xml, pos: 0 };
  _skipProlog(s);
  if (!s.src.startsWith("<", s.pos)) return null;

  const sentinel: XmlNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [sentinel];

  while (s.pos < s.src.length) {
    const lt = s.src.indexOf("<", s.pos);
    if (lt === -1) break;
    if (lt > s.pos) {
      const text = s.src.slice(s.pos, lt);
      if (stack.length > 0) stack[stack.length - 1].text += text;
      s.pos = lt;
    }
    if (s.src.startsWith("<?", s.pos)) {
      const end = s.src.indexOf("?>", s.pos);
      s.pos = end >= 0 ? end + 2 : s.src.length;
      continue;
    }
    if (s.src.startsWith("<!--", s.pos)) {
      const end = s.src.indexOf("-->", s.pos);
      s.pos = end >= 0 ? end + 3 : s.src.length;
      continue;
    }
    if (s.src.startsWith("<![CDATA[", s.pos)) {
      const end = s.src.indexOf("]]>", s.pos);
      const cdata = end >= 0 ? s.src.slice(s.pos + 9, end) : "";
      if (stack.length > 0) stack[stack.length - 1].text += cdata;
      s.pos = end >= 0 ? end + 3 : s.src.length;
      continue;
    }
    if (s.src.startsWith("</", s.pos)) {
      const end = s.src.indexOf(">", s.pos);
      stack.pop();
      s.pos = end >= 0 ? end + 1 : s.src.length;
      continue;
    }
    const node = _parseStartTag(s);
    if (!node) break;
    if (stack.length > 0) stack[stack.length - 1].children.push(node);
    if (!node.selfClosing) stack.push(node);
  }

  return sentinel.children[0] || null;
}

function _skipProlog(s: XmlParserState): void {
  for (;;) {
    while (s.pos < s.src.length && /\s/.test(s.src[s.pos])) s.pos++;
    if (s.src.startsWith("<?", s.pos)) {
      const end = s.src.indexOf("?>", s.pos);
      s.pos = end >= 0 ? end + 2 : s.src.length;
      continue;
    }
    if (s.src.startsWith("<!--", s.pos)) {
      const end = s.src.indexOf("-->", s.pos);
      s.pos = end >= 0 ? end + 3 : s.src.length;
      continue;
    }
    break;
  }
}

function _parseStartTag(s: XmlParserState): (XmlNode & { selfClosing: boolean }) | null {
  if (s.src[s.pos] !== "<") return null;
  s.pos++; // consume '<'

  let name = "";
  while (s.pos < s.src.length && !/[\s/>]/.test(s.src[s.pos])) {
    name += s.src[s.pos];
    s.pos++;
  }
  const node = {
    name,
    attrs: {} as Record<string, string>,
    children: [] as XmlNode[],
    text: "",
    selfClosing: false,
  };

  for (;;) {
    while (s.pos < s.src.length && /\s/.test(s.src[s.pos])) s.pos++;
    if (s.pos >= s.src.length) break;
    const ch = s.src[s.pos];
    if (ch === ">") {
      s.pos++;
      break;
    }
    if (ch === "/" && s.src[s.pos + 1] === ">") {
      node.selfClosing = true;
      s.pos += 2;
      break;
    }
    let aname = "";
    while (s.pos < s.src.length && !/[\s=/>]/.test(s.src[s.pos])) {
      aname += s.src[s.pos];
      s.pos++;
    }
    while (s.pos < s.src.length && /\s/.test(s.src[s.pos])) s.pos++;
    let avalue = "";
    if (s.src[s.pos] === "=") {
      s.pos++;
      while (s.pos < s.src.length && /\s/.test(s.src[s.pos])) s.pos++;
      const quote = s.src[s.pos];
      if (quote === '"' || quote === "'") {
        s.pos++;
        const end = s.src.indexOf(quote, s.pos);
        avalue = end >= 0 ? s.src.slice(s.pos, end) : s.src.slice(s.pos);
        s.pos = end >= 0 ? end + 1 : s.src.length;
      } else {
        while (s.pos < s.src.length && !/[\s>]/.test(s.src[s.pos])) {
          avalue += s.src[s.pos];
          s.pos++;
        }
      }
    }
    if (aname) node.attrs[aname] = avalue;
  }
  return node;
}

// ─── Small helpers ───────────────────────────────────────────────────────────

function _localName(qname: string): string {
  const idx = qname.indexOf(":");
  return idx >= 0 ? qname.slice(idx + 1) : qname;
}

function _splitQName(qname: string): { prefix: string; local: string } {
  const idx = qname.indexOf(":");
  if (idx < 0) return { prefix: "", local: qname };
  return { prefix: qname.slice(0, idx), local: qname.slice(idx + 1) };
}

function _resolveQName(qname: string | undefined, nsMap: Map<string, string>): WsdlElementRef | null {
  if (!qname) return null;
  const { prefix, local } = _splitQName(qname);
  const ns = nsMap.get(prefix);
  if (ns === undefined) return null;
  return { ns, local };
}

function _isXsdPrimitive(ref: WsdlElementRef): boolean {
  return ref.ns === XSD_NS;
}

function _samplePrimitive(ref: WsdlElementRef): string {
  const t = ref.local.toLowerCase();
  switch (t) {
    case "boolean":
      return "true";
    case "int":
    case "integer":
    case "long":
    case "short":
    case "byte":
    case "nonnegativeinteger":
    case "positiveinteger":
      return "0";
    case "decimal":
    case "double":
    case "float":
      return "0.0";
    case "datetime":
      return "2024-01-01T00:00:00";
    case "date":
      return "2024-01-01";
    case "time":
      return "00:00:00";
    case "anyuri":
      return "http://example.com";
    case "base64binary":
      return "base64";
    default:
      return "string";
  }
}

// ─── Schema extraction ───────────────────────────────────────────────────────

function _numOccurs(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : n;
}

function _parseAttributeDecl(node: XmlNode, nsMap: Map<string, string>): WsdlAttribute | null {
  const name = node.attrs["name"];
  if (!name) return null;
  return {
    name,
    typeRef: _resolveQName(node.attrs["type"], nsMap) ?? undefined,
    defaultValue: node.attrs["default"],
  };
}

function _collectParticleElements(node: XmlNode, out: WsdlElementDef[], nsMap: Map<string, string>): void {
  for (const child of node.children) {
    const local = _localName(child.name);
    if (local === "element") {
      const def = _parseElementDecl(child, nsMap);
      if (def) out.push(def);
    } else if (local === "sequence" || local === "choice" || local === "all" || local === "group") {
      _collectParticleElements(child, out, nsMap);
    }
  }
}

function _parseElementDecl(node: XmlNode, nsMap: Map<string, string>): WsdlElementDef | null {
  const name = node.attrs["name"];
  if (!name) return null;
  const def: WsdlElementDef = {
    name,
    typeRef: _resolveQName(node.attrs["type"], nsMap) ?? undefined,
    defaultValue: node.attrs["default"],
    minOccurs: _numOccurs(node.attrs["minOccurs"], 1),
    maxOccurs: node.attrs["maxOccurs"] === "unbounded" ? -1 : _numOccurs(node.attrs["maxOccurs"], 1),
    nillable: node.attrs["nillable"] === "true",
    complexChildren: [],
    attributes: [],
  };
  for (const child of node.children) {
    const local = _localName(child.name);
    if (local === "complexType") {
      _fillComplexType(def, child, nsMap);
    } else if (local === "simpleType") {
      const st = _parseSimpleType(child, nsMap);
      if (st.base) def.simpleBase = st.base;
    }
  }
  return def;
}

/** Populate a WsdlElementDef from an inline/named complexType node. */
function _fillComplexType(def: WsdlElementDef, node: XmlNode, nsMap: Map<string, string>): void {
  for (const child of node.children) {
    const local = _localName(child.name);
    if (local === "sequence" || local === "choice" || local === "all" || local === "group") {
      _collectParticleElements(child, def.complexChildren, nsMap);
    } else if (local === "attribute") {
      const a = _parseAttributeDecl(child, nsMap);
      if (a) def.attributes.push(a);
    } else if (local === "simpleContent" || local === "complexContent") {
      for (const inner of child.children) {
        const il = _localName(inner.name);
        if (il !== "extension" && il !== "restriction") continue;
        def.baseRef = _resolveQName(inner.attrs["base"], nsMap) ?? undefined;
        for (const c of inner.children) {
          const cl = _localName(c.name);
          if (cl === "sequence" || cl === "choice" || cl === "all") {
            _collectParticleElements(c, def.complexChildren, nsMap);
          } else if (cl === "attribute") {
            const a = _parseAttributeDecl(c, nsMap);
            if (a) def.attributes.push(a);
          }
        }
      }
    }
  }
}

function _parseSimpleType(node: XmlNode, nsMap: Map<string, string>): WsdlSimpleType {
  const st: WsdlSimpleType = { name: node.attrs["name"], enumeration: [] };
  for (const child of node.children) {
    const local = _localName(child.name);
    if (local === "restriction" || local === "list") {
      st.base = _resolveQName(child.attrs["base"], nsMap) ?? undefined;
      for (const c of child.children) {
        if (_localName(c.name) === "enumeration" && c.attrs["value"] !== undefined) {
          st.enumeration.push(c.attrs["value"]);
        }
      }
    }
  }
  return st;
}

// ─── WSDL parsing ────────────────────────────────────────────────────────────

function _walk(node: XmlNode, localName: string, out: XmlNode[]): void {
  for (const child of node.children) {
    if (_localName(child.name) === localName) out.push(child);
    _walk(child, localName, out);
  }
}

/** Derive a readable collection name from a WSDL targetNamespace URL. */
function _friendlyWsdlName(targetNamespace: string): string {
  if (!targetNamespace) return "";
  const raw = targetNamespace.replace(/[?#].*$/, "");
  const segments = raw.split("/").filter(Boolean);
  const last = segments[segments.length - 1] || "";
  if (last && last.endsWith(".wsdl")) return last.slice(0, -5);
  return last;
}

function _soapVersionForPrefix(prefix: string, nsMap: Map<string, string>): 11 | 12 | 0 {
  const uri = nsMap.get(prefix);
  if (uri === SOAP11_BINDING_NS) return 11;
  if (uri === SOAP12_BINDING_NS) return 12;
  return 0;
}

/** Whether a soap:binding transport is HTTP-based (importable) vs JMS/JMX. */
function _isHttpTransport(transport: string | undefined): boolean {
  if (!transport) return true;
  const t = transport.toLowerCase();
  return (
    t === SOAP11_HTTP_TRANSPORT.toLowerCase() ||
    t === SOAP12_HTTP_TRANSPORT.toLowerCase() ||
    t === "http" ||
    t === "https"
  );
}

function _indexSchema(schemaNode: XmlNode, nsMap: Map<string, string>, fallbackNs: string): XsdSchema {
  const targetNamespace = schemaNode.attrs["targetNamespace"] || fallbackNs;
  const schema: XsdSchema = {
    targetNamespace,
    elementFormDefault: schemaNode.attrs["elementFormDefault"] === "unqualified" ? "unqualified" : "qualified",
    elements: new Map(),
    complexTypes: new Map(),
    simpleTypes: new Map(),
  };
  for (const child of schemaNode.children) {
    const local = _localName(child.name);
    if (local === "element") {
      const def = _parseElementDecl(child, nsMap);
      if (def && def.name) schema.elements.set(def.name, def);
    } else if (local === "complexType") {
      const name = child.attrs["name"];
      if (!name) continue;
      const def: WsdlElementDef = {
        name,
        minOccurs: 1,
        maxOccurs: 1,
        nillable: false,
        complexChildren: [],
        attributes: [],
      };
      _fillComplexType(def, child, nsMap);
      schema.complexTypes.set(name, def);
    } else if (local === "simpleType") {
      const name = child.attrs["name"];
      if (!name) continue;
      const st = _parseSimpleType(child, nsMap);
      st.name = name;
      schema.simpleTypes.set(name, st);
    }
  }
  return schema;
}

export function parseWsdl(xml: string): WsdlDocument | null {
  const root = parseXml(xml);
  if (!root || _localName(root.name) !== "definitions") return null;

  const prefixToNs = new Map<string, string>();
  for (const [k, v] of Object.entries(root.attrs)) {
    if (k === "xmlns") prefixToNs.set("", v);
    else if (k.startsWith("xmlns:")) prefixToNs.set(k.slice(6), v);
  }
  const targetNamespace = root.attrs["targetNamespace"] || "";
  const svcNodes: XmlNode[] = [];
  _walk(root, "service", svcNodes);
  const serviceName = svcNodes[0]?.attrs["name"] || "";
  const wsdlName =
    root.attrs["name"] ||
    serviceName ||
    _friendlyWsdlName(targetNamespace) ||
    "WSDL Import";

  // Schemas
  const schemaNodes: XmlNode[] = [];
  _walk(root, "schema", schemaNodes);
  const schemas = new Map<string, XsdSchema>();
  for (const sn of schemaNodes) {
    const schema = _indexSchema(sn, prefixToNs, targetNamespace);
    if (!schemas.has(schema.targetNamespace)) schemas.set(schema.targetNamespace, schema);
  }

  // Messages
  const messageNodes: XmlNode[] = [];
  _walk(root, "message", messageNodes);
  const messages = new Map<string, WsdlMessagePart[]>();
  for (const mn of messageNodes) {
    const name = mn.attrs["name"];
    if (!name) continue;
    const parts: WsdlMessagePart[] = [];
    for (const child of mn.children) {
      if (_localName(child.name) !== "part") continue;
      const partName = child.attrs["name"] || "parameters";
      const elementRef = _resolveQName(child.attrs["element"], prefixToNs);
      const typeRef = _resolveQName(child.attrs["type"], prefixToNs);
      parts.push({ name: partName, element: elementRef ?? undefined, type: typeRef ?? undefined });
    }
    messages.set(name, parts);
  }

  // PortTypes → operations (name → input message local)
  const portTypeNodes: XmlNode[] = [];
  _walk(root, "portType", portTypeNodes);
  const portTypeOps = new Map<string, Map<string, string | undefined>>();
  for (const ptn of portTypeNodes) {
    const ptName = ptn.attrs["name"];
    if (!ptName) continue;
    const ops = new Map<string, string | undefined>();
    for (const child of ptn.children) {
      if (_localName(child.name) !== "operation") continue;
      const opName = child.attrs["name"];
      if (!opName) continue;
      let inputMsg: string | undefined;
      for (const io of child.children) {
        if (_localName(io.name) === "input") {
          const ref = _resolveQName(io.attrs["message"], prefixToNs);
          inputMsg = ref ? ref.local : undefined;
        }
      }
      ops.set(opName, inputMsg);
    }
    portTypeOps.set(ptName, ops);
  }

  // Services → ports
  const serviceNodes: XmlNode[] = [];
  _walk(root, "service", serviceNodes);
  const ports: WsdlPort[] = [];
  for (const sn of serviceNodes) {
    for (const child of sn.children) {
      if (_localName(child.name) !== "port") continue;
      const bindingRef = _resolveQName(child.attrs["binding"], prefixToNs);
      let location = "";
      let isSoap12 = false;
      for (const addr of child.children) {
        const ver = _soapVersionForPrefix(_splitQName(addr.name).prefix, prefixToNs);
        if (ver > 0) {
          location = addr.attrs["location"] || "";
          isSoap12 = ver === 12;
          break;
        }
      }
      ports.push({
        name: child.attrs["name"] || "",
        binding: bindingRef ? bindingRef.local : "",
        location,
        isSoap12,
      });
    }
  }

  // Bindings → operations
  const bindingNodes: XmlNode[] = [];
  _walk(root, "binding", bindingNodes);
  const operations: WsdlOperation[] = [];
  let anySoap12 = false;

  for (const bn of bindingNodes) {
    const bindingName = bn.attrs["name"] || "";
    const typeRef = _resolveQName(bn.attrs["type"], prefixToNs);
    const portTypeName = typeRef ? typeRef.local : "";

    let bindingVersion = 0;
    let bindingStyle = "";
    let transport = "";
    for (const child of bn.children) {
      if (_localName(child.name) !== "binding") continue;
      const ver = _soapVersionForPrefix(_splitQName(child.name).prefix, prefixToNs);
      if (ver > 0) {
        bindingVersion = ver;
        bindingStyle = child.attrs["style"] || "";
        transport = child.attrs["transport"] || "";
        break;
      }
    }
    if (bindingVersion === 0) continue;
    if (!_isHttpTransport(transport)) continue;
    const isSoap12 = bindingVersion === 12;
    if (isSoap12) anySoap12 = true;

    const ptOps = portTypeOps.get(portTypeName) || new Map<string, string | undefined>();

    for (const op of bn.children) {
      if (_localName(op.name) !== "operation") continue;
      const opName = op.attrs["name"];
      if (!opName) continue;

      let soapAction = "";
      let opStyle = bindingStyle;
      let opUse = "literal";
      let opBodyNs: string | undefined;
      const headerParts: WsdlHeaderPart[] = [];
      for (const child of op.children) {
        const local = _localName(child.name);
        if (local === "operation" && _soapVersionForPrefix(_splitQName(child.name).prefix, prefixToNs) > 0) {
          soapAction = child.attrs["soapAction"] ?? "";
          opStyle = child.attrs["style"] || opStyle;
        } else if (local === "input") {
          for (const body of child.children) {
            const bodyLocal = _localName(body.name);
            const bodyVer = _soapVersionForPrefix(_splitQName(body.name).prefix, prefixToNs);
            if (bodyLocal === "body" && bodyVer > 0) {
              if (body.attrs["use"] === "encoded") opUse = "encoded";
              opBodyNs = body.attrs["namespace"] || opBodyNs;
            } else if (bodyLocal === "header" && bodyVer > 0) {
              const headerMsg = _resolveQName(body.attrs["message"], prefixToNs);
              const headerPart = body.attrs["part"];
              const headerUse = body.attrs["use"] || "literal";
              if (headerMsg && headerPart) {
                const parts = messages.get(headerMsg.local) || [];
                const partDef = parts.find((p) => p.name === headerPart);
                headerParts.push({
                  part: headerPart,
                  element: partDef?.element,
                  type: partDef?.type,
                  use: headerUse,
                });
              }
            }
          }
        }
      }

      const inputMessageName = ptOps.get(opName);
      const inputParts = inputMessageName ? messages.get(inputMessageName) || [] : [];

      const opRec: WsdlOperation = {
        name: opName,
        binding: bindingName,
        soapAction,
        style: opStyle === "rpc" ? "rpc" : "document",
        use: opUse === "encoded" ? "encoded" : "literal",
        bodyNamespace: opBodyNs,
        inputMessage: inputMessageName,
        inputParts,
        headerParts,
        isSoap12,
      };

      const partElement = inputParts.find((p) => p.element);
      if (partElement?.element) opRec.inputElement = partElement.element;

      const port = ports.find((p) => p.binding === bindingName);
      if (port && port.location) opRec.location = port.location;

      operations.push(opRec);
    }
  }

  return {
    name: wsdlName,
    targetNamespace,
    prefixToNs,
    schemas,
    operations,
    ports,
    isSoap12: anySoap12,
  };
}

// ─── Envelope generation ─────────────────────────────────────────────────────

interface RenderCtx {
  usedPrefixes: Map<string, string>; // prefix → ns uri
  prefixFor: (nsUri: string) => string;
}

function _createRenderCtx(wsdl: WsdlDocument): RenderCtx {
  const usedPrefixes = new Map<string, string>();
  let counter = 0;
  const prefixFor = (nsUri: string): string => {
    if (nsUri === wsdl.targetNamespace) {
      if (!usedPrefixes.has("tns")) usedPrefixes.set("tns", nsUri);
      return "tns";
    }
    for (const [prefix, uri] of usedPrefixes) {
      if (uri === nsUri) return prefix;
    }
    let prefix = `ns${++counter}`;
    while (usedPrefixes.has(prefix)) prefix = `ns${++counter}`;
    usedPrefixes.set(prefix, nsUri);
    return prefix;
  };
  return { usedPrefixes, prefixFor };
}

function _indent(xml: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return xml
    .split("\n")
    .map((l) => (l.trim() ? pad + l : l))
    .join("\n");
}

function _schemaFor(wsdl: WsdlDocument, nsUri: string): XsdSchema | undefined {
  return wsdl.schemas.get(nsUri);
}

function _lookupElement(wsdl: WsdlDocument, ref: WsdlElementRef): WsdlElementDef | undefined {
  return wsdl.schemas.get(ref.ns)?.elements.get(ref.local);
}

function _lookupComplexType(wsdl: WsdlDocument, ref: WsdlElementRef): WsdlElementDef | undefined {
  return wsdl.schemas.get(ref.ns)?.complexTypes.get(ref.local);
}

function _lookupSimpleType(wsdl: WsdlDocument, ref: WsdlElementRef): WsdlSimpleType | undefined {
  return wsdl.schemas.get(ref.ns)?.simpleTypes.get(ref.local);
}

function _enumFirstValue(wsdl: WsdlDocument, ref: WsdlElementRef): string {
  const st = _lookupSimpleType(wsdl, ref);
  if (st?.enumeration.length) return st.enumeration[0];
  if (st?.base) return _enumFirstValue(wsdl, st.base);
  return "string";
}

/** Sample a value for a type reference (primitive, complexType, simpleType). */
function _sampleTypeValue(
  wsdl: WsdlDocument,
  ref: WsdlElementRef,
  ctx: RenderCtx,
  depth: number,
  seen: Set<string>,
): string | undefined {
  if (depth > 24) return "string";
  if (_isXsdPrimitive(ref)) return _samplePrimitive(ref);
  const ct = _lookupComplexType(wsdl, ref);
  if (ct) {
    const key = `${ref.ns}|${ref.local}`;
    if (seen.has(key)) return undefined;
    const next = new Set(seen);
    next.add(key);
    return _renderInner(wsdl, ct, ref.ns, ctx, depth + 1, next) ?? "";
  }
  const st = _lookupSimpleType(wsdl, ref);
  if (st) {
    if (st.enumeration.length) return st.enumeration[0];
    if (st.base) return _sampleTypeValue(wsdl, st.base, ctx, depth, seen) ?? "string";
    return "string";
  }
  return undefined;
}

/** Render the inner content of an element def (children or scalar). Returns
 *  `null` when the element must be self-closing (no content). */
function _renderInner(
  wsdl: WsdlDocument,
  def: WsdlElementDef,
  nsUri: string,
  ctx: RenderCtx,
  depth: number,
  seen: Set<string>,
): string | null {
  const children = [...def.complexChildren];
  if (def.baseRef && !_isXsdPrimitive(def.baseRef)) {
    const base = _lookupComplexType(wsdl, def.baseRef);
    if (base) children.unshift(...base.complexChildren);
  }
  if (children.length > 0) {
    const schema = _schemaFor(wsdl, nsUri);
    const childQualified = schema?.elementFormDefault === "qualified";
    return children
      .map((c) => _renderElement(wsdl, c, nsUri, ctx, depth + 1, childQualified, seen))
      .join("\n  ");
  }

  if (def.defaultValue) return def.defaultValue;
  if (def.simpleBase) {
    return _isXsdPrimitive(def.simpleBase) ? _samplePrimitive(def.simpleBase) : _enumFirstValue(wsdl, def.simpleBase);
  }
  if (def.typeRef) return _sampleTypeValue(wsdl, def.typeRef, ctx, depth, seen) ?? "string";
  return null;
}

function _renderAttributes(
  wsdl: WsdlDocument,
  def: WsdlElementDef,
  ctx: RenderCtx,
  depth: number,
  seen: Set<string>,
): string {
  return def.attributes
    .map((a) => {
      let value = a.defaultValue;
      if (value === undefined && a.typeRef) {
        if (_isXsdPrimitive(a.typeRef)) value = _samplePrimitive(a.typeRef);
        else value = _sampleTypeValue(wsdl, a.typeRef, ctx, depth, seen);
      }
      return ` ${a.name}="${value ?? "string"}"`;
    })
    .join("");
}

/** Render a full `<qname attrs>…</qname>` element with sample data. */
function _renderElement(
  wsdl: WsdlDocument,
  def: WsdlElementDef,
  nsUri: string,
  ctx: RenderCtx,
  depth: number,
  qualified: boolean,
  seen: Set<string>,
): string {
  if (depth > 24) return `<${def.name}>string</${def.name}>`;
  const prefix = qualified ? ctx.prefixFor(nsUri) : "";
  const qname = prefix ? `${prefix}:${def.name}` : def.name;
  const attrs = _renderAttributes(wsdl, def, ctx, depth, seen);
  const inner = _renderInner(wsdl, def, nsUri, ctx, depth, seen);
  if (inner === null) return `<${qname}${attrs}/>`;
  if (!inner.includes("\n")) return `<${qname}${attrs}>${inner}</${qname}>`;
  return `<${qname}${attrs}>\n${_indent(inner, 2)}\n</${qname}>`;
}

function _sampleOperationBody(wsdl: WsdlDocument, op: WsdlOperation, ctx: RenderCtx, depth: number): string {
  // rpc style (Java/JAX-WS Holder services): the wrapper element lives in the
  // `soap:body` namespace and the parts are unqualified `argN`-style elements.
  const elementNs = op.inputElement?.ns || op.bodyNamespace || wsdl.targetNamespace;
  const prefix = ctx.prefixFor(elementNs);

  if (op.inputElement) {
    if (_isEncryptedDataRef(op.inputElement)) {
      return _renderEncryptedDataTemplate(ctx);
    }
    const elDef = _lookupElement(wsdl, op.inputElement);
    if (elDef) {
      return _renderElement(wsdl, elDef, elementNs, ctx, depth, true, new Set());
    }
    return `<${prefix}:${op.inputElement.local}/>`;
  }

  // rpc style — render each part as an element inside the operation wrapper
  const inner = op.inputParts
    .map((part) => {
      if (_isEncryptedDataRef(part.type)) return _renderEncryptedDataTemplate(ctx);
      const value = part.type ? _sampleTypeValue(wsdl, part.type, ctx, depth + 1, new Set()) ?? "string" : "string";
      return `<${part.name}>${value}</${part.name}>`;
    })
    .join("\n  ");
  if (!inner) return `<${prefix}:${op.name}/>`;
  return `<${prefix}:${op.name}>\n  ${inner}\n</${prefix}:${op.name}>`;
}

/** Render a WS-Security `<Security>` header with a placeholder UsernameToken.
 *  WSSE schemas are usually not embedded in the WSDL, so we emit a usable
 *  template directly instead of sampling an unknown type. */
function _renderWsseSecurity(ctx: RenderCtx): string {
  const pfx = ctx.prefixFor(WSSE_NS);
  const usernameToken = [
    `  <${pfx}:UsernameToken>`,
    `    <${pfx}:Username>username</${pfx}:Username>`,
    `    <${pfx}:Password Type="${WSSE_PASSWORD_TEXT_URI}">password</${pfx}:Password>`,
    `  </${pfx}:UsernameToken>`,
  ].join("\n");
  return `<${pfx}:Security>\n${_indent(usernameToken, 2)}\n</${pfx}:Security>`;
}

/** Render an `xenc:EncryptedData` template for operations whose input message
 *  is declared as an XML-Encryption payload. Placeholder base64 values are
 *  replaced at send time by `wsse.ts` (see `applyWsseSecurity`). */
function _renderEncryptedDataTemplate(ctx: RenderCtx): string {
  const x = ctx.prefixFor(XENC_NS);
  const ds = ctx.prefixFor(DS_NS);
  return [
    `<${x}:EncryptedData Type="${XENC_NS}Element">`,
    `  <${x}:EncryptionMethod Algorithm="${XENC_NS}aes256-cbc"/>`,
    `  <${ds}:KeyInfo>`,
    `    <${x}:EncryptedKey>`,
    `      <${x}:EncryptionMethod Algorithm="${XENC_NS}rsa-oaep-mgf1p"/>`,
    `      <${x}:CipherData>`,
    `        <${x}:CipherValue>BASE64_ENCRYPTED_SYMMETRIC_KEY</${x}:CipherValue>`,
    `      </${x}:CipherData>`,
    `    </${x}:EncryptedKey>`,
    `  </${ds}:KeyInfo>`,
    `  <${x}:CipherData>`,
    `    <${x}:CipherValue>BASE64_ENCRYPTED_BODY</${x}:CipherValue>`,
    `  </${x}:CipherData>`,
    `</${x}:EncryptedData>`,
  ].join("\n");
}

/** True when a type/element reference points at XML-Encryption. */
function _isEncryptedDataRef(ref: WsdlElementRef | undefined): boolean {
  return ref?.ns === XENC_NS && ref.local === "EncryptedData";
}

/** Render the SOAP headers declared by the binding (`<soap:header>` parts) with
 *  sample values. Returns `null` when the operation declares no headers. */
function _sampleHeaderBody(wsdl: WsdlDocument, op: WsdlOperation, ctx: RenderCtx, depth: number): string | null {
  const parts: string[] = [];
  for (const hp of op.headerParts) {
    if (hp.element && hp.element.ns === WSSE_NS && hp.element.local === "Security") {
      parts.push(_renderWsseSecurity(ctx));
      continue;
    }
    if (hp.element) {
      const elDef = _lookupElement(wsdl, hp.element);
      const ns = hp.element.ns;
      const qualified = _schemaFor(wsdl, ns)?.elementFormDefault !== "unqualified";
      if (elDef) {
        parts.push(_renderElement(wsdl, elDef, ns, ctx, depth, qualified, new Set()));
        continue;
      }
      const prefix = ctx.prefixFor(ns);
      parts.push(`<${prefix}:${hp.element.local}/>`);
      continue;
    }
    if (hp.type) {
      const value = _sampleTypeValue(wsdl, hp.type, ctx, depth, new Set()) ?? "string";
      parts.push(`<${hp.part}>${value}</${hp.part}>`);
    }
  }
  return parts.length > 0 ? parts.join("\n  ") : null;
}

/** Generate a full SOAP envelope for an operation. */
export function buildSoapEnvelope(wsdl: WsdlDocument, operationName: string): string {
  const op = wsdl.operations.find((o) => o.name === operationName) || wsdl.operations[0];
  if (!op) return "";
  const ctx = _createRenderCtx(wsdl);
  const envNs = op.isSoap12 ? SOAP12_ENV_NS : SOAP11_ENV_NS;
  const elementNs = op.inputElement?.ns || op.bodyNamespace || wsdl.targetNamespace;
  const prefix = ctx.prefixFor(elementNs);
  const body = _sampleOperationBody(wsdl, op, ctx, 0);
  const headerBody = _sampleHeaderBody(wsdl, op, ctx, 1);

  let bindings = ` xmlns:${prefix}="${elementNs}"`;
  for (const [p, uri] of ctx.usedPrefixes) {
    if (p === prefix) continue;
    bindings += ` xmlns:${p}="${uri}"`;
  }
  const encoding = op.use === "encoded" ? ` soapenv:encodingStyle="${SOAP11_ENC_NS}"` : "";
  const headerXml = headerBody
    ? `  <soapenv:Header>\n${_indent(headerBody, 4)}\n  </soapenv:Header>`
    : `  <soapenv:Header/>`;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<soapenv:Envelope xmlns:soapenv="${envNs}"${bindings}>`,
    headerXml,
    `  <soapenv:Body${encoding}>`,
    _indent(body, 4),
    `  </soapenv:Body>`,
    `</soapenv:Envelope>`,
  ].join("\n");
}

/** True when `text` looks like a WSDL document (for auto-detection). */
export function looksLikeWsdl(text: string): boolean {
  return (
    /<(?:[A-Za-z_][\w.:-]*:)?definitions\b[\s>]/.test(text) &&
    /(?:targetNamespace|soap:|wsdl:)/.test(text.slice(0, 4000))
  );
}
