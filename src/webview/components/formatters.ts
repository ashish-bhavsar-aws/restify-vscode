/**
 * Utility functions for formatting and minifying JSON and XML
 */

export function formatJSON(jsonString: string): string {
  try {
    const parsed = JSON.parse(jsonString);
    return JSON.stringify(parsed, null, 2);
  } catch (error) {
    return jsonString;
  }
}

export function minifyJSON(jsonString: string): string {
  try {
    const parsed = JSON.parse(jsonString);
    return JSON.stringify(parsed);
  } catch (error) {
    return jsonString;
  }
}

export function formatXML(xmlString: string): string {
  try {
    const tab = '  ';
    const compact = xmlString.replace(/>\s+</g, '><').trim();
    const parts = compact.split(/(<[^>]+>)/g).filter(Boolean);

    let formatted = '';
    let indent = 0;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;

      // Closing tag
      if (/^<\//.test(part)) {
        indent = Math.max(0, indent - 1);
        formatted += `${tab.repeat(indent)}${part}\n`;
        continue;
      }

      // Declaration, comment, DOCTYPE
      if (/^<\?/.test(part) || /^<!/.test(part)) {
        formatted += `${tab.repeat(indent)}${part}\n`;
        continue;
      }

      // Self-closing tag
      if (/^<[^>]+\/>$/.test(part)) {
        formatted += `${tab.repeat(indent)}${part}\n`;
        continue;
      }

      // Opening tag
      if (/^</.test(part)) {
        const next = parts[i + 1];
        const next2 = parts[i + 2];

        const openMatch = part.match(/^<\s*([^\s/>]+)/);
        const openName = openMatch ? openMatch[1] : null;

        if (
          next !== undefined &&
          next2 !== undefined &&
          !next.startsWith('<') &&
          /^<\s*\/\s*[^>]+>/.test(next2)
        ) {
          const closeMatch = String(next2).match(/^<\s*\/\s*([^\s>]+)/);
          const closeName = closeMatch ? closeMatch[1] : null;

          if (openName && closeName && openName === closeName) {
            // Inline single-text element
            const text = String(next).replace(/^\s+|\s+$/g, '');
            formatted += `${tab.repeat(indent)}${part}${text}${next2}\n`;
            i += 2; // skip next and next2
            continue;
          }
        }

        formatted += `${tab.repeat(indent)}${part}\n`;
        indent += 1;
        continue;
      }

      // Text node
      const text = part.replace(/^\s+|\s+$/g, '');
      if (text) {
        formatted += `${tab.repeat(indent)}${text}\n`;
      }
    }

    return formatted.trim();
  } catch (error) {
    return xmlString;
  }
}

export function minifyXML(xmlString: string): string {
  try {
    // Remove comments, whitespace between tags, and trim text nodes
    return xmlString
      .replace(/<!--[\s\S]*?-->/g, '') // Remove comments
      .replace(/>\s+</g, '><') // Remove whitespace between tags
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();
  } catch (error) {
    return xmlString;
  }
}

export function isValidJSON(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

export function isValidXML(str: string): boolean {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(str, 'text/xml');
    // Check for parse errors
    return !xmlDoc.getElementsByTagName('parsererror').length;
  } catch {
    return false;
  }
}



