# Restify Test Server

A simple Node.js/Express server designed to test the form-data datatype detection feature in the Restify VS Code extension.

## Quick Start

### Installation

```bash
cd server
npm install
```

### Running the Server

```bash
# Production mode
npm start

# Development mode (with auto-reload)
npm run dev
```

The server will start on `http://localhost:3000`

## Testing the Datatype Detection Feature

### 1. Using the Web Form

Open your browser and navigate to:
```
http://localhost:3000/test-form
```

This provides an interactive HTML form where you can:
- Select different API endpoints
- Add form fields with different content types
- Upload files
- See the server response

### 2. Using Restify VS Code Extension

The main way to test this feature is with the Restify extension:

1. Open the Restify panel in VS Code
2. Create a new request
3. Set method to `POST`
4. Set URL to `http://localhost:3000/api/mixed-content`
5. Switch to the "Body" tab
6. Select "form" as the body type
7. Add form fields with custom content types

### 3. Using cURL Commands

#### Test JSON in Form Field
```bash
curl -X POST http://localhost:3000/api/json-field \
  -F "metadata={\"user_id\": 123, \"status\": \"active\"};type=application/json"
```

#### Test XML in Form Field
```bash
curl -X POST http://localhost:3000/api/xml-field \
  -F "data=<root><item>test</item></root>;type=application/xml"
```

#### Test Mixed Content (Multiple Fields with Different Types)
```bash
curl -X POST http://localhost:3000/api/mixed-content \
  -F "user_info={\"name\": \"John\", \"age\": 30};type=application/json" \
  -F "config=<config><debug>true</debug></config>;type=application/xml" \
  -F "notes=Plain text field;type=text/plain"
```

#### Test File Upload with JSON Metadata
```bash
curl -X POST http://localhost:3000/api/file-upload \
  -F "metadata={\"file_type\": \"document\", \"version\": 1};type=application/json" \
  -F "file=@/path/to/document.pdf"
```

#### Generic Form Data Endpoint
```bash
curl -X POST http://localhost:3000/api/form-data \
  -F "field1=value1" \
  -F "field2={\"key\": \"value\"};type=application/json" \
  -F "field3=<xml>content</xml>;type=application/xml"
```

## API Endpoints

### GET `/`
Returns welcome message with available endpoints.

**Response:**
```json
{
  "message": "Welcome to Restify Test Server",
  "description": "This server is designed to test the form-data datatype detection feature",
  "endpoints": { ... }
}
```

### POST `/api/form-data`
Generic form-data endpoint that accepts any multipart form-data and echoes back the received data with detected content types.

**Response:**
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "message": "Form data received",
  "fields": {
    "fieldName": {
      "value": "field value",
      "type": "text",
      "detected": "application/json"
    }
  },
  "files": [
    {
      "fieldName": "file",
      "originalName": "document.pdf",
      "mimeType": "application/pdf",
      "size": 12345
    }
  ]
}
```

### POST `/api/json-field`
Specifically for testing JSON content in form fields. Attempts to parse JSON fields.

**Example:**
```bash
curl -X POST http://localhost:3000/api/json-field \
  -F "data={\"user_id\": 123};type=application/json"
```

### POST `/api/xml-field`
Specifically for testing XML content in form fields.

**Example:**
```bash
curl -X POST http://localhost:3000/api/xml-field \
  -F "data=<root><user>test</user></root>;type=application/xml"
```

### POST `/api/mixed-content`
Test endpoint for multipart requests with mixed content types in different fields.

**Example:**
```bash
curl -X POST http://localhost:3000/api/mixed-content \
  -F "json_data={\"key\": \"value\"};type=application/json" \
  -F "xml_data=<root>data</root>;type=application/xml" \
  -F "text_data=plain text;type=text/plain" \
  -F "file=@document.pdf"
```

### POST `/api/file-upload`
Test file uploads with accompanying metadata. Supports a `metadata` field with JSON content type alongside file upload.

**Example:**
```bash
curl -X POST http://localhost:3000/api/file-upload \
  -F "metadata={\"file_type\": \"pdf\", \"version\": 1};type=application/json" \
  -F "file=@document.pdf"
```

### GET `/test-form`
Interactive HTML form for manual testing of all features.

## Testing Workflow

### In Restify VS Code Extension

1. **Create a POST request** to `http://localhost:3000/api/mixed-content`

2. **Add form fields** in the Body tab:
   - Click "Body Type" → select "form"
   - Add fields with the "+" button
   
3. **Set content types** for text fields:
   - For field with JSON data:
     - Key: `user_info`
     - Value: `{"name": "John", "age": 30}`
     - Content-Type: `application/json` (should auto-detect)
     - Or click "Auto" to auto-detect
   
   - For field with XML data:
     - Key: `config`
     - Value: `<config><enabled>true</enabled></config>`
     - Content-Type: `application/xml` (should auto-detect)
   
   - For plain text:
     - Key: `notes`
     - Value: `Some plain text`
     - Leave Content-Type empty

4. **Send the request** and verify the response shows correct content types

### Expected Behavior

✅ **Auto-Detection Features:**
- JSON values (starting with `{` or `[`) → `application/json`
- XML values (starting with `<`) → `application/xml`
- Other values → `text/plain`

✅ **cURL Command Generation:**
- Text fields with content types should include `;type=<mime-type>`
- File fields should include `;type=<mime-type>`

✅ **Request Execution:**
- Content-Type headers should be correctly set for each field
- Server should receive and parse the data correctly

## Troubleshooting

### Server won't start
- Check if port 3000 is already in use
- Try a different port by editing `index.js`

### Uploads directory permission issues
- Ensure the `server` directory is writable
- Try creating `uploads` folder manually: `mkdir uploads`

### Content-Type not being detected
- Check that the value starts with the correct character (`{` for JSON, `<` for XML)
- Ensure the value is valid JSON/XML
- Manual Content-Type input is always available

## Clean Up

To remove uploaded files:
```bash
rm -rf server/uploads/*
```

## Next Steps

- Test the Restify VS Code extension's form-data UI
- Verify that content types are correctly applied in generated cURL commands
- Test with different programming language code generators (JavaScript, Python, Java, etc.)
- Test file uploads with custom metadata

## Debugging

Enable verbose output by editing `index.js` to add logging:

```javascript
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  console.log('Body:', req.body);
  console.log('Files:', req.files?.map(f => f.fieldname));
  next();
});
```
