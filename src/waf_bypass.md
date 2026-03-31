# WAF Bypass Heuristics

When a 403 Forbidden or 406 Not Acceptable is encountered during fuzzing or exploitation, attempt the following bypass techniques:

### 1. Payload Encoding
- **Double URL Encoding**: Encode special characters twice (e.g., `<` -> `%3c` -> `%253c`).
- **Null Byte Injection**: Insert `%00` before or after sensitive keywords.
- **Unicode / UTF-8 Variations**: Use alternative character representations that the application might normalize.

### 2. Protocol Manipulation
- **Chunked Transfer Encoding**: Split payloads across multiple HTTP chunks to evade signature matching in the body.
- **HTTP Parameter Pollution (HPP)**: Provide multiple values for the same parameter (e.g., `?id=1&id=union+select`).

### 3. Header Spoofing
Many WAFs trust specific source headers. Attempt to override perceived IP addresses:
- `X-Forwarded-For: 127.0.0.1`
- `X-Originating-IP: 127.0.0.1`
- `X-Remote-IP: 127.0.0.1`
- `X-Client-IP: 127.0.0.1`

### 4. Semantic Bypass
- Use SQL comments (`/**/`) to break up keywords: `SEL/**/ECT`.
- Replace spaces with alternative whitespace: `+`, `%0a`, `%0d`, `%09`.