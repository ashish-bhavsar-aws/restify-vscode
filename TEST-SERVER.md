# Test Server Setup for Datatype Detection Feature

## What Was Created

I've created a complete test server in the `/server` directory with the following files:

### Core Files
- **`index.js`** - Express server with 5 API endpoints designed to test form-data with custom content types
- **`package.json`** - Dependencies (Express, Multer, Swagger)
- **.gitignore** - Excludes node_modules and uploads

### Documentation
- **`README.md`** - Comprehensive guide with API documentation, curl examples, and troubleshooting
- **`QUICK-START.md`** - Quick reference with common test cases and verification checklist
- **`SWAGGER.md`** - Swagger/OpenAPI documentation
- **`sample-requests.json`** - Pre-made request examples

## Key Features

### API Endpoints & Documentation

1. **GET `/`** - Welcome page with endpoint list
2. **GET `/api-docs`** - 📊 **Swagger UI** (interactive API documentation)
3. **GET `/swagger.json`** - Raw OpenAPI 3.0.0 specification
4. **POST `/api/form-data`** - Generic endpoint for any form-data
5. **POST `/api/json-field`** - Test JSON content type in form fields
6. **POST `/api/xml-field`** - Test XML content type in form fields
7. **POST `/api/mixed-content`** - Test multiple fields with different content types
8. **POST `/api/file-upload`** - Test file upload with JSON metadata
9. **GET `/test-form`** - Interactive web form for manual testing

### Swagger/OpenAPI Integration

- ✅ **Interactive UI** - Swagger UI for testing endpoints
- ✅ **Auto-generated Docs** - From JSDoc comments in code
- ✅ **OpenAPI 3.0.0** - Industry-standard API specification
- ✅ **Try it Out** - Test endpoints directly in Swagger UI
- ✅ **cURL Commands** - Auto-generated for each request
- ✅ **Import Ready** - Can import into Postman, Insomnia, etc.

### Auto-Detection Features

The server includes:
- Form inputs for testing different content types
- Real-time server response display
- Support for files and multiple fields
- Server-side datatype detection
- Content-type validation

## How to Test

### 1. Start the Server
```bash
cd server
npm start
```
Server runs at `http://localhost:3000`

### 2. Using Swagger UI (Recommended)
Open browser: `http://localhost:3000/api-docs`

**Features:**
- Interactive endpoint documentation
- Click "Try it out" to test endpoints
- Auto-generated cURL commands
- Request/response schemas
- Real-time validation

### 3. Using the Web Form
Open browser: `http://localhost:3000/test-form`

### 4. Using Restify Extension

**Test JSON Content:**
- Create POST to `http://localhost:3000/api/json-field`
- Body type: "form"
- Add field with value: `{"user_id": 123, "status": "active"}`
- Set Content-Type: `application/json` (or click "Auto")

**Test XML Content:**
- Create POST to `http://localhost:3000/api/xml-field`
- Body type: "form"
- Add field with value: `<config><debug>true</debug></config>`
- Set Content-Type: `application/xml` (or click "Auto")

**Test Mixed Content:**
- Create POST to `http://localhost:3000/api/mixed-content`
- Add multiple fields with different content types:
  - JSON field with `application/json`
  - XML field with `application/xml`
  - Plain text field with empty content-type

### 4. Using cURL

```bash
# JSON test
curl -X POST http://localhost:3000/api/json-field \
  -F "metadata={\"user_id\": 123};type=application/json"

# XML test
curl -X POST http://localhost:3000/api/xml-field \
  -F "data=<root><item>test</item></root>;type=application/xml"

# Mixed content
curl -X POST http://localhost:3000/api/mixed-content \
  -F "json={\"key\": \"value\"};type=application/json" \
  -F "xml=<root>data</root>;type=application/xml" \
  -F "text=plain text"
```

## Testing Datatype Detection Feature

### What to Verify

✅ **Content-Type Input Field:**
- Shows for text form fields
- Doesn't show for file form fields (has separate field)
- Allows manual entry of any MIME type

✅ **Auto-Detection Button:**
- Appears when content can be auto-detected (JSON/XML)
- Clicking it sets the correct content-type
- Doesn't appear for plain text

✅ **cURL Generation:**
- Text fields with content-type: `-F "key=value;type=<mime>"`
- File fields with content-type: `-F "key=@path;type=<mime>"`

✅ **Request Execution:**
- Server receives the correct content-type for each field
- Response shows all fields parsed correctly

## File Structure

```
server/
├── index.js              # Main server file with all endpoints
├── package.json          # Dependencies
├── .gitignore           # Git ignore rules
├── README.md            # Full documentation
├── QUICK-START.md       # Quick reference guide
├── sample-requests.json # Example requests for Restify
├── uploads/             # Directory for uploaded files (auto-created)
└── node_modules/        # Dependencies (auto-created)
```

## Example Request in Restify

Here's a complete example of what to send:

```
Method: POST
URL: http://localhost:3000/api/mixed-content

Body Type: form

Fields:
1. Key: user_data
   Value: {"name": "John", "age": 30}
   Type: Text
   Content-Type: application/json

2. Key: config
   Value: <settings><theme>dark</theme></settings>
   Type: Text
   Content-Type: application/xml

3. Key: notes
   Value: This is a plain text field
   Type: Text
   Content-Type: (empty)
```

Expected Response:
```json
{
  "message": "Mixed content received",
  "fields": {
    "user_data": {
      "value": "{\"name\": \"John\", \"age\": 30}",
      "size": 35,
      "contentType": "application/json"
    },
    "config": {
      "value": "<settings><theme>dark</theme></settings>",
      "size": 40,
      "contentType": "application/xml"
    },
    "notes": {
      "value": "This is a plain text field",
      "size": 26,
      "contentType": "text/plain"
    }
  },
  "summary": {
    "totalFields": 3,
    "totalFiles": 0
  }
}
```

## Development Notes

The feature implementation includes:
- **formDataTypeDetector.ts** - Utility for detecting JSON, XML, and plain text
- **RequestPane.tsx** - UI for adding content-type fields (with auto-detect button)
- **RestifyPanel.ts** - Request execution that includes content-type headers
- **codegen.ts** - Code generation for cURL and other languages

## Next Steps

1. Test the Restify extension with the test server
2. Verify auto-detection works for JSON and XML
3. Test cURL generation with content types
4. Verify content-type headers in actual HTTP requests
5. Test with different programming language code generators

## Troubleshooting

**Server won't start:**
```bash
# Check if port is in use
lsof -i :3000

# Kill the process if needed
kill -9 <PID>
```

**Module not found:**
```bash
cd server
npm install
```

**Permission denied (uploads):**
```bash
mkdir -p server/uploads
chmod 755 server/uploads
```

## Cleanup

Stop the server with `Ctrl+C`

Remove uploaded files:
```bash
rm -rf server/uploads/*
```

Uninstall dependencies (if needed):
```bash
rm -rf server/node_modules server/package-lock.json
```
