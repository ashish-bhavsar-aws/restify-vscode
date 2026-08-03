const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');
const zlib = require('zlib');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
const PORT = 3000;

// Swagger/OpenAPI Configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Restify Test Server API',
      version: '1.0.0',
      description: 'Test server for Restify VS Code extension - supports multipart form-data with custom content types',
      contact: {
        name: 'Restify Team',
      },
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development server',
      },
    ],
    components: {
      schemas: {
        FormDataResponse: {
          type: 'object',
          properties: {
            timestamp: { type: 'string', format: 'date-time' },
            message: { type: 'string' },
            fields: { type: 'object' },
            files: { type: 'array' },
          },
        },
        JsonFieldResponse: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            fields: { type: 'object' },
            parsed: { type: 'object' },
          },
        },
        MixedContentResponse: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            fields: { type: 'object' },
            files: { type: 'array' },
            summary: {
              type: 'object',
              properties: {
                totalFields: { type: 'number' },
                totalFiles: { type: 'number' },
              },
            },
          },
        },
      },
    },
  },
  apis: ['./index.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Middleware — parse JSON, XML, and text bodies
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';

  // Try JSON first
  if (contentType.includes('application/json')) {
    express.json()(req, res, (err) => {
      if (err) { req.body = undefined; }
      next();
    });
  }
  // XML bodies (application/xml or text/xml)
  else if (contentType.includes('application/xml') || contentType.includes('text/xml')) {
    express.raw({ type: ['application/xml', 'text/xml'] })(req, res, (err) => {
      if (err) { req.body = undefined; }
      else if (Buffer.isBuffer(req.body)) { req.body = req.body.toString('utf8'); }
      next();
    });
  }
  // Text bodies (text/plain)
  else if (contentType.includes('text/plain')) {
    express.text({ type: 'text/plain' })(req, res, (err) => {
      if (err) { req.body = undefined; }
      next();
    });
  }
  // URL-encoded or fallback
  else {
    express.json()(req, res, (err) => {
      if (err) { req.body = undefined; }
      next();
    });
  }
});
app.use(express.static('public'));

// Swagger UI
app.use('/api-docs', swaggerUi.serve);
app.get('/api-docs', swaggerUi.setup(swaggerSpec, {
  swaggerOptions: {
    url: '/swagger.json',
  },
}));

// Swagger JSON endpoint
app.get('/swagger.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

/**
 * @swagger
 * /:
 *   get:
 *     summary: Welcome endpoint
 *     description: Returns information about the API and available endpoints
 *     tags:
 *       - General
 *     responses:
 *       200:
 *         description: Welcome message with endpoint information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 description:
 *                   type: string
 *                 endpoints:
 *                   type: object
 */
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Restify Test Server',
    description: 'This server is designed to test the form-data datatype detection feature',
    endpoints: {
      'POST /api/form-data': 'Handle multipart form-data with custom content types',
      'POST /api/json-field': 'Test form field with JSON content type',
      'POST /api/xml-field': 'Test form field with XML content type',
      'POST /api/mixed-content': 'Test form with mixed content types',
      'POST /api/file-upload': 'Test file upload with metadata',
      'GET /test-form': 'HTML form for manual testing',
      'GET /api-docs': 'Swagger UI documentation',
    },
  });
});

/**
 * @swagger
 * /api/form-data:
 *   post:
 *     summary: Generic form-data endpoint
 *     description: Accepts multipart form-data and echoes back with content type information
 *     tags:
 *       - Form Data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               metadata:
 *                 type: string
 *                 description: Form field with custom content type (e.g., JSON)
 *               config:
 *                 type: string
 *                 description: Another form field
 *     responses:
 *       200:
 *         description: Form data received successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FormDataResponse'
 */
app.post('/api/form-data', upload.any(), (req, res) => {
  const result = {
    timestamp: new Date().toISOString(),
    message: 'Form data received',
    fields: {},
    files: [],
  };

  // Process text fields
  if (req.body) {
    Object.entries(req.body).forEach(([key, value]) => {
      result.fields[key] = {
        value,
        type: 'text',
        detected: detectContentType(value),
      };
    });
  }

  // Process files
  if (req.files) {
    req.files.forEach((file) => {
      result.files.push({
        fieldName: file.fieldname,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        path: file.path,
      });
    });
  }

  res.json(result);
});

/**
 * @swagger
 * /api/json-field:
 *   post:
 *     summary: Test JSON content type in form field
 *     description: Send a form field with JSON data and application/json content type
 *     tags:
 *       - Form Data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               metadata:
 *                 type: string
 *                 example: '{"user_id": 123, "status": "active"}'
 *                 description: JSON content with application/json type
 *     responses:
 *       200:
 *         description: JSON field received and parsed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JsonFieldResponse'
 */
app.post('/api/json-field', upload.any(), (req, res) => {
  const result = {
    message: 'JSON field received',
    fields: req.body || {},
    parsed: {},
  };

  // Try to parse JSON fields
  Object.entries(req.body || {}).forEach(([key, value]) => {
    try {
      result.parsed[key] = JSON.parse(value);
    } catch (e) {
      result.parsed[key] = `Failed to parse as JSON: ${e.message}`;
    }
  });

  res.json(result);
});

/**
 * @swagger
 * /api/xml-field:
 *   post:
 *     summary: Test XML content type in form field
 *     description: Send a form field with XML data and application/xml content type
 *     tags:
 *       - Form Data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               config:
 *                 type: string
 *                 example: '<?xml version="1.0"?><config><enabled>true</enabled></config>'
 *                 description: XML content with application/xml type
 *     responses:
 *       200:
 *         description: XML field received
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 fields:
 *                   type: object
 */
app.post('/api/xml-field', upload.any(), (req, res) => {
  const result = {
    message: 'XML field received',
    fields: req.body || {},
    rawXml: {},
  };

  Object.entries(req.body || {}).forEach(([key, value]) => {
    result.rawXml[key] = value;
  });

  res.json(result);
});

/**
 * @swagger
 * /api/mixed-content:
 *   post:
 *     summary: Test mixed content types
 *     description: Send multiple form fields with different content types in a single request
 *     tags:
 *       - Form Data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               user_info:
 *                 type: string
 *                 example: '{"name": "John", "age": 30}'
 *               config:
 *                 type: string
 *                 example: '<config><enabled>true</enabled></config>'
 *               notes:
 *                 type: string
 *                 example: 'Plain text field'
 *     responses:
 *       200:
 *         description: Mixed content received successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MixedContentResponse'
 */
app.post('/api/mixed-content', upload.any(), (req, res) => {
  const result = {
    message: 'Mixed content received',
    fields: {},
    summary: {
      totalFields: Object.keys(req.body || {}).length,
      totalFiles: (req.files || []).length,
    },
  };

  Object.entries(req.body || {}).forEach(([key, value]) => {
    result.fields[key] = {
      value: value.substring(0, 100) + (value.length > 100 ? '...' : ''),
      size: value.length,
      contentType: detectContentType(value),
    };
  });

  if (req.files) {
    result.files = req.files.map((f) => ({
      name: f.originalname,
      type: f.mimetype,
      size: f.size,
    }));
  }

  res.json(result);
});

/**
 * @swagger
 * /api/file-upload:
 *   post:
 *     summary: Test file upload with metadata
 *     description: Upload a file along with JSON metadata field
 *     tags:
 *       - File Upload
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               metadata:
 *                 type: string
 *                 example: '{"file_type": "pdf", "version": 1}'
 *                 description: JSON metadata with application/json type
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: File to upload
 *     responses:
 *       200:
 *         description: File uploaded successfully with metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 metadata:
 *                   type: object
 *                 file:
 *                   type: object
 */
app.post('/api/file-upload', upload.any(), (req, res) => {
  const result = {
    message: 'File upload with metadata received',
    metadata: null,
    file: null,
  };

  // Parse metadata field if present
  if (req.body && req.body.metadata) {
    try {
      result.metadata = JSON.parse(req.body.metadata);
    } catch (e) {
      result.metadata = req.body.metadata;
    }
  }

  // Get file info
  if (req.files && req.files.length > 0) {
    const file = req.files[0];
    result.file = {
      fieldName: file.fieldname,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      path: file.path,
    };
  }

  res.json(result);
});

/**
 * @swagger
 * /test-form:
 *   get:
 *     summary: Interactive test form
 *     description: HTML form for manual testing of all endpoints
 *     tags:
 *       - Testing
 *     responses:
 *       200:
 *         description: HTML form for testing
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */
app.get('/test-form', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Restify Test Form</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 900px;
            margin: 50px auto;
            background: #f5f5f5;
            padding: 20px;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        h1 { color: #333; }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
            color: #555;
        }
        input[type="text"],
        textarea,
        input[type="file"],
        select {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
            font-size: 14px;
        }
        textarea {
            resize: vertical;
            min-height: 100px;
            font-family: monospace;
        }
        button {
            background: #007acc;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
        }
        button:hover {
            background: #005a9e;
        }
        .info {
            background: #e8f4f8;
            border-left: 4px solid #007acc;
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 4px;
        }
        .response {
            background: #f0f0f0;
            padding: 15px;
            margin-top: 20px;
            border-radius: 4px;
            max-height: 400px;
            overflow-y: auto;
            display: none;
        }
        .response.show {
            display: block;
        }
        pre {
            margin: 0;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🧪 Restify Test Form</h1>
        
        <div class="info">
            <strong>Test Form-Data with Custom Content Types</strong><br>
            Use this form to test the datatype detection feature in Restify.
            Each field can have a custom content type (JSON, XML, plain text, etc.).
        </div>

        <form id="testForm">
            <div class="form-group">
                <label for="endpoint">API Endpoint:</label>
                <select id="endpoint" name="endpoint">
                    <option value="/api/form-data">Generic Form Data</option>
                    <option value="/api/json-field">JSON Field</option>
                    <option value="/api/xml-field">XML Field</option>
                    <option value="/api/mixed-content">Mixed Content</option>
                    <option value="/api/file-upload">File Upload with Metadata</option>
                </select>
            </div>

            <div class="form-group">
                <label for="field1Key">Field 1 Key:</label>
                <input type="text" id="field1Key" name="field1Key" value="data" placeholder="e.g., 'data'">
            </div>

            <div class="form-group">
                <label for="field1Value">Field 1 Value:</label>
                <textarea id="field1Value" name="field1Value" placeholder='{"user_id": 123, "status": "active"}'></textarea>
            </div>

            <div class="form-group">
                <label for="field1Type">Field 1 Content Type:</label>
                <select id="field1Type" name="field1Type">
                    <option value="">Plain Text</option>
                    <option value="application/json">JSON (application/json)</option>
                    <option value="application/xml">XML (application/xml)</option>
                    <option value="text/plain">Text (text/plain)</option>
                    <option value="text/csv">CSV (text/csv)</option>
                </select>
            </div>

            <div class="form-group">
                <label for="field2Key">Field 2 Key (optional):</label>
                <input type="text" id="field2Key" name="field2Key" placeholder="e.g., 'metadata'">
            </div>

            <div class="form-group">
                <label for="field2Value">Field 2 Value (optional):</label>
                <textarea id="field2Value" name="field2Value" placeholder='<?xml version="1.0"?><root>...</root>'></textarea>
            </div>

            <div class="form-group">
                <label for="field2Type">Field 2 Content Type:</label>
                <select id="field2Type" name="field2Type">
                    <option value="">Plain Text</option>
                    <option value="application/json">JSON (application/json)</option>
                    <option value="application/xml">XML (application/xml)</option>
                    <option value="text/plain">Text (text/plain)</option>
                    <option value="text/csv">CSV (text/csv)</option>
                </select>
            </div>

            <div class="form-group">
                <label for="file">File (optional):</label>
                <input type="file" id="file" name="file">
            </div>

            <button type="submit">Send Test Request</button>
        </form>

        <div id="response" class="response">
            <h3>Response:</h3>
            <pre id="responseContent"></pre>
        </div>
    </div>

    <script>
        document.getElementById('testForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const endpoint = document.getElementById('endpoint').value;
            const formData = new FormData();
            
            // Add first field
            const field1Key = document.getElementById('field1Key').value || 'field1';
            const field1Value = document.getElementById('field1Value').value;
            if (field1Value) {
                formData.append(field1Key, field1Value);
            }
            
            // Add second field if present
            const field2Key = document.getElementById('field2Key').value;
            const field2Value = document.getElementById('field2Value').value;
            if (field2Key && field2Value) {
                formData.append(field2Key, field2Value);
            }
            
            // Add file if selected
            const file = document.getElementById('file').files[0];
            if (file) {
                formData.append('file', file);
            }
            
            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    body: formData
                });
                
                const data = await response.json();
                document.getElementById('responseContent').textContent = JSON.stringify(data, null, 2);
                document.getElementById('response').classList.add('show');
            } catch (error) {
                document.getElementById('responseContent').textContent = 'Error: ' + error.message;
                document.getElementById('response').classList.add('show');
            }
        });
    </script>
</body>
</html>
  `);
});

/**
 * Helper function to detect content type of a value
 */
function detectContentType(value) {
  if (!value || typeof value !== 'string') return 'unknown';

  const trimmed = value.trim();

  // Check for JSON
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && isValidJSON(trimmed)) {
    return 'application/json';
  }

  // Check for XML
  if (trimmed.startsWith('<') && trimmed.includes('</')) {
    return 'application/xml';
  }

  return 'text/plain';
}

function isValidJSON(str) {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

// ─── Echo / Utility Endpoints for Feature Tests ────────────────────

/**
 * @swagger
 * /api/echo:
 *   all:
 *     summary: Echo endpoint for all HTTP methods
 *     description: Returns method, query params, body, and headers
 *     tags:
 *       - Echo
 *     responses:
 *       200:
 *         description: Echoed request details
 */
app.all('/api/echo', (req, res) => {
  res.json({
    method: req.method,
    query: req.query,
    body: req.body,
    headers: req.headers,
  });
});

/**
 * @swagger
 * /api/status/{code}:
 *   get:
 *     summary: Return a specific HTTP status code
 *     tags:
 *       - Echo
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Requested status code
 */
app.get('/api/status/:code', (req, res) => {
  const code = parseInt(req.params.code, 10);
  if (Number.isNaN(code) || code < 100 || code > 599) {
    return res.status(400).json({ error: 'Invalid status code' });
  }
  res.status(code).json({ status: code });
});

/**
 * @swagger
 * /api/auth/verify:
 *   get:
 *     summary: Verify auth headers are present
 *     tags:
 *       - Echo
 *     responses:
 *       200:
 *         description: Auth header values
 */
app.get('/api/auth/verify', (req, res) => {
  res.json({
    authorization: req.headers.authorization || null,
    'x-api-key': req.headers['x-api-key'] || null,
    query: req.query,
  });
});
app.post('/api/auth/verify', (req, res) => {
  res.json({
    authorization: req.headers.authorization || null,
    'x-api-key': req.headers['x-api-key'] || null,
    query: req.query,
    body: req.body,
  });
});

/**
 * @swagger
 * /api/csv:
 *   get:
 *     summary: Returns CSV content
 *     tags:
 *       - Echo
 *     responses:
 *       200:
 *         description: CSV data
 */
app.get('/api/csv', (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.send('Name,Age,City\nJohn,30,NYC\nJane,25,LA\nBob,35,Chicago');
});

/**
 * @swagger
 * /api/text:
 *   get:
 *     summary: Returns plain text content
 *     tags:
 *       - Echo
 *     responses:
 *       200:
 *         description: Plain text
 */
app.get('/api/text', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send('Hello, this is a plain text response from the mock server.');
});

/**
 * @swagger
 * /api/xml-response:
 *   get:
 *     summary: Returns XML content
 *     tags:
 *       - Echo
 *     responses:
 *       200:
 *         description: XML data
 */
app.get('/api/xml-response', (req, res) => {
  res.setHeader('Content-Type', 'application/xml');
  res.send('<?xml version="1.0" encoding="UTF-8"?><root><message>Hello</message><status>ok</status></root>');
});

/**
 * @swagger
 * /api/json-response:
 *   get:
 *     summary: Returns nested JSON content
 *     tags:
 *       - Echo
 *     responses:
 *       200:
 *         description: JSON data
 */
app.get('/api/json-response', (req, res) => {
  res.json({
    users: [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' },
    ],
    total: 2,
    page: 1,
  });
});

/**
 * @swagger
 * /api/redirect:
 *   get:
 *     summary: Respond with a 302 redirect to /api/redirect-target
 *     tags:
 *       - Feature Tests
 *     responses:
 *       302:
 *         description: Redirect response
 */
app.get('/api/redirect', (req, res) => {
  res.redirect(302, '/api/redirect-target');
});

/**
 * @swagger
 * /api/redirect-target:
 *   get:
 *     summary: Final destination after a redirect
 *     tags:
 *       - Feature Tests
 *     responses:
 *       200:
 *         description: Redirect target reached
 */
app.get('/api/redirect-target', (req, res) => {
  res.json({
    redirected: true,
    from: '/api/redirect',
    cookieHeader: req.headers.cookie || null,
  });
});

/**
 * @swagger
 * /api/gzip:
 *   get:
 *     summary: Return a gzip-compressed JSON body
 *     tags:
 *       - Feature Tests
 *     responses:
 *       200:
 *         description: Gzipped JSON body
 */
app.get('/api/gzip', (req, res) => {
  const payload = JSON.stringify({
    compressed: true,
    message: 'This response body was gzip-compressed on the wire.',
    items: Array.from({ length: 5 }, (_, i) => ({ id: i + 1, label: `item-${i + 1}` })),
  });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Encoding', 'gzip');
  res.send(zlib.gzipSync(payload));
});

/**
 * @swagger
 * /api/cookie/set:
 *   get:
 *     summary: Set a cookie and echo it back
 *     parameters:
 *       - in: query
 *         name: name
 *         schema: { type: string, default: session }
 *       - in: query
 *         name: value
 *         schema: { type: string, default: abc123 }
 *     tags:
 *       - Feature Tests
 *     responses:
 *       200:
 *         description: Cookie set
 */
app.get('/api/cookie/set', (req, res) => {
  const name = req.query.name || 'session';
  const value = req.query.value || 'abc123';
  res.setHeader('Set-Cookie', `${name}=${value}; Path=/`);
  res.json({ set: true, cookie: `${name}=${value}` });
});

/**
 * @swagger
 * /api/cookie/check:
 *   get:
 *     summary: Echo the cookie header received
 *     tags:
 *       - Feature Tests
 *     responses:
 *       200:
 *         description: Received cookies
 */
app.get('/api/cookie/check', (req, res) => {
  res.json({ cookie: req.headers.cookie || null });
});

/**
 * @swagger
 * /api/slow:
 *   get:
 *     summary: Delay the response so tests can exercise cancellation/timeouts
 *     parameters:
 *       - in: query
 *         name: ms
 *         schema: { type: integer, default: 8000 }
 *     tags:
 *       - Feature Tests
 *     responses:
 *       200:
 *         description: Delayed response
 */
app.get('/api/slow', (req, res) => {
  const ms = Math.min(parseInt(req.query.ms, 10) || 8000, 30000);
  setTimeout(() => {
    res.json({ slow: true, waited: ms });
  }, ms);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║       🚀 Restify Test Server is running                    ║
║                                                            ║
║       Server: http://localhost:${PORT}                         ║
║       API Docs: http://localhost:${PORT}/api-docs              ║
║       Test Form: http://localhost:${PORT}/test-form            ║
║                                                            ║
║       Quick Test Endpoints:                                ║
║       • POST http://localhost:${PORT}/api/form-data          ║
║       • POST http://localhost:${PORT}/api/json-field         ║
║       • POST http://localhost:${PORT}/api/xml-field          ║
║       • POST http://localhost:${PORT}/api/mixed-content      ║
║       • POST http://localhost:${PORT}/api/file-upload        ║
║                                                            ║
║       📖 Swagger UI: http://localhost:${PORT}/api-docs       ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});

// Self-signed HTTPS listener for SSL-verification feature tests.
const certPath = path.join(__dirname, 'certs', 'cert.pem');
const keyPath = path.join(__dirname, 'certs', 'key.pem');
if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const HTTPS_PORT = 3443;
  https
    .createServer(
      {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      },
      app,
    )
    .listen(HTTPS_PORT, () => {
      console.log(`HTTPS test server: https://localhost:${HTTPS_PORT} (self-signed)`);
    });
} else {
  console.log('HTTPS test server skipped (certs/ not found)');
}
