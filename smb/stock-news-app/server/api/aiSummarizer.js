import axios from 'axios';

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'gemma4:26b-a4b-it-q4_K_M';

/**
 * Ollama JSON 응답 파싱 (안전하게)
 */
export function parseAIResponse(content) {
  try {
    const json = typeof content === 'string' ? JSON.parse(content) : content;
    return {
      summary: json.summary || '',
      impact: ['상승요인', '하락요인', '중립'].includes(json.impact) ? json.impact : '중립',
      reason: json.reason || '',
      keywords: Array.isArray(json.keywords) ? json.keywords.slice(0, 5) : [],
      importance: ['높음', '보통', '낮음'].includes(json.importance) ? json.importance : '보통',
    };
  } catch {
    return { summary: '', impact: '중립', reason: '', keywords: [], importance: '보통' };
  }
}

async function callOllama(prompt) {
  const { data } = await axios.post(
    `${OLLAMA_BASE}/api/chat`,
    {
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      format: 'json',
    },
    { timeout: 120000 }
  );
  return data.message?.content || '{}';
}

/**
 * 뉴스 기사 AI 요약
 */
export async function summarizeNews(stockName, title, description) {
  const prompt = `다음 주식 뉴스 기사를 분석하여 JSON 형식으로만 응답해주세요. 다른 텍스트는 절대 포함하지 마세요.
종목명: ${stockName}
기사 제목: ${title}
기사 내용: ${description}
응답 형식:
{"summary":"2-3줄 핵심 요약","impact":"상승요인 또는 하락요인 또는 중립","reason":"주가에 미치는 영향 이유 한 줄","keywords":["키워드1","키워드2","키워드3"]}`;

  try {
    const content = await callOllama(prompt);
    return parseAIResponse(content);
  } catch (err) {
    console.warn(`[AI] 뉴스 요약 실패 (${stockName}): ${err.message}`);
    return { summary: title, impact: '중립', reason: '', keywords: [], importance: '보통' };
  }
}

/**
 * DART 공시 AI 요약
 */
export async function summarizeDart(stockName, disclosureType, title) {
  const prompt = `다음 DART 전자공시를 분석하여 JSON 형식으로만 응답해주세요. 다른 텍스트는 절대 포함하지 마세요.
종목명: ${stockName}
공시 유형: ${disclosureType}
공시 제목: ${title}
응답 형식:
{"summary":"공시 내용 2-3줄 요약","impact":"상승요인 또는 하락요인 또는 중립","reason":"주가에 미치는 영향 이유 한 줄","importance":"높음 또는 보통 또는 낮음"}`;

  try {
    const content = await callOllama(prompt);
    return parseAIResponse(content);
  } catch (err) {
    console.warn(`[AI] 공시 요약 실패 (${stockName}): ${err.message}`);
    return { summary: title, impact: '중립', reason: '', keywords: [], importance: '보통' };
  }
}
