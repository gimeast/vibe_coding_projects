import axios from 'axios';
import { collectMarketNews } from './newsCollector.js';

const NAVER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://m.stock.naver.com/',
};

/**
 * KOSPI / KOSDAQ 지수 데이터 수집
 * @param {'KOSPI'|'KOSDAQ'} indexCode
 */
async function collectIndexData(indexCode) {
  const { data } = await axios.get(
    `https://m.stock.naver.com/api/index/${indexCode}/basic`,
    { headers: NAVER_HEADERS, timeout: 5000 }
  );
  const priceCode = data.compareToPreviousPrice?.code; // '2'=상승 '5'=하락 '3'=보합
  return {
    value:      data.closePrice != null            ? Number(String(data.closePrice).replace(/,/g, '')).toLocaleString()  : null,
    change:     data.compareToPreviousClosePrice   ? String(data.compareToPreviousClosePrice).replace(/,/g, '')          : null,
    changeRate: data.fluctuationsRatio != null     ? String(data.fluctuationsRatio) + '%'                                : null,
    direction:  priceCode === '2' ? 'up' : priceCode === '5' ? 'down' : 'flat',
  };
}

/**
 * 시장 전체 데이터 통합 수집
 * - KOSPI / KOSDAQ 지수
 * - 5개 언론사 RSS에서 "코스피|코스닥|증시|주가지수" 키워드 필터링 + 본문 크롤링
 * @returns {{ kospi, kosdaq, news }}
 */
export async function collectMarketData() {
  const [kospiResult, kosdaqResult, newsResult] = await Promise.allSettled([
    collectIndexData('KOSPI'),
    collectIndexData('KOSDAQ'),
    collectMarketNews(),
  ]);

  return {
    kospi:  kospiResult.status  === 'fulfilled' ? kospiResult.value  : null,
    kosdaq: kosdaqResult.status === 'fulfilled' ? kosdaqResult.value : null,
    news:   newsResult.status   === 'fulfilled' ? newsResult.value   : [],
  };
}
