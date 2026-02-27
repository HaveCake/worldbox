const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const app = require("../server");
const { extractJSON, normalizeApiUrl } = require("../server");

function request(server, method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, `http://localhost:${server.address().port}`);
    const req = http.request(url, { method, headers: { "Content-Type": "application/json" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe("/evolve endpoint", () => {
  let server;

  before((_, done) => {
    server = app.listen(0, done);
  });

  after((_, done) => {
    server.close(done);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await request(server, "POST", "/evolve", { apiUrl: "http://example.com" });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes("Missing required fields"));
  });

  it("returns 400 when body is empty", async () => {
    const res = await request(server, "POST", "/evolve", {});
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes("Missing required fields"));
  });

  it("returns CORS headers", async () => {
    const res = await request(server, "POST", "/evolve", {});
    assert.equal(res.headers["access-control-allow-origin"], "*");
  });

  it("returns 400 for invalid API URL format", async () => {
    const res = await request(server, "POST", "/evolve", {
      apiUrl: "not-a-valid-url",
      apiKey: "sk-test",
      model: "gpt-4o",
      current_state: { test: 1 },
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.toLowerCase().includes("invalid api url"));
  });

  it("uses env-var defaults when fields are omitted", async () => {
    const originalUrl = process.env.DEFAULT_API_URL;
    const originalKey = process.env.DEFAULT_API_KEY;
    const originalModel = process.env.DEFAULT_MODEL;

    process.env.DEFAULT_API_URL = "http://localhost:1";
    process.env.DEFAULT_API_KEY = "sk-default";
    process.env.DEFAULT_MODEL = "default-model";

    const res = await request(server, "POST", "/evolve", {
      current_state: { "自然生态": { "树木": 10 } },
    });

    if (originalUrl !== undefined) process.env.DEFAULT_API_URL = originalUrl;
    else delete process.env.DEFAULT_API_URL;
    if (originalKey !== undefined) process.env.DEFAULT_API_KEY = originalKey;
    else delete process.env.DEFAULT_API_KEY;
    if (originalModel !== undefined) process.env.DEFAULT_MODEL = originalModel;
    else delete process.env.DEFAULT_MODEL;

    // With env defaults set, it should attempt the LLM call (not 400 Missing fields)
    // It will fail at the network level (connection refused to localhost:1),
    // but that means we got past the missing-fields guard – status will NOT be 400.
    assert.notEqual(res.status, 400);
  });
});

describe("extractJSON", () => {
  it("parses plain JSON", () => {
    const result = extractJSON('{"a":1}');
    assert.deepEqual(result, { a: 1 });
  });

  it("extracts JSON from fenced code block", () => {
    const input = 'Here is the result:\n```json\n{"trees": 100}\n```\nDone.';
    const result = extractJSON(input);
    assert.deepEqual(result, { trees: 100 });
  });

  it("extracts JSON from text with surrounding prose", () => {
    const input = 'The new state is: {"pop": 50, "food": 80} as computed.';
    const result = extractJSON(input);
    assert.deepEqual(result, { pop: 50, food: 80 });
  });

  it("throws on completely invalid input", () => {
    assert.throws(() => extractJSON("no json here"));
  });
});

describe("normalizeApiUrl", () => {
  it("appends /v1/chat/completions to a bare base URL", () => {
    assert.equal(normalizeApiUrl("https://api.openai.com"), "https://api.openai.com/v1/chat/completions");
  });

  it("handles trailing slashes on bare base URL", () => {
    assert.equal(normalizeApiUrl("https://api.openai.com/"), "https://api.openai.com/v1/chat/completions");
  });

  it("appends /chat/completions when URL already ends with /v1", () => {
    assert.equal(normalizeApiUrl("https://api.openai.com/v1"), "https://api.openai.com/v1/chat/completions");
  });

  it("handles trailing slash after /v1", () => {
    assert.equal(normalizeApiUrl("https://api.openai.com/v1/"), "https://api.openai.com/v1/chat/completions");
  });

  it("returns the URL unchanged when it already ends with /v1/chat/completions", () => {
    assert.equal(
      normalizeApiUrl("https://api.openai.com/v1/chat/completions"),
      "https://api.openai.com/v1/chat/completions"
    );
  });

  it("throws for non-URL strings", () => {
    assert.throws(() => normalizeApiUrl("not-a-url"), /Invalid API URL/);
  });

  it("throws for empty string", () => {
    assert.throws(() => normalizeApiUrl(""), /Invalid API URL/);
  });
});
