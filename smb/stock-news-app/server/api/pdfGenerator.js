import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function formatDateTime(date = new Date()) {
  return date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

function priceColor(direction) {
  if (direction === 'up')   return '#c0392b';
  if (direction === 'down') return '#2471a3';
  return '#555';
}

function sign(direction) {
  return direction === 'up' ? '▲' : direction === 'down' ? '▼' : '━';
}

/* ── 시세 행 ──────────────────────────────────────────────────── */
function buildPriceRow(sd) {
  if (!sd) return '';
  const c = priceColor(sd.direction);
  const s = sign(sd.direction);

  const chips = [
    sd.foreignNet     && `외국인 <b style="color:${Number(sd.foreignNet)>=0?'#c0392b':'#2471a3'};">${Number(sd.foreignNet)>=0?'+':''}${Number(sd.foreignNet).toLocaleString()}주</b>`,
    sd.institutionNet && `기관 <b style="color:${Number(sd.institutionNet)>=0?'#c0392b':'#2471a3'};">${Number(sd.institutionNet)>=0?'+':''}${Number(sd.institutionNet).toLocaleString()}주</b>`,
    sd.targetPrice    && `목표주가 <b>${sd.targetPrice}원${sd.rating?` (${sd.rating})`:''}</b>`,
    sd.per            && `PER <b>${sd.per}배</b>`,
    sd.high52w && sd.low52w && `52주 <b style="color:#c0392b;">${Number(sd.high52w).toLocaleString()}</b> / <b style="color:#2471a3;">${Number(sd.low52w).toLocaleString()}</b>`,
  ].filter(Boolean);

  return `
  <div style="background:#f8f8f8;border:1px solid #e0e0e0;border-radius:4px;padding:12px 16px;margin-bottom:20px;">
    ${sd.price ? `<div style="margin-bottom:8px;">
      <span style="font-size:26px;font-weight:700;color:${c};">${sd.price}</span>
      <span style="font-size:15px;color:${c};margin-left:10px;">${s} ${sd.change ? Math.abs(Number(sd.change)).toLocaleString() : ''} (${sd.changeRate || ''})</span>
    </div>` : ''}
    ${chips.length ? `<div style="font-size:13px;color:#555;display:flex;flex-wrap:wrap;gap:14px;">${chips.join('')}</div>` : ''}
  </div>`;
}

/* ── 뉴스 카드 ────────────────────────────────────────────────── */
function buildNewsCard(n) {
  return `
  <div style="border-bottom:1px solid #ebebeb;padding:12px 0;">
    <div style="font-size:12px;color:#999;margin-bottom:5px;">${[n.source, n.pubDate].filter(Boolean).join(' · ')}</div>
    <div style="font-size:15px;font-weight:600;color:#1a1a1a;margin-bottom:8px;line-height:1.5;">${n.title}</div>
    ${n.description ? `<div style="font-size:13px;color:#555;line-height:1.8;">${n.description}</div>` : ''}
    ${n.url ? `<a href="${n.url}" style="display:inline-block;margin-top:6px;font-size:11px;color:#999;text-decoration:none;">원문 →</a>` : ''}
  </div>`;
}

/* ── 섹션 제목 ────────────────────────────────────────────────── */
function sectionTitle(title, sub) {
  return `
  <div style="border-bottom:2px solid #1a1a1a;padding-bottom:10px;margin-bottom:18px;">
    <h2 style="font-size:28px;font-weight:700;color:#1a1a1a;margin:0 0 4px;">${title}</h2>
    ${sub ? `<span style="font-size:13px;color:#888;">${sub}</span>` : ''}
  </div>`;
}

/* ── 시장 현황 섹션 ───────────────────────────────────────────── */
function buildMarketSection(marketData) {
  if (!marketData) return '';
  const { kospi, kosdaq, news } = marketData;

  function indexBox(label, idx) {
    if (!idx) return `
    <div style="flex:1;border:1px solid #e0e0e0;border-radius:4px;padding:14px 18px;">
      <div style="font-size:10px;color:#aaa;margin-bottom:4px;">${label}</div>
      <div style="color:#bbb;">데이터 없음</div>
    </div>`;
    const c = priceColor(idx.direction);
    const s = sign(idx.direction);
    return `
    <div style="flex:1;border:1px solid #e0e0e0;border-radius:4px;padding:14px 18px;">
      <div style="font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">${label}</div>
      <div style="font-size:28px;font-weight:700;color:${c};margin-bottom:4px;">${idx.value ?? '—'}</div>
      <div style="font-size:14px;color:${c};">${s} ${idx.change ? Math.abs(Number(idx.change)).toLocaleString() : '—'} (${idx.changeRate ?? '—'})</div>
    </div>`;
  }

  const newsHTML = (!news || news.length === 0)
    ? '<p style="color:#aaa;font-size:12px;padding:12px 0;">수집된 시장 뉴스 없음</p>'
    : news.map(buildNewsCard).join('');

  return `
  <div style="page-break-before:always;padding-top:44px;">
    ${sectionTitle('시장 현황', '국내 증시 지수 및 주요 뉴스')}
    <div style="display:flex;gap:12px;margin-bottom:28px;">
      ${indexBox('KOSPI', kospi)}
      ${indexBox('KOSDAQ', kosdaq)}
    </div>
    <div style="font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">국내증시 뉴스</div>
    ${newsHTML}
  </div>`;
}

/* ── 종목 섹션 ────────────────────────────────────────────────── */
function buildStockSection(stock) {
  const newsHTML = stock.news.length === 0
    ? '<p style="color:#aaa;font-size:12px;padding:12px 0;">수집된 뉴스 없음</p>'
    : stock.news.map(buildNewsCard).join('');

  return `
  <div style="page-break-before:always;padding-top:44px;">
    ${sectionTitle(stock.name, `${stock.code} · ${stock.market || 'KOSPI'}`)}
    ${buildPriceRow(stock.stockData)}
    <div style="font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">최신 뉴스</div>
    ${newsHTML}
  </div>`;
}

/* ── 전체 HTML ────────────────────────────────────────────────── */
function buildReportHTML(reportData) {
  const { stocks, marketData, generatedAt } = reportData;

  const summaryRows = stocks.map(s => `
    <tr>
      <td style="padding:11px 14px;border-bottom:1px solid #ebebeb;font-weight:600;color:#1a1a1a;font-size:15px;">${s.name}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #ebebeb;color:#888;text-align:center;font-size:14px;">${s.code}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #ebebeb;color:#888;text-align:center;font-size:14px;">${s.market || 'KOSPI'}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #ebebeb;color:#555;text-align:center;font-size:14px;">${s.news.length}건</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/pretendard.css" />
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    background:#fff;
    color:#1a1a1a;
    font-family:'Pretendard', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
    font-size:15px;
    padding:52px 56px;
    line-height:1.7;
  }
</style>
</head>
<body>

  <!-- 표지 -->
  <div style="min-height:90vh;display:flex;flex-direction:column;justify-content:center;">
    <div style="border-top:3px solid #1a1a1a;padding-top:28px;margin-bottom:44px;">
      <h1 style="font-size:44px;font-weight:700;color:#1a1a1a;margin-bottom:8px;">주식 뉴스 리포트</h1>
      <p style="font-size:14px;color:#aaa;">${formatDateTime(new Date(generatedAt))}</p>
    </div>
    <div>
      <div style="font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">포함 종목</div>
      ${stocks.map(s => `
        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #f0f0f0;">
          <span style="font-size:17px;font-weight:600;color:#1a1a1a;">${s.name}</span>
          <span style="font-size:13px;color:#aaa;">${s.code} · ${s.market || 'KOSPI'}</span>
        </div>`).join('')}
    </div>
  </div>

  <!-- 시장 현황 -->
  ${buildMarketSection(marketData)}

  <!-- 종목별 뉴스 -->
  ${stocks.map(buildStockSection).join('')}

  <!-- 종합 요약 -->
  <div style="page-break-before:always;padding-top:44px;">
    ${sectionTitle('종합 요약', '수집된 뉴스 현황')}
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:2px solid #1a1a1a;">
          <th style="padding:8px 12px;text-align:left;font-size:10px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:1px;">종목</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:1px;">코드</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:1px;">시장</th>
          <th style="padding:8px 12px;text-align:center;font-size:10px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:1px;">뉴스</th>
        </tr>
      </thead>
      <tbody>${summaryRows}</tbody>
    </table>
  </div>

</body>
</html>`;
}

/**
 * 리포트 데이터를 PDF로 저장
 */
export async function generatePDF(reportData) {
  const html = buildReportHTML(reportData);
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const ts = kst.toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const filename = `stock_report_${ts}.pdf`;
  const outPath = join(__dirname, '../../reports', filename);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
  } finally {
    await browser.close();
  }

  return filename;
}
