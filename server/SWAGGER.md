# Swagger/OpenAPI Integration

The Restify test server now includes **Swagger UI** for interactive API documentation and testing.

## Access Swagger

Open your browser and navigate to:
```
http://localhost:3000/api-docs
```

You'll see the **Swagger UI** with:
- ✅ All 5 API endpoints documented
- ✅ Request/response schemas
- ✅ "Try it out" button to test endpoints
- ✅ Detailed parameter descriptions
- ✅ Example values for form fields

## Swagger Features

### Interactive API Testing
- Click "Try it out" on any endpoint
- Fill in the form fields
- Click "Execute" to send the request
- See the response in real-time

### OpenAPI Specification
- Access raw OpenAPI spec: `http://localhost:3000/swagger.json`
- OpenAPI 3.0.0 format
- Fully documented endpoints with schemas
- Component reusability

### Documented Endpoints

#### 1. GET `/`
**Description:** Welcome endpoint with endpoint list

**Response:**
```json
{
  "message": "Welcome to Restify Test Server",
  "endpoints": {...}
}
```

#### 2. POST `/api/form-data`
**Description:** Generic form-data endpoint

**Parameters:**
- Any form field with optional content-type

**Response:** Echo back with detected content types

#### 3. POST `/api/json-field`
**Description:** Test JSON content in form fields

**Example:**
```
Key: metadata
Value: {"user_id": 123, "status": "active"}
```

#### 4. POST `/api/xml-field`
**Description:** Test XML content in form fields

**Example:**
```
Key: config
Value: <?xml version="1.0"?><root><item>test</item></root>
```

#### 5. POST `/api/mixed-content`
**Description:** Multiple fields with different content types

**Example:**
```
Field 1: user_info = {"name": "John"} (JSON)
Field 2: config = <root>data</root> (XML)
Field 3: notes = plain text
```

#### 6. POST `/api/file-upload`
**Description:** File upload with metadata

**Example:**
```
Field 1: metadata = {"file_type": "pdf"} (JSON)
Field 2: file = [binary file]
```

#### 7. GET `/test-form`
**Description:** Interactive HTML form

## Using Swagger UI

### To Test an Endpoint:

1. **Click on endpoint** (e.g., `POST /api/mixed-content`)
2. **Click "Try it out"**
3. **Fill in the form fields**:
   ```
   user_info: {"name": "John", "age": 30}
   config: <root><enabled>true</enabled></root>
   notes: Plain text
   ```
4. **Click "Execute"**
5. **See the Response:**
   ```json
   {
     "message": "Mixed content received",
     "fields": {
       "user_info": {
         "value": "{\"name\": \"John\", \"age\": 30}",
         "size": 31,
         "contentType": "application/json"
       },
       ...
     }
   }
   ```

### Copy cURL Command

In Swagger UI:
1. Send a request with "Execute"
2. Look for the **cURL** section below the response
3. Copy the full cURL command
4. Paste in terminal

**Example cURL from Swagger:**
```bash
curl -X POST "http://localhost:3000/api/mixed-content" \
  -H "content-type: multipart/form-data" \
  -F "user_info={"name": "John"};type=application/json" \
  -F "config=<root>data</root>;type=application/xml"
```

## OpenAPI Spec Details

### Base URL
```
http://localhost:3000
```

### API Version
```
1.0.0
```

### Components/Schemas

**FormDataResponse:**
```yaml
type: object
properties:
  timestamp: string (date-time)
  message: string
  fields: object
  files: array
```

**JsonFieldResponse:**
```yaml
type: object
properties:
  message: string
  fields: object
  parsed: object
```

**MixedContentResponse:**
```yaml
type: object
properties:
  message: string
  fields: object
  files: array
  summary:
    totalFields: number
    totalFiles: number
```

## Accessing Raw OpenAPI Specification

Get the raw OpenAPI 3.0.0 JSON specification:

```bash
curl http://localhost:3000/swagger.json | jq .
```

### Use Cases for OpenAPI Spec:
- Import into API clients (Postman, Insomnia, etc.)
- Generate client SDKs
- Generate server stubs
- API documentation generation
- Mock server creation

## Integration with API Clients

### Postman
1. Go to Postman
2. Click "Import"
3. Select "Link"
4. Paste: `http://localhost:3000/swagger.json`
5. Click "Continue" and "Import"

### Insomnia
1. Create → Import
2. From URL
3. Enter: `http://localhost:3000/swagger.json`

### VS Code REST Client
Install REST Client extension, then create test file:

```http
### Get Swagger spec
GET http://localhost:3000/swagger.json

### Test JSON field
POST http://localhost:3000/api/json-field
Content-Type: multipart/form-data; boundary=----FormBoundary

------FormBoundary
Content-Disposition: form-data; name="metadata"; type=application/json

{"user_id": 123}
------FormBoundary--
```

## Benefits

✅ **Self-documenting API** - Code + docs stay in sync  
✅ **Interactive Testing** - No need for external tools initially  
✅ **Schema Validation** - Request/response types clearly defined  
✅ **Client Generation** - Auto-generate SDKs and clients  
✅ **Mock Servers** - Create mock API for frontend development  
✅ **API Contracts** - Clear agreement between client and server  

## Notes

- Swagger UI is read-only (doesn't modify docs)
- Upload files in Swagger uses multipart/form-data
- Content-Type headers are handled automatically
- All examples in docs are executable in Swagger UI
- OpenAPI spec updates automatically with code changes

---

## Quick Access Links

When server is running:

| URL | Purpose |
|-----|---------|
| `http://localhost:3000` | Server welcome page |
| `http://localhost:3000/api-docs` | 📊 **Swagger UI** (interactive) |
| `http://localhost:3000/swagger.json` | Raw OpenAPI 3.0.0 spec |
| `http://localhost:3000/test-form` | HTML form for testing |

---

**Next Steps:**
1. Start server: `cd server && npm start`
2. Open Swagger: `http://localhost:3000/api-docs`
3. Click "Try it out" on any endpoint
4. Test with your data
5. Copy the cURL command
6. Use in Restify extension
