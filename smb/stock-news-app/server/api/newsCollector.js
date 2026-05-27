import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import * as cheerio from 'cheerio';

const DELAY_MS = 1000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * RSS XML 문자열을 파싱해 뉴스 아이템 배열로 변환
 */
export function parseNewsXML(xml) {
  // xml2js로 파싱된 결과를 받아 정규화
  const items = xml?.rss?.channel?.[0]?.item || [];
  return items.map(item => ({
    title: item.title?.[0]?.replace(/<[^>]+>/g, '').trim() || '',
    url: item.link?.[0]?.trim() || item.guid?.[0]?._?.trim() || '',
    source: item.source?.[0]?._ || item.source?.[0] || '',
    pubDate: item.pubDate?.[0] || '',
    description: item.description?.[0]?.replace(/<[^>]+>/g, '').trim().slice(0, 200) || '',
  })).filter(item => item.title && item.url);
}

/**
 * URL 기준 중복 제거
 */
export function deduplicateByUrl(items) {
  const seen = new Set();
  return items.filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

/**
 * 24시간 이내 기사 필터 (pubDate 없으면 통과)
 */
function filterRecent(items) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return items.filter(item => {
    if (!item.pubDate) return true;
    const d = new Date(item.pubDate);
    return isNaN(d) || d.getTime() >= cutoff;
  });
}

/**
 * 네이버 금융 뉴스 RSS 수집
 */
async function fetchNaverNews(stockCode) {
  const url = `https://finance.naver.com/item/news_news.naver?code=${stockCode}&page=1&sm=title_entity_id.basic&clusterId=`;
  const rssUrl = `https://finance.naver.com/item/news_news.naver?code=${stockCode}`;

  // 네이버는 RSS 직접 제공 대신 HTML 파싱
  const { data } = await axios.get(
    `https://finance.naver.com/item/news_news.naver?code=${stockCode}`,
    { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.naver.com/' }, timeout: 5000 }
  );
  const $ = cheerio.load(data);
  const items = [];

  $('table.type5 tr').each((_, el) => {
    const titleEl = $(el).find('td.title a');
    const title = titleEl.text().trim();
    const href = titleEl.attr('href');
    const source = $(el).find('td.info').first().text().trim();
    const pubDate = $(el).find('td.date').text().trim();
    if (title && href) {
      items.push({
        title,
        url: `https://finance.naver.com${href}`,
        source,
        pubDate,
        description: '',
      });
    }
  });

  return items.slice(0, 10);
}

/**
 * 구글 뉴스 RSS 수집 (fallback)
 */
async function fetchGoogleNews(stockName) {
  const query = encodeURIComponent(`${stockName} 주식`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=ko&gl=KR&ceid=KR:ko`;

  const { data } = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 5000,
  });

  const parsed = await parseStringPromise(data, { explicitArray: true });
  return parseNewsXML(parsed).slice(0, 10);
}

/**
 * 종목 뉴스 수집 메인 함수
 * @param {{ code: string, name: string }} stock
 * @returns {Promise<Array>}
 */
export async function collectNews(stock) {
  let items = [];

  try {
    items = await fetchNaverNews(stock.code);
  } catch (err) {
    console.warn(`[뉴스] 네이버 수집 실패 (${stock.name}): ${err.message}`);
  }

  if (items.length < 3) {
    try {
      await sleep(DELAY_MS);
      const googleItems = await fetchGoogleNews(stock.name);
      items = deduplicateByUrl([...items, ...googleItems]);
    } catch (err) {
      console.warn(`[뉴스] 구글 수집 실패 (${stock.name}): ${err.message}`);
    }
  }

  return deduplicateByUrl(filterRecent(items)).slice(0, 10);
}
