# Visual Testing Guide - Datatype Detection Feature

## Server Console Output

When you run `npm start` in the server directory, you should see:

```
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║       🚀 Restify Test Server is running                    ║
║                                                            ║
║       Server: http://localhost:3000                         ║
║       Test Form: http://localhost:3000/test-form            ║
║                                                            ║
║       Quick Test Endpoints:                                ║
║       • POST http://localhost:3000/api/form-data          ║
║       • POST http://localhost:3000/api/json-field         ║
║       • POST http://localhost:3000/api/xml-field          ║
║       • POST http://localhost:3000/api/mixed-content      ║
║       • POST http://localhost:3000/api/file-upload        ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
```

---

## Restify UI - Form Fields with Content-Type

When adding form fields in Restify, you'll see:

### Before (Without Enhancement)
```
Field 1:
┌─────────────────────────┐
│ ☑ [Key input] T|F [×]   │
│   [Value input]         │
└─────────────────────────┘
```

### After (With Datatype Detection)
```
Field 1 (Text):
┌─────────────────────────────────────────────┐
│ ☑ [Key] T|F [×]                             │
│   [Value input]                             │
│   [Content-Type input] [Auto] (if detected) │
└─────────────────────────────────────────────┘

Field 1 (File):
┌─────────────────────────────────────────────┐
│ ☑ [Key] T|F [×]                             │
│   [File selector] [Upload.pdf]              │
│   [Content-Type input] (e.g., application/pdf)
└─────────────────────────────────────────────┘
```

---

## Example: Testing JSON Content Type

### Step 1: Create Request
```
Method:  POST
URL:     http://localhost:3000/api/json-field
```

### Step 2: Add Form Field
```
Key:           metadata
Value:         {"user_id": 123, "status": "active"}
Type:          Text (T)
Content-Type:  [Auto button appears!]
```

### Step 3: Auto-Detection
Since the value is valid JSON (starts with `{`), you'll see:
- ✅ Auto-detect button appears
- Click it → Content-Type automatically set to `application/json`

### Step 4: Send Request
The generated cURL will look like:
```bash
curl -X POST http://localhost:3000/api/json-field \
  -F "metadata={\"user_id\": 123, \"status\": \"active\"};type=application/json"
```

### Step 5: Server Response
```json
{
  "message": "JSON field received",
  "fields": {
    "metadata": "{\"user_id\": 123, \"status\": \"active\"}"
  },
  "parsed": {
    "metadata": {
      "user_id": 123,
      "status": "active"
    }
  }
}
```

---

## Example: Testing XML Content Type

### Step 1: Create Request
```
Method:  POST
URL:     http://localhost:3000/api/xml-field
```

### Step 2: Add Form Field
```
Key:           config
Value:         <config><enabled>true</enabled><version>1.0</version></config>
Type:          Text (T)
Content-Type:  [Auto button appears!]
```

### Step 3: Auto-Detection
Since the value is valid XML (starts with `<`), you'll see:
- ✅ Auto-detect button appears
- Click it → Content-Type automatically set to `application/xml`

### Step 4: Send Request
The generated cURL will look like:
```bash
curl -X POST http://localhost:3000/api/xml-field \
  -F "config=<config><enabled>true</enabled><version>1.0</version></config>;type=application/xml"
```

### Step 5: Server Response
```json
{
  "message": "XML field received",
  "fields": {
    "config": "<config><enabled>true</enabled><version>1.0</version></config>"
  },
  "rawXml": {
    "config": "<config><enabled>true</enabled><version>1.0</version></config>"
  }
}
```

---

## Example: Mixed Content Types

### Request Setup
```
Method:  POST
URL:     http://localhost:3000/api/mixed-content

Field 1:
  Key:           user_data
  Value:         {"name": "John", "age": 30}
  Content-Type:  application/json [✓ Auto-detected]

Field 2:
  Key:           config_file
  Value:         <?xml version="1.0"?><settings><debug>true</debug></settings>
  Content-Type:  application/xml [✓ Auto-detected]

Field 3:
  Key:           notes
  Value:         This is a plain text note
  Content-Type:  (empty)
```

### Generated cURL
```bash
curl -X POST http://localhost:3000/api/mixed-content \
  -F "user_data={\"name\": \"John\", \"age\": 30};type=application/json" \
  -F "config_file=<?xml version=\"1.0\"?><settings><debug>true</debug></settings>;type=application/xml" \
  -F "notes=This is a plain text note"
```

### Server Response
```json
{
  "message": "Mixed content received",
  "fields": {
    "user_data": {
      "value": "{\"name\": \"John\", \"age\": 30}",
      "size": 31,
      "contentType": "application/json"
    },
    "config_file": {
      "value": "<?xml version=\"1.0\"?><settings><debug>true</debug></settings>",
      "size": 60,
      "contentType": "application/xml"
    },
    "notes": {
      "value": "This is a plain text note",
      "size": 25,
      "contentType": "text/plain"
    }
  },
  "summary": {
    "totalFields": 3,
    "totalFiles": 0
  }
}
```

---

## Example: File Upload with Metadata

### Request Setup
```
Method:  POST
URL:     http://localhost:3000/api/file-upload

Field 1 (Text):
  Key:           metadata
  Value:         {"file_type": "pdf", "uploaded_by": "user123"}
  Content-Type:  application/json [✓ Auto-detected]

Field 2 (File):
  Key:           document
  File:          [Select: document.pdf]
  Content-Type:  application/pdf
```

### Generated cURL
```bash
curl -X POST http://localhost:3000/api/file-upload \
  -F "metadata={\"file_type\": \"pdf\", \"uploaded_by\": \"user123\"};type=application/json" \
  -F "document=@/path/to/document.pdf;type=application/pdf"
```

### Server Response
```json
{
  "message": "File upload with metadata received",
  "metadata": {
    "file_type": "pdf",
    "uploaded_by": "user123"
  },
  "file": {
    "fieldName": "document",
    "originalName": "document.pdf",
    "mimeType": "application/pdf",
    "size": 25000,
    "path": "uploads/abc123def456"
  }
}
```

---

## Code Generation Examples

### JavaScript (Fetch)
```javascript
const form = new FormData();
form.append("metadata", "{\"user_id\": 123}"); // type=application/json
form.append("config", "<root>data</root>"); // type=application/xml

fetch("http://localhost:3000/api/mixed-content", {
  method: "POST",
  headers: {},
  body: form,
})
  .then(res => res.text())
  .then(console.log)
  .catch(console.error);
```

### Python (Requests)
```python
import requests

url = "http://localhost:3000/api/mixed-content"
headers = {}

data = {
    "metadata": "{\"user_id\": 123}",  # type=application/json
    "config": "<root>data</root>",      # type=application/xml
}

resp = requests.request("POST", url, headers=headers, data=data)
print(resp.status_code)
print(resp.text)
```

### Java (OkHttp)
```java
OkHttpClient client = new OkHttpClient();
MultipartBody.Builder builder = new MultipartBody.Builder().setType(MultipartBody.FORM);
  builder.addFormDataPart("metadata", "{\"user_id\": 123}", 
    RequestBody.create("{\"user_id\": 123}", MediaType.parse("application/json")));
  builder.addFormDataPart("config", "<root>data</root>");
RequestBody body = builder.build();
```

---

## Web Form Interface

When you open `http://localhost:3000/test-form`, you'll see:

```
╔══════════════════════════════════════════════════════════════╗
║                   🧪 Restify Test Form                      ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  API Endpoint:  [Generic Form Data ▼]                       ║
║                                                              ║
║  Field 1 Key:      [data_______________]                    ║
║  Field 1 Value:    [{"user_id": 123}__]                     ║
║  Field 1 Type:     [JSON ▼]                                 ║
║                                                              ║
║  Field 2 Key:      [metadata___________]                    ║
║  Field 2 Value:    [<config>...</config>]                   ║
║  Field 2 Type:     [XML ▼]                                  ║
║                                                              ║
║  File:             [Choose File]  [No file selected]        ║
║                                                              ║
║                    [Send Test Request]                      ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  Response:                                                   ║
║  {                                                           ║
║    "message": "Mixed content received",                     ║
║    "fields": {                                               ║
║      "data": {                                               ║
║        "value": "{\"user_id\": 123}",                        ║
║        "contentType": "application/json"                    ║
║      }                                                       ║
║    }                                                         ║
║  }                                                           ║
╚══════════════════════════════════════════════════════════════╝
```

---

## Verification Checklist

After running the tests above, verify:

✅ **UI Elements**
- [ ] Content-Type field appears for text fields
- [ ] "Auto" button appears for JSON/XML values
- [ ] File fields show separate Content-Type input
- [ ] Content-Type values persist across edits

✅ **Auto-Detection**
- [ ] JSON detection works for `{...}` patterns
- [ ] XML detection works for `<...>` patterns
- [ ] "Auto" button only shows when needed
- [ ] Clicking "Auto" sets correct MIME type

✅ **cURL Generation**
- [ ] Text field with content-type: `-F "key=value;type=mime"`
- [ ] File field with content-type: `-F "key=@path;type=mime"`
- [ ] Content-type properly escaped

✅ **Request Execution**
- [ ] Server receives correct content-types
- [ ] Mixed content requests work correctly
- [ ] File uploads with metadata work
- [ ] Responses show all data correctly

---

## Common Success Indicators

You'll know the feature is working when you see:

1. ✅ **"Auto" button appears** when pasting JSON/XML
2. ✅ **Content-Type field filled** after clicking Auto
3. ✅ **cURL includes `;type=`** in generated command
4. ✅ **Server response confirms** content types received
5. ✅ **No "Content-Type header missing"** warnings
