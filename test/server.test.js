const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const app = require("../server");

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
});
