// 주요 코스피/코스닥 종목 코드 매핑 (검색용)
export const STOCK_CODES = [
  { code: '005930', name: '삼성전자', market: 'KOSPI' },
  { code: '000660', name: 'SK하이닉스', market: 'KOSPI' },
  { code: '035420', name: 'NAVER', market: 'KOSPI' },
  { code: '035720', name: '카카오', market: 'KOSPI' },
  { code: '005490', name: 'POSCO홀딩스', market: 'KOSPI' },
  { code: '000270', name: '기아', market: 'KOSPI' },
  { code: '005380', name: '현대차', market: 'KOSPI' },
  { code: '051910', name: 'LG화학', market: 'KOSPI' },
  { code: '068270', name: '셀트리온', market: 'KOSPI' },
  { code: '207940', name: '삼성바이오로직스', market: 'KOSPI' },
  { code: '006400', name: '삼성SDI', market: 'KOSPI' },
  { code: '003550', name: 'LG', market: 'KOSPI' },
  { code: '096770', name: 'SK이노베이션', market: 'KOSPI' },
  { code: '034730', name: 'SK', market: 'KOSPI' },
  { code: '030200', name: 'KT', market: 'KOSPI' },
  { code: '017670', name: 'SK텔레콤', market: 'KOSPI' },
  { code: '032830', name: '삼성생명', market: 'KOSPI' },
  { code: '018260', name: '삼성에스디에스', market: 'KOSPI' },
  { code: '086790', name: '하나금융지주', market: 'KOSPI' },
  { code: '105560', name: 'KB금융', market: 'KOSPI' },
  { code: '055550', name: '신한지주', market: 'KOSPI' },
  { code: '316140', name: '우리금융지주', market: 'KOSPI' },
  { code: '352820', name: '하이브', market: 'KOSPI' },
  { code: '010130', name: '고려아연', market: 'KOSPI' },
  { code: '028260', name: '삼성물산', market: 'KOSPI' },
  { code: '247540', name: '에코프로비엠', market: 'KOSDAQ' },
  { code: '086520', name: '에코프로', market: 'KOSDAQ' },
  { code: '196170', name: '알테오젠', market: 'KOSDAQ' },
  { code: '293490', name: '카카오게임즈', market: 'KOSDAQ' },
  { code: '041510', name: 'SM엔터테인먼트', market: 'KOSDAQ' },
  { code: '035900', name: 'JYP Ent.', market: 'KOSDAQ' },
  { code: '122870', name: 'YG엔터테인먼트', market: 'KOSDAQ' },
  { code: '263750', name: '펄어비스', market: 'KOSDAQ' },
  { code: '036570', name: 'NCsoft', market: 'KOSPI' },
  { code: '112040', name: '위메이드', market: 'KOSDAQ' },
];

/**
 * 종목명 또는 코드로 검색 (최대 10개)
 * @param {string} query
 * @returns {{ code: string, name: string, market: string }[]}
 */
export function searchStocks(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return STOCK_CODES.filter(s =>
    s.name.toLowerCase().includes(q) || s.code.includes(q)
  ).slice(0, 10);
}
