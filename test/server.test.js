const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const app = require("../server");
const { extractJSON, normalizeApiUrl, coerceNumber, safeNumber, sanitizeState, summarizeWarnings, getCreativityPreset, describeOracleStrength, buildCustomPrompt } = require("../server");

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

describe("coerceNumber", () => {
  it("keeps finite numbers", () => {
    assert.equal(coerceNumber(42), 42);
  });

  it("rejects NaN and Infinity", () => {
    assert.equal(coerceNumber(NaN), undefined);
    assert.equal(coerceNumber(Infinity), undefined);
    assert.equal(coerceNumber(-Infinity), undefined);
  });

  it("parses numeric strings, tolerating commas and spaces", () => {
    assert.equal(coerceNumber("25"), 25);
    assert.equal(coerceNumber(" 42 "), 42);
    assert.equal(coerceNumber("1,000"), 1000);
  });

  it("returns undefined for non-numeric strings", () => {
    assert.equal(coerceNumber("一百"), undefined);
    assert.equal(coerceNumber("abc"), undefined);
    assert.equal(coerceNumber(""), undefined);
  });

  it("maps booleans to 1/0", () => {
    assert.equal(coerceNumber(true), 1);
    assert.equal(coerceNumber(false), 0);
  });

  it("returns undefined for objects/arrays", () => {
    assert.equal(coerceNumber({}), undefined);
    assert.equal(coerceNumber([1, 2]), undefined);
    assert.equal(coerceNumber(null), undefined);
  });
});

describe("safeNumber", () => {
  it("coerces and clamps within [0, 1000000]", () => {
    assert.equal(safeNumber("250"), 250);
    assert.equal(safeNumber(-5), 0);
    assert.equal(safeNumber(2_000_000), 1000000);
  });

  it("falls back to previous value when current value is invalid", () => {
    assert.equal(safeNumber("abc", 77), 77);
    assert.equal(safeNumber(null, 12), 12);
  });

  it("defaults to 0 when nothing is retrievable", () => {
    assert.equal(safeNumber("abc"), 0);
    assert.equal(safeNumber(undefined, undefined), 0);
  });
});

describe("sanitizeState", () => {
  it("returns a safe default for non-object root", () => {
    const r = sanitizeState("bad", {});
    assert.equal(typeof r, "object");
    assert.ok(!Array.isArray(r));
  });

  it("re-wraps invalid root to previous state when available", () => {
    const prev = { "自然生态": { "树木": 10 } };
    const r = sanitizeState(null, prev);
    assert.deepEqual(r, { "自然生态": { "树木": 10 } });
  });

  it("converts string numbers, clamps negatives, and zeroes junk", () => {
    const r = sanitizeState(
      { "自然生态": { "树木": "125", "负值": -3, "乱码": "abc", "空": null, "数组": [1, 2] } },
      {}
    );
    assert.equal(r["自然生态"]["树木"], 125);
    assert.equal(r["自然生态"]["负值"], 0);
    assert.equal(r["自然生态"]["乱码"], 0);
    assert.equal(r["自然生态"]["空"], 0);
    assert.equal(r["自然生态"]["数组"], 0);
  });

  it("guarantees only finite numbers survive (no NaN/Infinity/array/null)", () => {
    const r = sanitizeState(
      { "社会": { "a": NaN, "b": Infinity, "c": true, "d": [9] } },
      {}
    );
    for (const val of Object.values(r["社会"])) {
      assert.equal(typeof val, "number");
      assert.ok(Number.isFinite(val));
    }
    assert.equal(r["社会"]["c"], 1);
  });

  it("inherits previous values for stability when a new value is invalid", () => {
    const r = sanitizeState(
      { "自然生态": { "树木": "abc" } },
      { "自然生态": { "树木": 88 } }
    );
    assert.equal(r["自然生态"]["树木"], 88);
  });

  it("handles flat (non-nested) input by wrapping into a category", () => {
    const r = sanitizeState({ "人口": 52, "食物": "80" }, {});
    assert.deepEqual(r, { "世界状态": { "人口": 52, "食物": 80 } });
  });

  it("drops invalid flat values to 0", () => {
    const r = sanitizeState({ "天气": "晴朗" }, {});
    assert.deepEqual(r, { "世界状态": { "天气": 0 } });
  });

  it("wraps a scalar category under a numeric value when state is nested", () => {
    // Mixed shape: one nested category plus one scalar category.
    const r = sanitizeState({ "生态": { "树木": 5 }, "天气": "晴朗" }, {});
    assert.equal(r["生态"]["树木"], 5);
    assert.deepEqual(r["天气"], { "数值": 0 });
  });
});

describe("summarizeWarnings", () => {
  it("flags non-object root", () => {
    const w = summarizeWarnings("bad", {});
    assert.ok(w.length > 0);
  });

  it("flags non-numeric string attributes", () => {
    const w = summarizeWarnings({ "生态": { "树木": "很多" } }, {});
    assert.ok(w.some(s => s.includes("树木")));
  });

  it("flags boolean attributes", () => {
    const w = summarizeWarnings({ "生态": { "稳定": true } }, {});
    assert.ok(w.some(s => s.includes("布尔")));
  });

  it("flags array attributes", () => {
    const w = summarizeWarnings({ "生态": { "列表": [1] } }, {});
    assert.ok(w.some(s => s.includes("数组")));
  });

  it("returns empty for clean numeric state", () => {
    const w = summarizeWarnings({ "生态": { "树木": 125 } }, {});
    assert.deepEqual(w, []);
  });
});

describe("getCreativityPreset", () => {
  it("returns the preset for a known key", () => {
    const p = getCreativityPreset("fantasy");
    assert.equal(p.label, "奇幻");
    assert.equal(p.temperature, 1.3);
    assert.ok(p.persona.includes("创世神"));
  });

  it("returns the balanced preset for an unknown key (default)", () => {
    const p = getCreativityPreset("no-such-preset");
    assert.equal(p.label, "均衡");
    assert.equal(p.temperature, 1.0);
  });

  it("returns the balanced preset when key is missing/legacy", () => {
    assert.equal(getCreativityPreset(undefined).label, "均衡");
    assert.equal(getCreativityPreset("").label, "均衡");
  });

  it("exposes all four presets with monotonically increasing temps", () => {
    const order = ["realistic", "balanced", "fantasy", "chaotic"].map(k => getCreativityPreset(k).temperature);
    assert.deepEqual(order, [0.7, 1.0, 1.3, 1.7]);
  });

  it("every preset persona includes the shared structural emphasis", () => {
    for (const k of ["realistic", "balanced", "fantasy", "chaotic"]) {
      const p = getCreativityPreset(k);
      assert.ok(p.persona.includes("user_prompt"), "persona mentions user_prompt: " + k);
    }
  });
});

describe("describeOracleStrength", () => {
  it("clamps out-of-range values into [0, 100]", () => {
    assert.equal(describeOracleStrength(-5).value, 0);
    assert.equal(describeOracleStrength(150).value, 100);
  });

  it("falls back to 50 (普通) for invalid input", () => {
    assert.equal(describeOracleStrength(undefined).value, 50);
    assert.equal(describeOracleStrength("abc").value, 50);
    assert.equal(describeOracleStrength(null).level, "普通");
  });

  it("maps the four tiers correctly", () => {
    assert.equal(describeOracleStrength(0).level, "微弱");
    assert.equal(describeOracleStrength(25).level, "微弱");
    assert.equal(describeOracleStrength(26).level, "普通");
    assert.equal(describeOracleStrength(50).level, "普通");
    assert.equal(describeOracleStrength(51).level, "强烈");
    assert.equal(describeOracleStrength(75).level, "强烈");
    assert.equal(describeOracleStrength(76).level, "颠覆");
    assert.equal(describeOracleStrength(100).level, "颠覆");
  });

  it("rounds fractional values", () => {
    assert.equal(describeOracleStrength(49.6).value, 50);
  });

  it("every tier carries a non-empty description", () => {
    for (const v of [0, 30, 60, 90]) {
      assert.ok(describeOracleStrength(v).desc.length > 0);
    }
  });
});

describe("buildCustomPrompt", () => {
  it("includes the user-provided world style prompt", () => {
    assert.ok(buildCustomPrompt("蒸汽朋克世界，机械与魔法并存").includes("蒸汽朋克世界"));
  });

  it("uses a fallback driving line when the prompt is empty/undefined", () => {
    assert.ok(buildCustomPrompt("").includes("玩家未填写"));
    assert.ok(buildCustomPrompt(undefined).includes("玩家未填写"));
    assert.ok(buildCustomPrompt(null).includes("玩家未填写"));
  });

  it("keeps the output-format contract OUT of the custom prompt (separation)", () => {
    // The user's custom world prompt must NOT carry the strict format rules,
    // which live only in SHARED_CONSTRAINTS as a separate system message.
    const cp = buildCustomPrompt("我的世界规则");
    assert.ok(cp.includes("我的世界规则"));
    assert.ok(cp.includes("输出规范"), "reminds the model the format contract follows next");
    assert.ok(!cp.includes("禁止在任何位置使用数组"), "format rules are not merged in");
    assert.ok(!cp.includes("顶层必须是一个 JSON 对象"), "format rules are not merged in");
  });

  it("returns a plain string suitable for a system message", () => {
    assert.equal(typeof buildCustomPrompt("规则"), "string");
    assert.ok(buildCustomPrompt("规则").length > 20);
  });
});
