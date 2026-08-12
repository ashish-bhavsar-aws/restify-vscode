// Minimal YAML parser used for OpenAPI/Swagger imports.
export function parseYaml(yaml: string): any {
  const lines = yaml.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let pos = 0;

  function _peek(): string | undefined {
    return lines[pos];
  }
  function _next(): string {
    return lines[pos++];
  }

  function getIndent(line: string): number {
    let i = 0;
    while (i < line.length && line[i] === " ") i++;
    return i;
  }

  function isBlankOrComment(line: string): boolean {
    return /^\s*(#.*)?$/.test(line);
  }

  function parseScalar(raw: string): any {
    const s = raw.trim();
    if (s === "true") return true;
    if (s === "false") return false;
    if (s === "null" || s === "~") return null;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
    if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
      return s.slice(1, -1);
    }
    return s.replace(/\s+#.*$/, "").trim();
  }

  function parseValue(valueStr: string, indent: number): any {
    const trimmed = valueStr.trim();
    if (trimmed === "" || trimmed === "|" || trimmed === ">") {
      return parseBlock(indent);
    }
    if (trimmed === "-") return parseBlock(indent);
    return parseScalar(trimmed);
  }

  function parseBlock(minIndent: number): any {
    while (pos < lines.length && isBlankOrComment(lines[pos])) pos++;
    if (pos >= lines.length) return null;

    const firstLine = lines[pos];
    const indent = getIndent(firstLine);
    if (indent <= minIndent && minIndent !== -1) return null;

    const stripped = firstLine.trim();
    if (stripped.startsWith("- ") || stripped === "-") {
      return parseSequence(indent);
    }
    return parseMapping(indent);
  }

  function parseSequence(indent: number): any[] {
    const result: any[] = [];
    while (pos < lines.length) {
      while (pos < lines.length && isBlankOrComment(lines[pos])) pos++;
      if (pos >= lines.length) break;
      const line = lines[pos];
      const lineIndent = getIndent(line);
      if (lineIndent < indent) break;
      const stripped = line.trim();
      if (!stripped.startsWith("- ") && stripped !== "-") break;
      pos++;
      const valueStr = stripped.slice(2).trim();
      if (valueStr === "" || valueStr.includes(": ")) {
        const nested: any = {};
        if (valueStr.includes(": ")) {
          const colonIdx = valueStr.indexOf(": ");
          const k = valueStr.slice(0, colonIdx).trim();
          const v = valueStr.slice(colonIdx + 2).trim();
          nested[k] = v === "" ? parseBlock(lineIndent + 2) : parseScalar(v);
        }
        const rest = parseMapping(lineIndent + 2);
        result.push({ ...nested, ...(typeof rest === "object" && rest !== null ? rest : {}) });
      } else {
        result.push(parseScalar(valueStr));
      }
    }
    return result;
  }

  function parseMapping(indent: number): Record<string, any> {
    const result: Record<string, any> = {};
    while (pos < lines.length) {
      while (pos < lines.length && isBlankOrComment(lines[pos])) pos++;
      if (pos >= lines.length) break;
      const line = lines[pos];
      const lineIndent = getIndent(line);
      if (lineIndent < indent) break;
      const stripped = line.trim();
      if (stripped.startsWith("- ")) break;
      const colonIdx = stripped.indexOf(": ");
      const isKeyOnly = stripped.endsWith(":") && !stripped.startsWith("-");
      if (colonIdx === -1 && !isKeyOnly) {
        pos++;
        continue;
      }
      pos++;
      const key = isKeyOnly ? stripped.slice(0, -1).trim() : stripped.slice(0, colonIdx).trim();
      const cleanKey = key.replace(/^['"]|['"]$/g, "");
      if (isKeyOnly) {
        result[cleanKey] = parseBlock(lineIndent);
      } else {
        const valStr = stripped.slice(colonIdx + 2);
        result[cleanKey] = parseValue(valStr, lineIndent);
      }
    }
    return result;
  }

  return parseBlock(-1);
}
