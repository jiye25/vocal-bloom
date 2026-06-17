import OpenAI from "openai";

const NEUTRAL = { love:0, longing:0, joy:0, sadness:0, excitement:0, gratitude:0 };
const KEYS    = ["love","longing","joy","sadness","excitement","gratitude"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { text } = req.body || {};
  if (!text?.trim()) return res.json(NEUTRAL);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `다음 한국어 문장에서 6가지 감정의 강도를 분석하여 JSON으로만 응답하세요.
값은 0.0~1.0 사이 실수, 합계가 1.0이 되도록 하세요. 감정이 없으면 0.
반드시 JSON 한 줄만 출력하세요. 다른 텍스트, 마크다운, 코드블록 없이.

감정: love(사랑/애정), longing(그리움/추억), joy(기쁨/행복), sadness(슬픔/우울/미안함/사과/후회), excitement(설렘/기대), gratitude(감사/뿌듯함)

문장: "${text.trim()}"

출력 형식(이 형식만):
{"love":0.0,"longing":0.0,"joy":0.0,"sadness":0.0,"excitement":0.0,"gratitude":0.0}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
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

    if (total < 0.01) return res.json(NEUTRAL);
    KEYS.forEach(k => { parsed[k] = parsed[k] / total; });
    return res.json(parsed);

  } catch (err) {
    console.error("[감정분석 오류]", err.message);
    return res.json(NEUTRAL);
  }
}
