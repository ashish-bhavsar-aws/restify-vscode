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
    // Insert newlines between closing and opening tags (xml.html approach)
    const xml = xmlString.replace(/(>)(<)(\/*)/g, '$1\n$2$3');
    let pad = 0;
    let formatted = '';

    xml.split('\n').forEach((node) => {
      let indent = 0;
      
      // Inline closing tag (opening and closing on same line)
      if (node.match(/.+<\/\w[^>]*>$/)) {
        indent = 0;
      }
      // Closing tag
      else if (node.match(/^<\/\w/)) {
        if (pad !== 0) pad -= 1;
      }
      // Opening tag (not self-closing)
      else if (node.match(/^<\w([^>]*[^/])?>.*$/)) {
        indent = 1;
      }
      // Text or other content
      else {
        indent = 0;
      }

      const padding = Array(pad + 1).join('  ');
      formatted += padding + node + '\n';
      pad += indent;
    });

    return formatted.trim();
  } catch (error) {
    return xmlString;
  }
}

export function minifyXML(xmlString: string): string {
  try {
    return xmlString.replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').replace(/\n/g, '');
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



