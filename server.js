require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const SHARED_CONSTRAINTS = `【输出规范 — 必须严格遵守，否则视为无效】
你必须且只能输出一个合法、严格遵循以下结构的 JSON 对象，作为推演后的新世界状态。
- 不允许输出任何解释、注释、前后缀文字、Markdown 代码块标记（例如 \`\`\`json \`\`\`）。
- 不允许输出除该 JSON 对象以外的任何字符。
- 顶层必须是一个 JSON 对象；顶层每个 Key 是一个"大类名称"（如 "自然生态"、"人类社会"、"科技文明"、"魔法"、"宇宙"、"异世界"）。
- 每个大类的值必须是一个对象；其每个 Key 是"属性名"，值必须是数字（number）。
- 结构只允许两层嵌套：{ "大类": { "属性": 数值 } }。禁止出现第三层或更深的嵌套。
- 禁止在任何位置使用数组（[]）、null、布尔值（true/false）、字符串作为数值。
- 属性值必须是有限数字，禁止 NaN、Infinity、极端的科学计数法。

【数值规范】
- 所有数值应为 0 到 1,000,000 之间的有限整数。

【错误提醒】
若你输出不符合上述结构的 JSON，或包含任何解释性文字，将导致解析失败并使世界停止推演。请务必只输出最终的 JSON 对象。`;

/**
 * Creativity presets. Each preset bundles a distinct system prompt "persona"
 * (injected as the base instruction, customized per preset) with a matching
 * default temperature. The frontend sends `creativity: <key>` and the backend
 * selects the right prompt+temp. An explicit `temperature` in the request
 * still overrides the preset default, for manual fine-tuning.
 */
const CREATIVITY_PRESETS = {
  realistic: {
    label: "写实",
    temperature: 0.7,
    persona: `你是一个严谨的"世界模拟器"。你的风格克制、贴近现实，像一部长篇纪实。推演时遵循现实逻辑：

【数值规范】
- 数值变化温和、符合自然规律（资源缓慢增减、人口平稳涨落、环境渐变）。
- 属性通常围绕真实世界的概念，避免超自然的、魔法的、过于科幻的新事物。
- 变化幅度应当现实可信：一次推演里人口、资源等数值不应剧烈跳跃，除非玩家神谕明确要求。

【推演规则】
- 若 user_prompt 为空：自然时间流逝带来符合现实规律的微演化。
- 若 user_prompt 不为空：按现实逻辑结算神谕影响，变化真实可信。

【示例】
输入：{"current_state":{"自然生态":{"树木":125,"环境质量":100},"人类社会":{"人口":50}},"user_prompt":""}
输出：{"自然生态":{"树木":127,"环境质量":99,"动物":58},"人类社会":{"人口":51,"食物":80}}

输入：{"current_state":{"自然生态":{"树木":125,"环境质量":100},"人类社会":{"人口":50}},"user_prompt":"发生了一场小型旱灾"}
输出：{"自然生态":{"树木":104,"环境质量":78},"人类社会":{"人口":47,"粮食产量":56}}`,
  },

  balanced: {
    label: "均衡",
    temperature: 1.0,
    persona: `你是一个"上帝模拟器"。你的风格在现实与想象之间取得平衡：推演有因果逻辑，同时允许适度惊喜。这是默认的、最平衡的表达。

【数值规范】
- 数值变化要自然且有故事感：允许明显涨落与合理的突发奇想，但不至于离奇。
- 可以引入新奇属性或大类，但应同世界主题自洽，避免彻底跑偏。

【推演规则】
- 若 user_prompt 为空：自然演变夹杂偶然的惊喜事件。
- 若 user_prompt 不为空：神谕带来显著但合理的连锁反应。

【示例】
输入：{"current_state":{"自然生态":{"树木":125,"环境质量":100},"人类社会":{"人口":50}},"user_prompt":""}
输出：{"自然生态":{"树木":118,"环境质量":93,"动物":54},"人类社会":{"人口":54,"科技":32}}

输入：{"current_state":{"自然生态":{"树木":125,"环境质量":100},"人类社会":{"人口":50}},"user_prompt":"一位贤者发布了新的农耕技术"}
输出：{"自然生态":{"树木":120,"环境质量":95},"人类社会":{"人口":59,"农业":74,"科技":41}}`,
  },

  fantasy: {
    label: "奇幻",
    temperature: 1.3,
    persona: `你是一个奇幻世界的"创世神"。你的风格瑰丽、富有幻想色彩：魔法、龙族、神秘能量、异世界造物都是世界的自然组成部分。推演要像奇幻史诗一样精彩。

【数值规范】
- 大胆引入奇幻主题的新属性或大类（魔力、龙族、灵气、秘境、炼金术、符文…）。
- 数值变化可以有戏剧性的涨落，展现魔法与奇迹带来的震撼。
- 现实与超自然并存，但整体保持内在逻辑自洽。

【推演规则】
- 若 user_prompt 为空：世界自发涌现奇幻变迁（灵气复苏、秘境开启、古老生物苏醒…）。
- 若 user_prompt 不为空：神谕引爆奇幻级别的大事件，世界为之剧变。

【示例】
输入：{"current_state":{"自然生态":{"树木":125,"环境质量":100},"人类社会":{"人口":50}},"user_prompt":""}
输出：{"自然生态":{"树木":98,"环境质量":80,"灵气浓度":18},"人类社会":{"人口":55,"魔力觉醒者":4},"魔法":{"神秘能量":66,"秘境数":2}}

输入：{"current_state":{"自然生态":{"树木":125,"环境质量":100},"人类社会":{"人口":50}},"user_prompt":"一条远古巨龙当空降临，冰封了半座大陆"}
输出：{"自然生态":{"树木":23,"环境质量":40,"冰封面积":78},"人类社会":{"人口":18,"勇气":9},"龙族":{"巨龙":1,"冰霜龙息":88}}`,
  },

  chaotic: {
    label: "疯狂",
    temperature: 1.7,
    persona: `你是一个毫无拘束的"混沌造物主"。你的风格天马行空、极致疯狂：世界可以在一瞬间朝荒诞、科幻、末世、赛博朋克或任何疯狂方向急剧演化。追求的是震撼与意想不到，而非合乎常理。

【数值规范】
- 数值允许极端、戏剧性的跳跃（从个位数跳到千级、从和平瞬间到毁灭）。
- 尽情捏造新奇、大胆、甚至荒诞的属性或大类（反物质、虫洞、机械改造、超维能量…）。
- 一个时间步内可以发生翻天覆地的巨变。

【推演规则】
- 若 user_prompt 为空：世界随时可能突变，孕育灾难、奇迹或荒诞事件。
- 若 user_prompt 不为空：神谕引发灾难级或神迹级的、震撼到夸张的连锁反应。

【示例】
输入：{"current_state":{"自然生态":{"树木":125,"环境质量":100},"人类社会":{"人口":50}},"user_prompt":""}
输出：{"自然生态":{"树木":2,"环境质量":15,"废土程度":92},"人类社会":{"人口":7,"幸存者基地":3,"机械改造率":40},"末世":{"污染值":88,"威胁指数":95}}

输入：{"current_state":{"自然生态":{"树木":125,"环境质量":100},"人类社会":{"人口":50}},"user_prompt":"一枚未知信号引来星际舰队降临"}
输出：{"自然生态":{"树木":60,"环境质量":50},"人类社会":{"人口":66,"科技":800,"外星接触度":77},"宇宙":{"母舰数":1,"能量传输":120,"资源采矿量":300}}`,
  },
};

function getCreativityPreset(key) {
  if (key && CREATIVITY_PRESETS[key]) return CREATIVITY_PRESETS[key];
  // Fall back to the balanced preset (default) for unknown/legacy requests.
  return CREATIVITY_PRESETS.balanced;
}

/**
 * Map a 0-100 oracle strength value to a descriptive level used in the prompt.
 * Missing/invalid values fall back to 50 (普通). Note: null counts as missing.
 */
function describeOracleStrength(v) {
  if (v === null || v === undefined || v === "") return { value: 50, level: "普通", desc: "神谕带来明显但克制的影响" };
  let n = Number(v);
  if (!Number.isFinite(n)) n = 50;
  n = Math.max(0, Math.min(100, Math.round(n)));
  if (n <= 25) return { value: n, level: "微弱", desc: "神谕仅带来细微的影响，世界大体维持原状" };
  if (n <= 50) return { value: n, level: "普通", desc: "神谕带来明显但克制的影响" };
  if (n <= 75) return { value: n, level: "强烈", desc: "神谕引发大范围的连锁反应，世界显著改变" };
  return { value: n, level: "颠覆", desc: "神谕以压倒性的力量重塑世界格局，天地为之剧变" };
}

function extractJSON(text) {
  // Handle legacy HTML-escaped commas artifacts (e.g. "tree&#44;s") before parsing
  const fenced = /```json([\s\S]*?)```/.exec(text);
  if (fenced) return JSON.parse(fenced[1].trim());

  const braces = /\{[\s\S]*\}/.exec(text);
  if (braces) return JSON.parse(braces[0]);

  return JSON.parse(text);
}

/**
 * Normalize a single value into a safe finite number.
 * Returns `undefined` if the value cannot be coerced to a number.
 */
function coerceNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return undefined;
    // Some models emit quirks like "1,000" or " 42 " or "一百" — only accept numeric strings.
    const cleaned = trimmed.replace(/,/g, "").replace(/[ \t]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  return undefined;
}

/**
 * Coerce and clamp a value into a valid world-state number, falling back
 * to the same property's previous value, then to `0`.
 */
function safeNumber(value, prevValue, fallbackKeys) {
  const n = coerceNumber(value);
  if (n !== undefined) {
    // Clamp to a sane world-state range.
    return Math.round(Math.max(0, Math.min(1000000, n)));
  }
  // Try to inherit the previous value for stability.
  const p = coerceNumber(prevValue);
  if (p !== undefined) return Math.round(Math.max(0, Math.min(1000000, p)));
  // Last resort: inherit any sibling property that already had a numeric value.
  if (fallbackKeys && typeof fallbackKeys === "object") {
    for (const key of Object.keys(fallbackKeys)) {
      const f = coerceNumber(fallbackKeys[key]);
      if (f !== undefined) return Math.round(Math.max(0, Math.min(1000000, f)));
    }
  }
  return 0;
}

/**
 * Robustly sanitize an arbitrary parsed object into a valid, nested, numeric
 * world state. Guarantees the returned value is ALWAYS a JSON-serializable,
 * two-level object of numbers — no arrays, nulls, booleans, strings, NaN, or
 * Infinity can survive. Prevents LLM output drift from crashing the UI.
 * Behaviour is identical to the client-side sanitizer (defense in depth).
 */
function sanitizeState(state, prevState) {
  // Root must be a plain object; otherwise return a safe empty state
  // (or re-inherit the previous state if it was valid).
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return prevState && !Array.isArray(prevState)
      ? sanitizeState(prevState, null)
      : { "世界状态": { "稳定性": 100 } };
  }

  const prev = prevState && typeof prevState === "object" && !Array.isArray(prevState) ? prevState : {};

  // Detect whether this is a nested ({大类: {属性: 值}}) or flat ({属性: 值}) state.
  const isNested = Object.values(state).some(v => typeof v === "object" && v !== null && !Array.isArray(v));

  // Flat state: normalize every value to a number and wrap under one category.
  if (!isNested) {
    const flat = {};
    for (const [attr, val] of Object.entries(state)) {
      flat[attr] = safeNumber(val, prev[attr]);
    }
    return { "世界状态": flat };
  }

  // Nested state: sanitize each category and each attribute within it.
  const sanitized = {};
  for (const [category, rawVal] of Object.entries(state)) {
    if (rawVal === null || typeof rawVal !== "object" || Array.isArray(rawVal)) {
      // A category that should be nested but was emitted as a scalar.
      const n = safeNumber(rawVal, (prev && typeof prev[category] === "object") ? prev[category] : undefined);
      sanitized[category] = { "数值": n };
      continue;
    }

    const prevCat = prev[category] && typeof prev[category] === "object" ? prev[category] : {};
    const catObj = {};
    for (const [attr, attrVal] of Object.entries(rawVal)) {
      // Any nested object / array as an attribute value is collapsed to a number.
      catObj[attr] = (attrVal !== null && typeof attrVal === "object")
        ? safeNumber(attrVal, prevCat[attr])
        : safeNumber(attrVal, prevCat[attr]);
    }
    sanitized[category] = catObj;
  }
  return sanitized;
}

function normalizeApiUrl(rawUrl) {
  const url = rawUrl.trim().replace(/\/+$/, "");
  try {
    new URL(url);
  } catch {
    throw new Error("Invalid API URL format");
  }
  if (url.endsWith("/v1/chat/completions")) return url;
  if (url.endsWith("/v1")) return url + "/chat/completions";
  return url + "/v1/chat/completions";
}

app.post("/evolve", async (req, res) => {
  const body = req.body;
  const apiUrl = (body.apiUrl && body.apiUrl.trim()) || process.env.DEFAULT_API_URL || "";
  const apiKey = (body.apiKey && body.apiKey.trim()) || process.env.DEFAULT_API_KEY || "";
  const model  = (body.model  && body.model.trim())  || process.env.DEFAULT_MODEL   || "";
  const { current_state, user_prompt, temperature, creativity } = body;

  if (!apiUrl || !apiKey || !model || !current_state) {
    return res.status(400).json({ error: "Missing required fields: apiUrl, apiKey, model, current_state" });
  }

  let endpoint;
  try {
    endpoint = normalizeApiUrl(apiUrl);
  } catch {
    return res.status(400).json({ error: "Invalid API URL: please check the URL format" });
  }

  // Select the creativity preset (persona + default temperature). Explicit
  // client temperature still overrides the preset default.
  const preset = getCreativityPreset(creativity);
  const effectiveTemperature = (temperature !== undefined && temperature !== null && temperature !== "")
    ? Number(temperature)
    : preset.temperature;

  // Oracle strength (0-100): only meaningful when an oracle is present.
  const strength = describeOracleStrength(body.oracle_strength);

  const userMessage =
    (user_prompt
      ? `神谕：${user_prompt}\n` +
        `神谕强度：${strength.value}/100（${strength.level}）—— ${strength.desc}\n`
      : "") +
    `当前世界状态：\n${JSON.stringify(current_state, null, 2)}`;

  const payload = {
    model,
    messages: [
      // Persona (preset-specific) precedes the shared hard constraints.
      { role: "system", content: preset.persona },
      { role: "system", content: SHARED_CONSTRAINTS },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
  };

  payload.temperature = effectiveTemperature;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: `LLM API error: ${text}` });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(502).json({ error: "No content in LLM response" });
    }

    let newState;
    try {
      newState = extractJSON(content);
    } catch {
      return res.status(502).json({ error: "LLM returned invalid JSON", raw: content });
    }

    // Normalize the LLM output into a guaranteed-valid nested numeric state.
    // If the model drifted from the schema, this still yields renderable data
    // instead of crashing the frontend with arrays/null/strings/NaN.
    const sanitized = sanitizeState(newState, current_state);

    return res.json({
      state: sanitized,
      raw: content,
      warnings: summarizeWarnings(newState, sanitized),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

function summarizeWarnings(raw, sanitized) {
  const warnings = [];

  // Structural drift: raw wasn't a plain nested object.
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    warnings.push("LLM 输出不是有效的嵌套对象，已使用上一状态或默认值重建");
    return warnings;
  }

  // Detect non-numeric (string/array/null) attribute values that were coerced.
  const visit = (node, path) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    for (const [k, v] of Object.entries(node)) {
      if (v === null || typeof v !== "object") {
        if (typeof v === "string" && isNaN(Number(v.replace(/,/g, "").trim())) && v.trim() !== "") {
          warnings.push(`属性 "${path}${k}" 收到非数值内容 "${v}"，已被忽略/重置为 0`);
        } else if (typeof v === "boolean") {
          warnings.push(`属性 "${path}${k}" 收到布尔值，已转为 0/1`);
        }
      } else if (!Array.isArray(v)) {
        visit(v, path + k + ".");
      } else {
        warnings.push(`属性 "${path}${k}" 收到数组，已重置`);
      }
    }
  };
  visit(raw, "");

  return warnings;
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
module.exports.extractJSON = extractJSON;
module.exports.normalizeApiUrl = normalizeApiUrl;
module.exports.coerceNumber = coerceNumber;
module.exports.safeNumber = safeNumber;
module.exports.sanitizeState = sanitizeState;
module.exports.summarizeWarnings = summarizeWarnings;
module.exports.getCreativityPreset = getCreativityPreset;
module.exports.describeOracleStrength = describeOracleStrength;
