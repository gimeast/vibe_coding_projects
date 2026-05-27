import axios from 'axios';
import { lookupCorpCode } from '../utils/dartCorpCodes.js';

function formatDate(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * DART 공시 목록 조회
 * @param {{ code: string, name: string }} stock
 * @returns {Promise<Array>}
 */
export async function collectDart(stock) {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) return [];

  const corpCode = await lookupCorpCode(stock.code);
  if (!corpCode) {
    console.warn(`[DART] 기업코드 없음: ${stock.name} (${stock.code})`);
    return [];
  }

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const params = {
    crtfc_key: apiKey,
    corp_code: corpCode,
    bgn_de: formatDate(yesterday),
    end_de: formatDate(today),
    sort: 'date',
    sort_mth: 'desc',
    page_count: 10,
  };

  try {
    const { data } = await axios.get('https://opendart.fss.or.kr/api/list.json', {
      params,
      timeout: 8000,
    });

    if (data.status !== '000') return [];

    const items = Array.isArray(data.list) ? data.list : [];
    return items.slice(0, 10).map(item => ({
      title: item.report_nm || '',
      type: mapDisclosureType(item.pblntf_ty),
      typeCode: item.pblntf_ty || '',
      corpName: item.corp_name || stock.name,
      rcpNo: item.rcp_no || '',
      url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item.rcp_no}`,
      submittedAt: item.rcept_dt || '',
    }));
  } catch (err) {
    console.warn(`[DART] 조회 실패 (${stock.name}): ${err.message}`);
    return [];
  }
}

function mapDisclosureType(code) {
  const map = {
    A: '정기공시',
    B: '주요사항보고',
    C: '발행공시',
    D: '지분공시',
    E: '기타공시',
    F: '외부감사관련',
    G: '펀드공시',
    H: '자산유동화',
    I: '거래소공시',
    J: '공정위공시',
  };
  return map[code] || code || '기타';
}
