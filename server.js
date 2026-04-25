import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "8mb" }));

const PORT = process.env.PORT || 3000;
const APP_NAME = "عبارة | كلمات تشبهك";
const SUPPORT_EMAIL = "support@ibara.app";

// 阿里 DashScope
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const DASHSCOPE_MODEL = process.env.DASHSCOPE_MODEL || "qwen-plus";
const DASHSCOPE_VISION_MODEL =
  process.env.DASHSCOPE_VISION_MODEL || "qwen-vl-plus";
const DASHSCOPE_T2I_MODEL =
  process.env.DASHSCOPE_T2I_MODEL || "wan2.6-t2i";

if (!DASHSCOPE_API_KEY) {
  console.error("Missing DASHSCOPE_API_KEY");
  process.exit(1);
}

// 健康检查
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "ibara-backend" });
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sendLegalPage(res, { title, body }) {
  const html = `<!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        margin: 0;
        background: #0b1116;
        color: #f3f4f6;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.7;
      }
      main {
        max-width: 780px;
        margin: 0 auto;
        padding: 48px 20px 72px;
      }
      .card {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 24px;
        padding: 24px;
      }
      h1, h2 { margin: 0 0 12px; }
      h1 { font-size: 30px; }
      h2 { font-size: 18px; margin-top: 28px; }
      p, li { color: #d1d5db; }
      a { color: #f5c26b; }
      .meta { color: #9ca3af; font-size: 14px; margin-bottom: 24px; }
      .rtl { direction: rtl; text-align: right; }
    </style>
  </head>
  <body>
    <main>
      <div class="card">
        ${body}
      </div>
    </main>
  </body>
</html>`;

  res.type("html").send(html);
}

app.get("/privacy-policy", (req, res) => {
  sendLegalPage(res, {
    title: `${APP_NAME} Privacy Policy`,
    body: `
      <h1>Privacy Policy</h1>
      <p class="meta">Effective date: April 25, 2026</p>
      <p>${escapeHtml(APP_NAME)} helps users create Arabic quotes, captions, and poster text. We collect only the information needed to operate and improve the service.</p>
      <h2>What we process</h2>
      <ul>
        <li>Text that you enter to generate quotes or poster copy.</li>
        <li>Images that you choose to upload for caption suggestions.</li>
        <li>Basic technical information needed to keep the service secure and working.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To return quote and caption suggestions inside the app.</li>
        <li>To diagnose service failures and improve reliability.</li>
        <li>To prevent abuse and protect the service.</li>
      </ul>
      <h2>Sharing</h2>
      <p>We do not sell personal data. Data may be processed by service providers strictly for app functionality, hosting, analytics, payment handling, and support.</p>
      <h2>Subscriptions</h2>
      <p>Subscriptions are billed by Apple through your Apple ID account. We do not store full payment card information.</p>
      <h2>Contact</h2>
      <p><a href="mailto:${escapeHtml(SUPPORT_EMAIL)}">${escapeHtml(SUPPORT_EMAIL)}</a></p>
      <hr />
      <div class="rtl">
        <h2>سياسة الخصوصية</h2>
        <p>يعالج التطبيق النصوص والصور التي يضيفها المستخدم فقط من أجل إنشاء النتائج وتحسين استقرار الخدمة. لا نقوم ببيع بيانات المستخدمين.</p>
        <p>للتواصل: <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}">${escapeHtml(SUPPORT_EMAIL)}</a></p>
      </div>
    `
  });
});

app.get("/terms-of-use", (req, res) => {
  sendLegalPage(res, {
    title: `${APP_NAME} Terms of Use`,
    body: `
      <h1>Terms of Use</h1>
      <p class="meta">Effective date: April 25, 2026</p>
      <p>By using ${escapeHtml(APP_NAME)}, you agree to these terms.</p>
      <h2>Service</h2>
      <p>The app provides tools for generating Arabic quotes, captions, and poster-ready text. Results are provided for personal and lawful use only.</p>
      <h2>Subscriptions</h2>
      <ul>
        <li>Auto-renewable subscriptions unlock premium features.</li>
        <li>Payment is charged to your Apple ID account at confirmation of purchase.</li>
        <li>Subscriptions renew automatically unless canceled at least 24 hours before the end of the current period.</li>
        <li>You can manage or cancel subscriptions in your Apple ID account settings.</li>
      </ul>
      <h2>Acceptable use</h2>
      <p>You agree not to misuse the service, submit unlawful content, or attempt to disrupt the app or backend.</p>
      <h2>Contact</h2>
      <p><a href="mailto:${escapeHtml(SUPPORT_EMAIL)}">${escapeHtml(SUPPORT_EMAIL)}</a></p>
      <hr />
      <div class="rtl">
        <h2>شروط الاستخدام</h2>
        <p>باستخدام التطبيق، فإنك توافق على الشروط المنظمة للخدمة والاشتراكات المتجددة تلقائيًا وإدارة الاشتراك من إعدادات Apple ID.</p>
        <p>للتواصل: <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}">${escapeHtml(SUPPORT_EMAIL)}</a></p>
      </div>
    `
  });
});

async function callDashScope({ model, messages, temperature = 0.9 }) {
  const response = await fetch(
    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DASHSCOPE_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature
      })
    }
  );

  const text = await response.text();
  console.log("DashScope:", text);

  if (!response.ok) {
    throw new Error(text);
  }

  const data = JSON.parse(text);
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => part?.text || part?.content || "")
      .filter(Boolean)
      .join("\n");
  }

  throw new Error("No response content returned from DashScope");
}

function extractJSONObject(text) {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1] || text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in model output");
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

function normalizeQuoteRows(rows, preferredStyle) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => {
      if (typeof row === "string") {
        return { text: row.trim(), style: preferredStyle };
      }

      return {
        text: String(row?.text || "").trim(),
        style: row?.style || preferredStyle
      };
    })
    .filter((row) => row.text.length > 0);
}

function fallbackQuotes(preferredStyle) {
  switch (preferredStyle) {
    case "restrained":
      return [
        { text: "أبقي الكلام قليلًا، وأترك الشعور واضحًا.", style: preferredStyle },
        { text: "صورة هادئة... ومعنى يكفي.", style: preferredStyle },
        { text: "ليس كل ما يلمع يحتاج إلى شرح.", style: preferredStyle }
      ];
    case "spiritual":
      return [
        { text: "في المشهد سكينة، وفي القلب اتساع.", style: preferredStyle },
        { text: "ما كُتب للقلب يصل إليه بلطف.", style: preferredStyle },
        { text: "يترك الضوء أثره... ويترك الهدوء معناه.", style: preferredStyle }
      ];
    default:
      return [
        { text: "في بعض اللقطات، يكفي الصمت ليقول كل شيء.", style: "literary" },
        { text: "ما لا يقال أحيانًا... يظهر في الضوء.", style: "literary" },
        { text: "بين الظلّ والهدوء، تولد العبارة وحدها.", style: "literary" }
      ];
  }
}

function fallbackPosterQuote(inputText, theme) {
  const trimmed = String(inputText || "").trim();

  if (trimmed) {
    switch (theme) {
      case "night":
        return `يأتي ${trimmed} هادئًا، كأنه نور متأخر.`;
      case "geometry":
        return `حتى ${trimmed} يترك شكلًا واضحًا في القلب.`;
      default:
        return `في ${trimmed} مساحة تكفي للهدوء.`;
    }
  }

  switch (theme) {
    case "night":
      return "في الليل الهادئ، يظهر ما نخفيه بلطف.";
    case "geometry":
      return "لكل شعور شكل، وبعضه يكتمل في الصمت.";
    default:
      return "أخف ما في الشعور... يبقى الأوضح.";
  }
}

function imageStylePreset(style) {
  switch (style) {
    case "cinematic":
      return "cinematic still, dramatic lighting, deep contrast, premium composition, rich details, no text in image";
    case "illustrated":
      return "high-end digital illustration, painterly details, expressive colors, polished composition, no text in image";
    default:
      return "dreamy fine-art photography, soft natural light, elegant atmosphere, realistic details, no text in image";
  }
}

function buildTextToImagePrompt(inputText, style) {
  const cleanedInput = String(inputText || "").trim();
  const stylePreset = imageStylePreset(style);

  return [
    cleanedInput,
    "",
    `Style guide: ${stylePreset}.`,
    "Please generate a single high-quality image based on the user's description.",
    "Avoid any visible words, letters, logos, watermarks, borders, or UI elements."
  ].join("\n");
}

async function generateTextToImage({ inputText, style, size }) {
  const prompt = buildTextToImagePrompt(inputText, style);

  const response = await fetch(
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DASHSCOPE_API_KEY}`
      },
      body: JSON.stringify({
        model: DASHSCOPE_T2I_MODEL,
        input: {
          messages: [
            {
              role: "user",
              content: [{ text: prompt }]
            }
          ]
        },
        parameters: {
          prompt_extend: true,
          watermark: false,
          n: 1,
          size,
          negative_prompt:
            "text, letters, logo, watermark, blurry details, low quality, distorted hands, duplicated body parts, malformed face, frame, collage, split panels"
        }
      })
    }
  );

  const raw = await response.text();
  console.log("TextToImage:", raw);

  if (!response.ok) {
    throw new Error(raw);
  }

  const data = JSON.parse(raw);
  const content = data?.output?.choices?.[0]?.message?.content;
  const imagePart = Array.isArray(content)
    ? content.find((item) => item?.type === "image" && item?.image)
    : null;

  if (!imagePart?.image) {
    throw new Error("No image URL returned from DashScope");
  }

  return {
    imageURL: imagePart.image,
    size: data?.usage?.size || "1280*1280"
  };
}

async function generateQuotes({ inputText, preferredStyle }) {
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

  const content = await callDashScope({
    model: DASHSCOPE_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Feeling: ${inputText}\nPreferred style: ${preferredStyle}`
      }
    ],
    temperature: 1
  });

  const parsed = extractJSONObject(content);
  return normalizeQuoteRows(parsed?.quotes, preferredStyle);
}

async function generateImageCaptions({ preferredStyle, imageBase64 }) {
  const systemPrompt = `
Write exactly 3 short Arabic captions inspired by the uploaded photo.

Rules:
- Keep each caption short, elegant, and shareable
- Use natural modern Arabic
- The captions should feel visually grounded and suitable for a social post
- Return ONLY JSON in this shape:
{
  "quotes": [
    { "text": "..." },
    { "text": "..." },
    { "text": "..." }
  ]
}
`.trim();

  const content = await callDashScope({
    model: DASHSCOPE_VISION_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Preferred style: ${preferredStyle}`
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`
            }
          }
        ]
      }
    ],
    temperature: 0.9
  });

  const parsed = extractJSONObject(content);
  return normalizeQuoteRows(parsed?.quotes, preferredStyle);
}

async function generatePosterQuote({ inputText, theme }) {
  const systemPrompt = `
Write exactly 1 short Arabic line that can be placed on a poster.

Rules:
- The line must feel complete and polished
- Keep it emotionally rich but concise
- Match the requested visual theme
- Return ONLY JSON in this shape:
{
  "quote": "..."
}
`.trim();

  const content = await callDashScope({
    model: DASHSCOPE_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Theme: ${theme}\nIdea: ${inputText}`
      }
    ],
    temperature: 0.95
  });

  const parsed = extractJSONObject(content);
  return String(parsed?.quote || "").trim();
}

// API
app.post("/generate-quote", async (req, res) => {
  try {
    const { inputText, preferredStyle } = req.body;

    if (!inputText || !preferredStyle) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    let quotes = await generateQuotes({ inputText, preferredStyle });

    if (!quotes || quotes.length === 0) {
      quotes = fallbackQuotes(preferredStyle);
    }

    return res.json({ quotes: quotes.slice(0, 3) });
  } catch (err) {
    console.error(err);
    return res.json({ quotes: fallbackQuotes(req.body?.preferredStyle || "literary").slice(0, 3) });
  }
});

app.post("/generate-image-captions", async (req, res) => {
  try {
    const { preferredStyle, imageBase64 } = req.body;

    if (!preferredStyle || !imageBase64) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    let quotes;

    try {
      quotes = await generateImageCaptions({ preferredStyle, imageBase64 });
    } catch (error) {
      console.error("Vision generation failed:", error);
      quotes = fallbackQuotes(preferredStyle);
    }

    if (!quotes || quotes.length === 0) {
      quotes = fallbackQuotes(preferredStyle);
    }

    return res.json({ quotes: quotes.slice(0, 3) });
  } catch (err) {
    console.error(err);
    return res.json({ quotes: fallbackQuotes(req.body?.preferredStyle || "literary").slice(0, 3) });
  }
});

app.post("/generate-poster-quote", async (req, res) => {
  try {
    const { inputText, theme } = req.body;

    if (!inputText || !theme) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    let quote;

    try {
      quote = await generatePosterQuote({ inputText, theme });
    } catch (error) {
      console.error("Poster generation failed:", error);
      quote = fallbackPosterQuote(inputText, theme);
    }

    if (!quote) {
      quote = fallbackPosterQuote(inputText, theme);
    }

    return res.json({ quote });
  } catch (err) {
    console.error(err);
    return res.json({ quote: fallbackPosterQuote(req.body?.inputText, req.body?.theme) });
  }
});

app.post("/generate-text-to-image", async (req, res) => {
  try {
    const { inputText, style, size } = req.body;

    if (!inputText || !style || !size) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const result = await generateTextToImage({ inputText, style, size });
    return res.json(result);
  } catch (err) {
    console.error("Text-to-image failed:", err);
    return res.status(500).json({
      error: "Image generation failed",
      details: err.message || String(err)
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
