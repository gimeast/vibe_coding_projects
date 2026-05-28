import axios from 'axios';
import iconv from 'iconv-lite';
import * as cheerio from 'cheerio';

const NAVER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://finance.naver.com/',
};

function num(str) {
  if (!str) return null;
  return str.replace(/,/g, '').trim();
}

/**
 * 종목 시세·투자자 데이터 수집
 * - 현재가·등락률 (Naver 모바일 API)
 * - 외국인/기관 순매수, 보유율 (frgn.naver 스크래핑)
 * - 52주 고/저, 목표주가, 투자의견, PER (frgn.naver)
 */
export async function collectStockData(stockCode) {
  const result = {};

  // 1. 현재가·등락률
  try {
    const { data } = await axios.get(
      `https://m.stock.naver.com/api/stock/${stockCode}/basic`,
      {
        headers: { ...NAVER_HEADERS, Referer: 'https://m.stock.naver.com/' },
        timeout: 5000,
      }
    );
    const priceCode = data.compareToPreviousPrice?.code; // '2'=상승 '5'=하락 '3'=보합
    result.price       = data.closePrice ? Number(String(data.closePrice).replace(/,/g, '')).toLocaleString() + '원' : null;
    result.change      = data.compareToPreviousClosePrice ? String(data.compareToPreviousClosePrice).replace(/,/g, '') : null;
    result.changeRate  = data.fluctuationsRatio != null ? String(data.fluctuationsRatio) + '%' : null;
    result.direction   = priceCode === '2' ? 'up' : priceCode === '5' ? 'down' : 'flat';
  } catch (err) {
    console.warn(`[시세] 수집 실패 (${stockCode}): ${err.message}`);
  }

  // 2. 외국인/기관 순매수 + 52주 고저 + 목표주가 + PER
  try {
    const { data: buf } = await axios.get(
      `https://finance.naver.com/item/frgn.naver?code=${stockCode}`,
      { responseType: 'arraybuffer', headers: NAVER_HEADERS, timeout: 8000 }
    );
    const html = iconv.decode(Buffer.from(buf), 'euc-kr');
    const $ = cheerio.load(html);
    const tables = $('table');

    // table[3] — 외국인/기관 순매수 히스토리 (첫 번째 데이터 행)
    const invTable = tables.eq(3);
    const firstDataRow = invTable.find('tr').filter((_, el) => {
      const firstTd = $(el).find('td').eq(0).text().trim();
      return /\d{4}\.\d{2}\.\d{2}/.test(firstTd);
    }).first();

    if (firstDataRow.length) {
      const tds = firstDataRow.find('td');
      result.latestDate      = $(tds.eq(0)).text().trim();
      result.institutionNet  = num($(tds.eq(6)).text());  // 기관 순매매량
      result.foreignNet      = num($(tds.eq(7)).text());  // 외국인 순매매량
      result.foreignOwnership = $(tds.eq(9)).text().trim(); // 외국인 보유율
    }

    // table[7] — 투자의견, 목표주가, 52주 고저
    const metaText = tables.eq(7).text();
    const highLowMatch = metaText.match(/52주최고l최저\s*([\d,]+)\s*l\s*([\d,]+)/);
    if (highLowMatch) {
      result.high52w = highLowMatch[1];
      result.low52w  = highLowMatch[2];
    }
    const ratingMatch = metaText.match(/(매수|중립|매도)/);
    if (ratingMatch) result.rating = ratingMatch[1];
    const targetMatch = metaText.match(/[\d.]+(?:매수|중립|매도)\s*l\s*([\d,]+)/);
    if (targetMatch) result.targetPrice = targetMatch[1];

    // table[8] — PER
    const perMatch = tables.eq(8).text().match(/(\d+\.?\d*)배/);
    if (perMatch) result.per = perMatch[1];

  } catch (err) {
    console.warn(`[투자자] 수집 실패 (${stockCode}): ${err.message}`);
  }

  return Object.keys(result).length > 0 ? result : null;
}
