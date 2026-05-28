import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

// ── 경제 언론사 RSS 목록 ──────────────────────────────────────────
const MEDIA_FEEDS = [
  { name: '한국경제',    url: 'https://www.hankyung.com/feed/finance' },
  { name: '매일경제',    url: 'https://www.mk.co.kr/rss/30100041/' },
  { name: '서울경제',    url: 'https://www.sedaily.com/rss/finance' },
  { name: '파이낸셜뉴스', url: 'https://www.fnnews.com/rss/r20/fn_realnews_stock.xml' },
  { name: '헤럴드경제',  url: 'https://biz.heraldcorp.com/rss/google/finance' },
];

const RSS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

const ARTICLE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
  'Referer': 'https://www.google.com/',
};

// 본문 추출 CSS 선택자 (우선순위 순)
const BODY_SELECTORS = [
  '#dic_area',                    // 네이버 뉴스 뷰어
  '.newsct_article',              // 네이버 뉴스
  '[itemprop="articleBody"]',     // 매일경제, 파이낸셜뉴스 등
  '.article-body',                // 한국경제, 헤럴드경제
  '#article_body',                // 매일경제
  '.article_body',                // 공통
  '.article-content',             // 서울경제, 헤럴드경제
  '.article_view',                // 서울경제
  '.article_con',                 // 파이낸셜뉴스
  '[class*="article-body"]',
  '[class*="articleBody"]',
  '[class*="article_body"]',
  '[class*="news-content"]',
  '[class*="newsContent"]',
  '[class*="view-content"]',
  'article',
];

// ── 공통 유틸 ────────────────────────────────────────────────────

/**
 * RSS XML 파싱 → 뉴스 아이템 배열
 */
export function parseNewsXML(xml) {
  const items = xml?.rss?.channel?.[0]?.item || [];
  return items.map(item => ({
    title: item.title?.[0]?.replace(/<[^>]+>/g, '').trim() || '',
    url: item.link?.[0]?.trim() || item.guid?.[0]?._?.trim() || '',
    source: item.source?.[0]?._ || item.source?.[0] || '',
    pubDate: item.pubDate?.[0] || '',
    description: item.description?.[0]?.replace(/<[^>]+>/g, '').trim().slice(0, 3000) || '',
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
 * 7일 이내 기사 필터
 */
function filterRecent(items) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return items.filter(item => {
    if (!item.pubDate) return true;
    const d = new Date(item.pubDate);
    return isNaN(d) || d.getTime() >= cutoff;
  });
}

/**
 * 네이버 금융 뷰어 URL → 실제 네이버 뉴스 URL 변환
 * finance.naver.com/item/news_read.naver?office_id=009&arti_id=0006498123
 * → n.news.naver.com/mnews/article/009/0006498123
 */
function resolveNaverUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'finance.naver.com' && u.pathname.includes('news_read')) {
      const officeId  = u.searchParams.get('office_id');
      const articleId = u.searchParams.get('article_id');
      if (officeId && articleId) {
        return `https://n.news.naver.com/mnews/article/${officeId}/${articleId}`;
      }
    }
  } catch {}
  return url;
}

/**
 * 기사 URL에서 본문 텍스트 크롤링
 */
async function fetchArticleBody(rawUrl) {
  const url = resolveNaverUrl(rawUrl);
  try {
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 8000,
      headers: ARTICLE_HEADERS,
      maxRedirects: 5,
    });

    const contentType = res.headers['content-type'] || '';
    const isEucKr = contentType.toLowerCase().includes('euc-kr');
    const html = isEucKr
      ? iconv.decode(Buffer.from(res.data), 'euc-kr')
      : Buffer.from(res.data).toString('utf-8');

    const $ = cheerio.load(html);

    // 노이즈 제거
    $('script, style, nav, header, footer, iframe, figure, .ad, .advertisement, ' +
      '[class*="related"], [class*="recommend"], [class*="copyright"], ' +
      '[class*="sns"], [class*="share"], [class*="tag"]').remove();

    for (const sel of BODY_SELECTORS) {
      const el = $(sel).first();
      if (el.length) {
        const text = el.text().replace(/\s+/g, ' ').trim();
        if (text.length > 100) {
          return text.slice(0, 3000);
        }
      }
    }

    // fallback: <p> 태그 수집
    const pText = $('p')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(t => t.length > 20)
      .join(' ');
    if (pText.length > 100) return pText.slice(0, 3000);

    return '';
  } catch {
    return '';
  }
}

/**
 * 본문이 없는 기사들 병렬 크롤링 (3개씩 배치)
 */
export async function enrichBodies(items) {
  const targets = items.filter(item => !item.description || item.description.length < 50);
  if (targets.length === 0) return;

  const BATCH = 3;
  for (let i = 0; i < targets.length; i += BATCH) {
    await Promise.all(
      targets.slice(i, i + BATCH).map(async item => {
        const body = await fetchArticleBody(item.url);
        if (body) item.description = body;
      })
    );
  }
}

// ── 수집 함수 ────────────────────────────────────────────────────

/**
 * 시장 전체 뉴스 수집 — 5개 언론사 RSS에서 증시 키워드로 필터링 후 본문 크롤링
 */
export async function collectMarketNews() {
  const MARKET_KEYWORDS = ['코스피', '코스닥', '증시', '주가지수'];

  const results = await Promise.allSettled(
    MEDIA_FEEDS.map(feed => fetchOneFeed(feed, MARKET_KEYWORDS))
  );

  const items = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') items.push(...r.value);
    else console.warn(`[시장뉴스] ${MEDIA_FEEDS[i].name} 수집 실패: ${r.reason?.message}`);
  });

  const combined = deduplicateByUrl(filterRecent(
    deduplicateByUrl(items)
  )).slice(0, 10);

  await enrichBodies(combined);
  return combined;
}

/**
 * 네이버 금융 — 종목 코드 기반 직접 크롤링 (EUC-KR)
 */
async function fetchNaverNews(stockCode) {
  const { data: buf } = await axios.get(
    `https://finance.naver.com/item/news_news.naver?code=${stockCode}`,
    {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': RSS_HEADERS['User-Agent'],
        Referer: 'https://finance.naver.com/',
      },
      timeout: 8000,
    }
  );

  const html = iconv.decode(Buffer.from(buf), 'euc-kr');
  const $ = cheerio.load(html);
  const items = [];

  $('table.type5 tr').each((_, el) => {
    const titleEl = $(el).find('td.title a').first();
    const title   = titleEl.text().trim();
    const href    = titleEl.attr('href');
    const source  = $(el).find('td.info').first().text().trim();
    const pubDate = $(el).find('td.date').first().text().trim();

    if (title && href && title.length > 5) {
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
 * 경제 언론사 RSS 단건 수집 + 키워드 필터링
 * @param {object} feed
 * @param {string | string[]} keywords  — 단일 종목명 또는 키워드 배열
 */
async function fetchOneFeed(feed, keywords) {
  const { data } = await axios.get(feed.url, { headers: RSS_HEADERS, timeout: 8000 });
  const parsed = await parseStringPromise(data, { explicitArray: true });
  const items = parseNewsXML(parsed);

  const kwList = Array.isArray(keywords) ? keywords : [keywords];

  return items
    .filter(item =>
      kwList.some(kw =>
        item.title.includes(kw) || item.description.includes(kw)
      )
    )
    .map(item => ({
      ...item,
      source: item.source || feed.name,
    }));
}

/**
 * 경제 언론사 5개 RSS 병렬 수집
 */
async function fetchMediaNews(stock) {
  const results = await Promise.allSettled(
    MEDIA_FEEDS.map(feed => fetchOneFeed(feed, stock.name))
  );

  const items = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      items.push(...r.value);
    } else {
      console.warn(`[뉴스] ${MEDIA_FEEDS[i].name} 수집 실패: ${r.reason?.message}`);
    }
  });

  return items;
}

// ── 메인 ─────────────────────────────────────────────────────────

/**
 * 종목 뉴스 수집 메인 함수
 */
export async function collectNews(stock) {
  // 1. 네이버 금융 (종목 코드 특화)
  let naverItems = [];
  try {
    naverItems = await fetchNaverNews(stock.code);
  } catch (err) {
    console.warn(`[뉴스] 네이버 수집 실패 (${stock.name}): ${err.message}`);
  }

  // 2. 경제 언론사 RSS 5개 병렬 수집
  let mediaItems = [];
  try {
    mediaItems = await fetchMediaNews(stock);
  } catch (err) {
    console.warn(`[뉴스] 언론사 RSS 수집 실패 (${stock.name}): ${err.message}`);
  }

  const combined = deduplicateByUrl(filterRecent(
    deduplicateByUrl([...naverItems, ...mediaItems])
  )).slice(0, 20);

  // 3. 본문 없는 기사 크롤링으로 보완
  await enrichBodies(combined);

  return combined;
}
