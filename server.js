import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;

// 阿里 DashScope
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const DASHSCOPE_MODEL = process.env.DASHSCOPE_MODEL || "qwen-plus";

if (!DASHSCOPE_API_KEY) {
  console.error("Missing DASHSCOPE_API_KEY");
  process.exit(1);
}

// 健康检查
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "ibara-backend" });
});

// 调用阿里模型
async function callModel({ inputText, preferredStyle }) {
  const systemPrompt = `
Write exactly 3 short Arabic quotes.

Rules:
- Do not repeat the user's sentence
- Express the feeling indirectly
- Keep each quote short and shareable
- Use natural modern Arabic
- No emojis, no hashtags

Return ONLY JSON:
{
  "quotes": [
    { "text": "..." },
    { "text": "..." },
    { "text": "..." }
  ]
}
`.trim();

  const response = await fetch(
    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DASHSCOPE_API_KEY}`
      },
      body: JSON.stringify({
        model: DASHSCOPE_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Feeling: ${inputText}` }
        ],
        temperature: 1
      })
    }
  );

  const text = await response.text();
  console.log("DashScope:", text);

  if (!response.ok) {
    throw new Error(text);
  }

  try {
    const data = JSON.parse(text);
    const content = data?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);

    return parsed.quotes || [];
  } catch (e) {
    console.error("Parse error:", e);
    return [];
  }
}

// API
app.post("/generate-quote", async (req, res) => {
  try {
    const { inputText, preferredStyle } = req.body;

    if (!inputText || !preferredStyle) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    let quotes = await callModel({ inputText, preferredStyle });

    // fallback（防止模型挂掉）
    if (!quotes || quotes.length === 0) {
      quotes = [
        { text: "أخفي ما أشعر به بهدوء." },
        { text: "الصمت أحيانًا أصدق من الكلام." },
        { text: "في داخلي شيء لا أقوله." }
      ];
    }

    return res.json({ quotes: quotes.slice(0, 3) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});