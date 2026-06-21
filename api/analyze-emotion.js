import OpenAI from "openai";

const NEUTRAL = { love:0, longing:0, joy:0, sadness:0, excitement:0, gratitude:0 };
const KEYS    = ["love","longing","joy","sadness","excitement","gratitude"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { text } = req.body || {};
  if (!text?.trim()) return res.json(NEUTRAL);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const SYSTEM = `너는 한국어 문장의 감정을 분석해 6개 감정(love, longing, joy, sadness, excitement, gratitude)의
강도를 0.0~1.0 사이 점수로 평가하여 JSON 객체 하나만 출력하는 시스템이다.
화자가 그 말을 누군가에게 직접 건넨다고 가정하고 평가하라. 짧은 한마디도 그 자체로 명확한 감정 표현이다.
설명, 마크다운, 코드블록 없이 JSON만 출력하라.`;

  try {
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
        { role: "user", content: text.trim() },
      ],
      temperature: 0.3,
      max_tokens: 100,
    });

    const raw = completion.choices[0].message.content.trim();
    const clean = raw.replace(/```[a-z]*/gi, "").replace(/```/g, "").trim();
    const jsonMatch = clean.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) throw new Error(`JSON 없음: ${raw}`);

    const scores = JSON.parse(jsonMatch[0]);
    const parsed = {};
    let total = 0;
    KEYS.forEach(k => {
      parsed[k] = Math.max(0, Math.min(1, Number(scores[k]) || 0));
      total += parsed[k];
    });

    if (total < 0.15) return res.json(NEUTRAL);
    KEYS.forEach(k => { parsed[k] = parsed[k] / total; });
    return res.json(parsed);

  } catch (err) {
    console.error("[감정분석 오류]", err.message);
    return res.json(NEUTRAL);
  }
}
