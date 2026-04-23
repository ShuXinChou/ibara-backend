import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

if (!DEEPSEEK_API_KEY) {
  console.error("Missing DEEPSEEK_API_KEY in .env");
  process.exit(1);
}

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "ibara-backend" });
});

function normalizeArabic(text = "") {
  return text
    .toLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isTooSimilar(a, b) {
  const aa = normalizeArabic(a);
  const bb = normalizeArabic(b);

  if (!aa || !bb) return false;
  if (aa === bb) return true;
  if (aa.includes(bb) || bb.includes(aa)) return true;

  const aWords = new Set(aa.split(" ").filter(Boolean));
  const bWords = new Set(bb.split(" ").filter(Boolean));
  const common = [...aWords].filter((w) => bWords.has(w)).length;
  const maxCount = Math.max(aWords.size, bWords.size, 1);

  return common / maxCount >= 0.75;
}

function uniqueQuotes(quotes = [], inputText = "") {
  const result = [];

  for (const q of quotes) {
    const text = typeof q?.text === "string" ? q.text.trim() : "";
    if (!text) continue;
    if (isTooSimilar(text, inputText)) continue;
    if (result.some((item) => isTooSimilar(item.text, text))) continue;
    result.push(q);
  }

  return result.slice(0, 3);
}

function buildFallbackQuotes(inputText, preferredStyle) {
  const style = preferredStyle || "literary";

  const options = {
    literary: [
      "أخفي ما أشعر به كأن الصمت أكثر لياقة من الاعتراف.",
      "يمرّ الحنين بي هادئًا، كأنه يعرف أن الكلام لن يغيّر شيئًا.",
      "أبدو ثابتًا، بينما في الداخل شيء لا يتوقف عن الالتفات."
    ],
    restrained: [
      "ألتزم الصمت، ليس لأنني بخير، بل لأنني لا أريد شرح ما في داخلي.",
      "أحاول أن أبدو عاديًا، رغم أن بعض الأشياء لا تمرّ بخفة.",
      "لا أقول الكثير، لكن هذا لا يعني أنني لا أشعر."
    ],
    spiritual: [
      "أترك بعض ما في قلبي لله، ففي الصمت أحيانًا رحمة لا نراها.",
      "ليس كل ما يؤلم يُقال، وبعض الصبر عبادة لا يلاحظها أحد.",
      "أتعلم أن أخفف قلبي بالدعاء حين يعجز الكلام عن مواساته."
    ]
  };

  return (options[style] || options.literary).map((text) => ({
    text,
    style
  }));
}

async function callDeepSeek({ inputText, preferredStyle, hardMode = false }) {
  const styleGuide = {
    literary: "Elegant, subtle, emotionally honest, refined Arabic.",
    restrained: "Quiet, concise, restrained, understated Arabic.",
    spiritual: "Soft, reflective, serene Arabic, without preaching."
  };

  const selectedStyleGuide =
    styleGuide[preferredStyle] ||
    "Elegant modern Arabic with emotional nuance.";

  const systemPrompt = hardMode
    ? `
Write exactly 3 short Arabic quotes.

ABSOLUTE RULES:
- Do NOT repeat the user's wording.
- Do NOT paraphrase the user's sentence closely.
- Do NOT copy any keyword combination from the input.
- Each quote must sound like an original status line.
- Each quote must be different from the others.
- Indirect expression only.
- Natural modern Arabic only.
- No clichés, no advice, no preaching, no emojis, no hashtags.

Style:
${selectedStyleGuide}

Return ONLY valid JSON:
{
  "quotes": [
    { "text": "..." },
    { "text": "..." },
    { "text": "..." }
  ]
}
`.trim()
    : `
Write exactly 3 short Arabic quotes.

Rules:
- Do not repeat the user's sentence.
- Express the feeling indirectly.
- Keep each quote short and shareable.
- Use natural modern Arabic.
- Avoid clichés, advice, preaching, emojis, hashtags.

Style:
${selectedStyleGuide}

Return ONLY valid JSON:
{
  "quotes": [
    { "text": "..." },
    { "text": "..." },
    { "text": "..." }
  ]
}
`.trim();

  const userPrompt = hardMode
    ? `
Feeling:
${inputText}

Important:
- no repetition
- no close paraphrase
- 3 different lines
- write like a real person hiding emotion
`.trim()
    : `
Feeling:
${inputText}
`.trim();

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      temperature: hardMode ? 1.2 : 1.0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      stream: false
    })
  });

  const rawText = await response.text();
  console.log("DeepSeek status:", response.status);
  console.log("DeepSeek raw response:", rawText);

  if (!response.ok) {
    throw new Error(`DeepSeek request failed: ${rawText}`);
  }

  const data = JSON.parse(rawText);
  const rawContent = data?.choices?.[0]?.message?.content?.trim?.() ?? "";
  if (!rawContent) {
    throw new Error("Model returned empty content");
  }

  const parsed = JSON.parse(rawContent);
  const quotes = Array.isArray(parsed?.quotes) ? parsed.quotes : [];

  return quotes.map((item) => ({
    text: typeof item?.text === "string" ? item.text.trim() : "",
    style: preferredStyle
  }));
}

app.post("/generate-quote", async (req, res) => {
  try {
    const { inputText, preferredStyle } = req.body ?? {};

    console.log("Incoming request:", {
      inputText,
      preferredStyle,
      model: DEEPSEEK_MODEL
    });

    if (!inputText || typeof inputText !== "string") {
      return res.status(400).json({ error: "inputText is required" });
    }

    if (!preferredStyle || typeof preferredStyle !== "string") {
      return res.status(400).json({ error: "preferredStyle is required" });
    }

    const trimmedInput = inputText.trim();
    if (!trimmedInput) {
      return res.status(400).json({ error: "inputText cannot be empty" });
    }

    // 第一次正常生成
    let quotes = await callDeepSeek({
      inputText: trimmedInput,
      preferredStyle,
      hardMode: false
    });

    let normalized = uniqueQuotes(quotes, trimmedInput);

    // 如果结果无效，第二次强约束重试
    if (normalized.length < 3) {
      console.log("Retrying with hardMode...");
      quotes = await callDeepSeek({
        inputText: trimmedInput,
        preferredStyle,
        hardMode: true
      });
      normalized = uniqueQuotes(quotes, trimmedInput);
    }

    // 如果还不行，直接本地兜底
    if (normalized.length < 3) {
      console.log("Using fallback quotes...");
      normalized = buildFallbackQuotes(trimmedInput, preferredStyle);
    }

    return res.json({ quotes: normalized.slice(0, 3) });
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      error: "Internal server error",
      detail: error?.message ?? String(error)
    });
  }
});

app.listen(PORT, () => {
  console.log(`Ibara backend running on http://localhost:${PORT}`);
});