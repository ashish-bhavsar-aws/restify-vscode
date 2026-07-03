# Quick Start Guide - Testing Datatype Detection

## Setup (1 min)

```bash
cd server
npm install
npm start
```

Server runs at: `http://localhost:3000`

## Quick Tests

### Option 1: Swagger UI (Easiest)
```
Open browser: http://localhost:3000/api-docs
```
Interactive API documentation. Click "Try it out" on any endpoint to test.

### Option 2: Interactive Web Form
```
Open browser: http://localhost:3000/test-form
```
Fill in the form and submit to see responses.

---

### Option 2: Restify Extension (Main Test)

#### Test Case 1: JSON Content Type
1. Create POST request to `http://localhost:3000/api/json-field`
2. Set Body Type → "form"
3. Add field:
   - Key: `metadata`
   - Value: `{"user_id": 123, "status": "active"}`
   - Content-Type: `application/json` (or click Auto)
4. Send and verify response

#### Test Case 2: XML Content Type
1. Create POST request to `http://localhost:3000/api/xml-field`
2. Set Body Type → "form"
3. Add field:
   - Key: `config`
   - Value: `<config><enabled>true</enabled></config>`
   - Content-Type: `application/xml` (or click Auto)
4. Send and check response

#### Test Case 3: Mixed Content Types
1. Create POST request to `http://localhost:3000/api/mixed-content`
2. Set Body Type → "form"
3. Add multiple fields with different types:
   ```
   Field 1:
   - Key: user_data
   - Value: {"name": "John", "age": 30}
   - Content-Type: application/json
   
   Field 2:
   - Key: config
   - Value: <settings><debug>true</debug></settings>
   - Content-Type: application/xml
   
   Field 3:
   - Key: notes
   - Value: Plain text field
   - Content-Type: (empty)
   ```
4. Send and verify all fields are received correctly

#### Test Case 4: File Upload with Metadata
1. Create POST request to `http://localhost:3000/api/file-upload`
2. Set Body Type → "form"
3. Add fields:
   ```
   Field 1 (text):
   - Key: metadata
   - Value: {"file_type": "document", "version": 1}
   - Content-Type: application/json
   
   Field 2 (file):
   - Key: file
   - Type: File (click F)
   - Select any file
   - Content-Type: (auto-detected from file)
   ```
4. Send and verify response includes both metadata and file info

---

### Option 3: cURL Commands

```bash
# Simple JSON
curl -X POST http://localhost:3000/api/json-field \
  -F "metadata={\"user_id\": 123};type=application/json"

# Simple XML
curl -X POST http://localhost:3000/api/xml-field \
  -F "data=<root><test>value</test></root>;type=application/xml"

# Mixed content
curl -X POST http://localhost:3000/api/mixed-content \
  -F "json_data={\"key\": \"value\"};type=application/json" \
  -F "xml_data=<root>content</root>;type=application/xml" \
  -F "text_data=plain text;type=text/plain"

# File with metadata
curl -X POST http://localhost:3000/api/file-upload \
  -F "metadata={\"type\": \"pdf\"};type=application/json" \
  -F "file=@document.pdf"
```

---

## Verification Checklist

✅ **Auto-Detection:**
- [ ] JSON values auto-detected when no content-type set
- [ ] XML values auto-detected when no content-type set
- [ ] "Auto" button appears when detection is possible
- [ ] Clicking "Auto" sets correct content-type

✅ **Manual Content-Type:**
- [ ] Can manually enter any content-type (e.g., application/json)
- [ ] Content-type persists when field is updated
- [ ] Different fields can have different content-types

✅ **cURL Generation:**
- [ ] Text fields with content-type show `;type=<mime>`
- [ ] File fields show `;type=<mime>`
- [ ] cURL command is properly formatted

✅ **Request Execution:**
- [ ] Server receives correct field values
- [ ] Content-Type headers set correctly
- [ ] Response shows received data accurately

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Server won't start | Check port 3000 is free, or edit `index.js` to use different port |
| "Cannot find module" | Run `npm install` in server directory |
| Auto-detection not working | Ensure value starts with `{` (JSON) or `<` (XML) and is valid |
| Content-Type not showing in request | Check that field is type "text" (not "file") |
| File upload fails | Ensure file path exists and is readable |

---

## Test Results Interpretation

### Success Response Example:
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "message": "Form data received",
  "fields": {
    "metadata": {
      "value": "{\"user_id\": 123, \"status\": \"active\"}",
      "type": "text",
      "detected": "application/json"
    }
  }
}
```

**Look for:**
- ✅ `"detected": "application/json"` or similar
- ✅ All fields received correctly
- ✅ File information if uploaded

---

## Next Steps

After basic testing:
1. Test code generation (JavaScript, Python, Java, etc.)
2. Verify generated code works with actual APIs
3. Test edge cases (empty fields, special characters, etc.)
4. Try with real APIs that require specific content types

Enjoy testing! 🎉
