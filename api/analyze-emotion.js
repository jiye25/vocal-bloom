import OpenAI from "openai";

const NEUTRAL = { love:0, longing:0, joy:0, sadness:0, excitement:0, gratitude:0 };
const KEYS    = ["love","longing","joy","sadness","excitement","gratitude"];

const SYSTEM = `너는 한국어 문장의 감정을 분석해 6개 감정(love, longing, joy, sadness, excitement, gratitude)의
강도를 0.0~1.0 사이 점수로 평가하여 JSON 객체 하나만 출력하는 시스템이다.
화자가 그 말을 누군가에게 직접 건넨다고 가정하고 평가하라. 짧은 한마디도 그 자체로 명확한 감정 표현이다.
설명, 마크다운, 코드블록 없이 JSON만 출력하라.`;

const RESPONSE_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "emotion_scores",
    strict: true,
    schema: {
      type: "object",
      properties: {
        love:       { type: "number" },
        longing:    { type: "number" },
        joy:        { type: "number" },
        sadness:    { type: "number" },
        excitement: { type: "number" },
        gratitude:  { type: "number" },
      },
      required: KEYS,
      additionalProperties: false,
    },
  },
};

async function callModel(openai, text) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: "사랑해" },
      { role: "assistant", content: '{"love":0.9,"longing":0,"joy":0.1,"sadness":0,"excitement":0,"gratitude":0}' },
      { role: "user", content: "정말 미안해" },
      { role: "assistant", content: '{"love":0,"longing":0,"joy":0,"sadness":0.85,"excitement":0,"gratitude":0}' },
      { role: "user", content: "너무 고마워" },
      { role: "assistant", content: '{"love":0,"longing":0,"joy":0,"sadness":0,"excitement":0,"gratitude":0.85}' },
      { role: "user", content: "오늘 날씨 좋다" },
      { role: "assistant", content: '{"love":0,"longing":0,"joy":0,"sadness":0,"excitement":0,"gratitude":0}' },
      { role: "user", content: text },
    ],
    temperature: 0.7,
    max_tokens: 100,
    response_format: RESPONSE_SCHEMA,
  });

  const raw = completion.choices[0].message.content.trim();
  const scores = JSON.parse(raw);
  const parsed = {};
  let total = 0;
  KEYS.forEach(k => {
    parsed[k] = Math.max(0, Math.min(1, Number(scores[k]) || 0));
    total += parsed[k];
  });
  return { parsed, total };
}

// ★ AI가 0점만 줄 때를 위한 키워드 기반 보조 판별기 (최소한의 안전망)
const KEYWORD_MAP = {
  love:       ["사랑해","사랑하다","사랑한다","좋아해","좋아하다","애정","소중해","소중하다","자기야","여보"],
  longing:    ["보고싶","보고팠","그리워","그립다","그리움","반가워","반갑다","오랜만"],
  joy:        ["기뻐","기쁘다","행복","즐거","신나","신난다"],
  sadness:    ["미안","죄송","사과","후회","잘못","아쉬워","아쉽다","속상","슬프","슬퍼"],
  excitement: ["설레","설렘","두근","떨려","떨리다","기대돼","기대된다","기대되","떨린다"],
  gratitude:  ["고마워","고맙다","감사","든든해","든든하다","다행","덕분"],
};
function keywordFallback(text) {
  const scores = { ...NEUTRAL };
  let total = 0;
  KEYS.forEach(k => {
    KEYWORD_MAP[k].forEach(kw => {
      if (text.includes(kw)) { scores[k] += 1; total += 1; }
    });
  });
  if (total === 0) return null;
  KEYS.forEach(k => { scores[k] = scores[k] / total; });
  return scores;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { text } = req.body || {};
  if (!text?.trim()) return res.json(NEUTRAL);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const trimmed = text.trim();

  try {
    // ★ 모델이 가끔 전부 0으로 응답하는 불안정성 보정 — 0점이면 한 번 더 재시도
    let result = await callModel(openai, trimmed);
    if (result.total < 0.15) {
      result = await callModel(openai, trimmed);
    }

    if (result.total < 0.15) {
      const fb = keywordFallback(trimmed);
      return res.json(fb || NEUTRAL);
    }
    const parsed = {};
    KEYS.forEach(k => { parsed[k] = result.parsed[k] / result.total; });
    return res.json(parsed);

  } catch (err) {
    console.error("[감정분석 오류]", err.message);
    const fb = keywordFallback(trimmed);
    return res.json(fb || NEUTRAL);
  }
}
