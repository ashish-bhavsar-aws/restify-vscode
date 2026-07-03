# ⚡ 5-Minute Test Guide

## Start (1 min)

```bash
cd server
npm start
```

You should see:
```
🚀 Restify Test Server is running
Server: http://localhost:3000
Test Form: http://localhost:3000/test-form
```

---

## Test Option A: Web Form (2 min)

1. Open browser: `http://localhost:3000/test-form`
2. Fill form:
   ```
   Endpoint: Generic Form Data
   Field 1: 
     Key: metadata
     Value: {"user_id": 123}
     Type: JSON (or click Auto)
   ```
3. Click "Send Test Request"
4. See response with content-type detected ✅

---

## Test Option C: Swagger UI (1 min)

1. Open browser: `http://localhost:3000/api-docs`
2. Click on endpoint (e.g., POST /api/json-field)
3. Click "Try it out"
4. Enter test data:
   ```
   metadata: {"user_id": 123}
   ```
5. Click "Execute"
6. See response and copy cURL command ✅

---

1. **Create Request**
   - Method: POST
   - URL: `http://localhost:3000/api/mixed-content`

2. **Add Form Fields**
   - Body Type → "form"
   - Click "+ Add Field"

3. **Add First Field (JSON)**
   ```
   Key: user_info
   Value: {"name": "John", "age": 30}
   Type: Text (T)
   ```
   → Notice: "Auto" button appears!
   → Click "Auto" to set content-type

4. **Add Second Field (XML)**
   ```
   Key: config
   Value: <settings><debug>true</debug></settings>
   Type: Text (T)
   ```
   → Notice: "Auto" button appears!
   → Click "Auto" to set content-type

5. **Send Request**
   - Click Send
   - Check response shows both fields

---

## Quick Verification

✅ **Auto-Detection Works**
- Paste JSON/XML → "Auto" button appears
- Click it → Content-Type filled in

✅ **cURL Shows Content-Type**
- Look at generated cURL command
- See: `-F "field=value;type=application/json"`

✅ **Server Receives It**
- Response shows: `"contentType": "application/json"`

---

## Test Data Templates

### JSON Field
```json
{"user_id": 123, "status": "active"}
```

### XML Field
```xml
<?xml version="1.0"?>
<config>
  <enabled>true</enabled>
  <version>1.0</version>
</config>
```

### Mixed Request
```
Field 1: {"data": "value"}        → Type: application/json
Field 2: <root>content</root>     → Type: application/xml
Field 3: plain text               → Type: (empty)
```

---

## Expected Results

### ✅ Success
- Content-Type field appears for text fields
- Auto button shows for JSON/XML values
- cURL includes `;type=application/json`
- Server response confirms content-type

### ❌ If Not Working
1. Check server is running: `curl http://localhost:3000`
2. Reload VS Code: Cmd/Ctrl + R
3. Check build: `npm run build` (should show no errors)
4. Check console: F12 → Console tab

---

## Stop Server

Press `Ctrl+C` in terminal

---

## Full Documentation

- **IMPLEMENTATION-SUMMARY.md** - Complete overview
- **TEST-SERVER.md** - Detailed setup guide
- **VISUAL-TESTING-GUIDE.md** - Screenshots and examples
- **server/README.md** - API documentation
- **server/QUICK-START.md** - Detailed testing guide

---

## One-Liner Tests

```bash
# JSON test
curl -F 'data={"id":1};type=application/json' http://localhost:3000/api/form-data

# XML test
curl -F 'data=<root>test</root>;type=application/xml' http://localhost:3000/api/form-data

# Mixed test
curl -F 'json={"x":1};type=application/json' \
     -F 'xml=<r>v</r>;type=application/xml' \
     http://localhost:3000/api/mixed-content
```

---

That's it! You now have a complete test environment ready. 🎉
