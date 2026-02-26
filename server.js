const path = require("path");
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const SYSTEM_PROMPT = `你是一个"世界规则推演引擎"。你的职责是根据当前世界状态和可能的神谕（玩家指令），推演出下一个时间步的世界状态。

规则：
1. 你会收到一个 JSON 对象，表示当前世界状态（例如 {"树木": 125, "环境": 100, "人口": 50}）。
2. 如果玩家的神谕（user_prompt）为空，你需要推演自然时间流逝带来的变化：资源自然增减、人口自然增长或衰减、环境自然恢复或恶化等。
3. 如果玩家的神谕（user_prompt）不为空，你需要优先结算神谕带来的影响，然后再叠加自然演变。
4. 你可以修改现有属性的值，也可以根据推演逻辑大胆创造新的属性（例如新增 "病人": 20、"科技等级": 1 等）。
5. 所有数值变化应当合理，符合因果逻辑。

强制约束：
- 你必须且只能输出一个合法的 JSON 对象，表示推演后的新世界状态。
- 不要输出任何解释、注释或多余文字，只输出纯 JSON。`;

app.post("/evolve", async (req, res) => {
  const { apiUrl, apiKey, model, current_state, user_prompt } = req.body;

  if (!apiUrl || !apiKey || !model || !current_state) {
    return res.status(400).json({ error: "Missing required fields: apiUrl, apiKey, model, current_state" });
  }

  const userMessage =
    (user_prompt ? `神谕：${user_prompt}\n` : "") +
    `当前世界状态：\n${JSON.stringify(current_state, null, 2)}`;

  const payload = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
  };

  const endpoint = apiUrl.replace(/\/+$/, "") + "/v1/chat/completions";

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
      newState = JSON.parse(content);
    } catch {
      return res.status(502).json({ error: "LLM returned invalid JSON", raw: content });
    }
    return res.json(newState);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
