# Restify — API Client for VS Code

**Restify** is a powerful, lightweight, and professional REST API client built directly into VS Code. Stop switching between your editor and external tools—test your APIs exactly where you write your code.

---

## 🚀 Key Features

* **Multi-Tab Support**: Work on multiple requests simultaneously. Open an Auth request in one tab and your functional API in another side-by-side.
* **Intelligent Variables**: Use `{{variable}}` syntax in URLs, Headers, and Bodies.
* **Live Variable Validation**: 
    * 🔵 **Blue**: Variable is correctly resolved from your active environment.
    * 🔴 **Red**: Variable is missing or misspelled.
* **Hover Tooltips**: Hover over any `{{variable}}` in the URL bar to see its real-time resolved value.
* **Advanced Security (mTLS)**: Support for client certificates (`.crt`, `.key`, `.ca`) to connect to secure enterprise APIs.
* **Proxy Integration**: Full support for HTTP/HTTPS proxies with authentication and "No Proxy" bypass lists.
* **Theme Aware**: Automatically matches your VS Code theme (Dark, Light, High Contrast).

---

## 🛠️ How to Use

### 1. Opening the Client
Click the **Restify** icon in your Activity Bar. The main request panel will open automatically.

### 2. Managing Environments
* Click the **"No Environment"** dropdown in the top bar to select a context.
* Variables defined in your environment will automatically be available as `{{key}}`.
* Hover your mouse over a variable in the URL bar to verify its value.

### 3. Organizing with Collections
* Execute a request and click the **💾 Save** button.
* Create new collections or add to existing ones to organize your workflow.

### 4. Working with Multiple Tabs
* Click the **`+`** (Plus) icon in the **History** sidebar title bar to open a fresh, empty request tab.
* Clicking an item from History or Collections will reveal its existing tab or open a new one if it's not already open.

---

## ⚙️ Advanced Settings

Restify is highly configurable via `settings.json`.

### mTLS Certificate Mapping
```json
"restify.certificates": {
    "api.secure-internal.com": {
        "certPath": "C:/certs/client.crt",
        "keyPath": "C:/certs/client.key",
        "caPath": "C:/certs/ca.crt"
    }
}