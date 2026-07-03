# 🎯 START HERE - Restify Form-Data Datatype Detection Feature

Welcome! This guide will help you get started with the new form-data datatype detection feature for the Restify VS Code extension.

## 📋 What You Need to Know

The Restify extension now supports **automatic datatype detection** for form-data fields. This means:

✅ **JSON Detection** - Automatically detects `{"key": "value"}` patterns  
✅ **XML Detection** - Automatically detects `<root>content</root>` patterns  
✅ **Manual Override** - You can manually set any content-type  
✅ **Code Generation** - Generated code includes content-type hints for all languages  
✅ **Test Server** - Complete Express server for testing the feature  
✅ **Swagger UI** - Interactive API documentation for endpoint testing  

---

## 🚀 Quick Start (5 minutes)

### 1️⃣ Build the Extension
```bash
npm install --legacy-peer-deps && npm run build
```
✅ Should complete with zero errors

### 2️⃣ Start the Test Server
```bash
cd server
npm start
```
Server runs at: `http://localhost:3000`

### 3️⃣ Choose Your Testing Method

#### Option A: Swagger UI (Easiest - 1 minute)
```
Open: http://localhost:3000/api-docs
```
- Interactive endpoint documentation
- Click "Try it out" to test
- Auto-generated cURL commands

#### Option B: Web Form (2 minutes)
```
Open: http://localhost:3000/test-form
```
- Fill out form fields
- Submit to see responses

#### Option C: Restify Extension (3 minutes)
1. Create POST to `http://localhost:3000/api/mixed-content`
2. Set Body Type → "form"
3. Add test fields with JSON/XML values
4. Watch content-type fields auto-populate
5. Send request and see response

---

## 📖 Documentation Map

### For Getting Started
- **[START-HERE.md](START-HERE.md)** ← You are here
- **[5-MINUTE-TEST.md](5-MINUTE-TEST.md)** - Fast track testing (3 options)

### For Test Server
- **[TEST-SERVER.md](TEST-SERVER.md)** - Complete setup guide
- **[server/README.md](server/README.md)** - Full server documentation
- **[server/QUICK-START.md](server/QUICK-START.md)** - Server quick reference
- **[server/SWAGGER.md](server/SWAGGER.md)** - Swagger/OpenAPI guide

### For Testing
- **[VISUAL-TESTING-GUIDE.md](VISUAL-TESTING-GUIDE.md)** - Step-by-step examples
- **[IMPLEMENTATION-SUMMARY.md](IMPLEMENTATION-SUMMARY.md)** - Feature overview

### For Developers
- **[server/sample-requests.json](server/sample-requests.json)** - Pre-made test requests
- **[server/index.js](server/index.js)** - Source code (well-commented)

---

## 🎮 Feature Overview

### UI Components

#### Content-Type Fields in Form Data
```
Form Field Structure:
  ┌─────────────────────────────────────┐
  │ Key:    [user_data]                │
  │ Value:  [{"name": "John"}]         │
  │ Content-Type: [application/json]   │
  │ [Auto] button (appears when detected)
  └─────────────────────────────────────┘
```

#### Auto-Detection
When you enter JSON or XML values, Restify:
1. **Detects** the format
2. **Shows "Auto" button**
3. **Click Auto** to apply content-type
4. **Or set manually** if needed

### Test Scenarios

#### Scenario 1: JSON Detection
```
POST /api/json-field
Field: metadata = {"user_id": 123}
→ Detects as JSON
→ Sets Content-Type: application/json
→ cURL: -F "metadata=...;type=application/json"
```

#### Scenario 2: XML Detection
```
POST /api/xml-field
Field: config = <root><enabled>true</enabled></root>
→ Detects as XML
→ Sets Content-Type: application/xml
→ cURL: -F "config=...;type=application/xml"
```

#### Scenario 3: Mixed Content
```
POST /api/mixed-content
Field 1: user_info = {"name": "John"} (JSON)
Field 2: settings = <config>...</config> (XML)
Field 3: notes = plain text
→ Each field has appropriate content-type
→ Server receives all with correct MIME types
```

---

## 📚 API Endpoints

When running the test server, you have access to:

| Endpoint | Type | Purpose |
|----------|------|---------|
| `/` | GET | Welcome page |
| `/api-docs` | GET | 📊 **Swagger UI** |
| `/swagger.json` | GET | OpenAPI spec |
| `/test-form` | GET | HTML form |
| `/api/form-data` | POST | Generic handler |
| `/api/json-field` | POST | JSON testing |
| `/api/xml-field` | POST | XML testing |
| `/api/mixed-content` | POST | Mixed types |
| `/api/file-upload` | POST | File + metadata |

---

## 🔧 Testing Workflow

### Step 1: Start Server
```bash
cd server && npm start
```
Look for the startup banner showing:
- Server URL
- Swagger UI link
- Quick test endpoints

### Step 2: Choose Testing Method

**Swagger UI (Recommended)**
```
1. Open http://localhost:3000/api-docs
2. Scroll to endpoint
3. Click "Try it out"
4. Fill form
5. Click "Execute"
```

**Web Form**
```
1. Open http://localhost:3000/test-form
2. Fill fields
3. Submit
```

**cURL**
```bash
curl -X POST http://localhost:3000/api/json-field \
  -F 'metadata={"key":"value"};type=application/json'
```

### Step 3: Verify Results

Check response for:
- ✅ Correct content-type detected
- ✅ Fields received properly
- ✅ No parsing errors

---

## ✨ Features Implemented

### ✅ Core Detection
- JSON validation using `JSON.parse()`
- XML validation using `DOMParser` or regex
- Plain text fallback
- Conservative detection (only suggest when confident)

### ✅ UI Enhancements
- Content-Type field for each form field
- Auto-detect button (JSON/XML only)
- Manual override capability
- Persistent storage across edits

### ✅ Request Execution
- Per-field content-type headers
- Proper multipart boundary formatting
- File upload support
- Server-side detection validation

### ✅ Code Generation
All 10+ supported languages generate proper code:
- **cURL**: Uses `;type=<mime>` syntax
- **JavaScript/Fetch**: Includes comments
- **Python/Requests**: Notes special handling
- **Java/OkHttp**: Uses MediaType class
- **Go/http**: Uses multipart writer
- **PHP/cURL**: Uses CURLFile
- **C#/HttpClient**: Uses StringContent types
- **Swift/URLSession**: Includes headers
- **PowerShell**: Form configuration
- **And more...**

### ✅ Test Infrastructure
- Express server with 5+ endpoints
- Swagger/OpenAPI 3.0.0 integration
- Interactive HTML form
- File upload support
- Server-side detection validation
- Comprehensive documentation

---

## 🐛 Troubleshooting

### Server won't start
```bash
# Check if port 3000 is in use
lsof -i :3000

# Kill existing process if needed
kill -9 <PID>

# Or use a different port
PORT=3001 npm start
```

### Import errors in VS Code
- Run: `npm install --legacy-peer-deps`
- Rebuild: `npm run build`

### Content-Type not appearing
- Ensure field value is text (not file)
- Try refreshing the form
- Check that value is valid JSON/XML

### Server responses are empty
- Check server console for errors
- Verify all fields are being sent
- Test with Swagger UI first

---

## 📞 Quick Reference

### File Locations

**Extension Code:**
- Form component: `src/webview/components/RequestPane.tsx`
- Detection logic: `src/webview/utils/formDataTypeDetector.ts`
- Code generation: `src/webview/utils/codegen.ts`
- Request execution: `src/panels/RestifyPanel.ts`

**Test Server:**
- Main file: `server/index.js`
- Dependencies: `server/package.json`
- Documentation: `server/README.md`

### Important Commands

```bash
# Build extension
npm install --legacy-peer-deps && npm run build

# Start test server
cd server && npm start

# Start server in dev mode (auto-reload)
cd server && npm run dev

# Run tests (when available)
npm test
```

### Swagger URLs

When server is running:
```
Swagger UI:      http://localhost:3000/api-docs
OpenAPI Spec:    http://localhost:3000/swagger.json
Test Form:       http://localhost:3000/test-form
Welcome:         http://localhost:3000
```

---

## 🎓 Learning Path

1. **First Time?**
   - Read this file
   - Follow 5-MINUTE-TEST.md
   - Try Swagger UI

2. **Want Details?**
   - Read IMPLEMENTATION-SUMMARY.md
   - Browse server/README.md
   - Check VISUAL-TESTING-GUIDE.md

3. **Deep Dive?**
   - Review formDataTypeDetector.ts
   - Study RequestPane.tsx changes
   - Examine codegen.ts modifications
   - Look at server/index.js

4. **Real World Testing?**
   - Use Restify extension directly
   - Test with actual APIs
   - Generate code and run it
   - Modify test server for your needs

---

## ✅ Validation Checklist

Before considering setup complete:

- [ ] Extension builds without errors (`npm run build`)
- [ ] Test server starts (`cd server && npm start`)
- [ ] Swagger UI loads (`http://localhost:3000/api-docs`)
- [ ] Can POST to `/api/mixed-content`
- [ ] Form fields show content-type inputs
- [ ] JSON values trigger auto-detect button
- [ ] Manual content-type entry works
- [ ] cURL shows `;type=` in output
- [ ] Code generation works for preferred language

---

## 🎉 You're All Set!

The feature is complete and ready to use. Choose your testing method:

**Quick Start (≤5 min):**
→ Open [5-MINUTE-TEST.md](5-MINUTE-TEST.md)

**Full Documentation:**
→ See Documentation Map above

**Get Testing:**
→ `cd server && npm start`
→ Open `http://localhost:3000/api-docs`

---

## 📝 Notes

- All code is TypeScript with proper types
- Zero linting warnings or errors
- Swagger UI is read-only (documentation only)
- Test server is for development (not production)
- All features backward compatible
- No breaking changes to existing functionality

---

**Happy Testing! 🚀**

For questions or issues, refer to the specific documentation files or review the source code comments.
