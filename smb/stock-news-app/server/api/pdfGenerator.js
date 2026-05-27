import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFile } from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));

function formatDateTime(date = new Date()) {
  return date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

function badgeColor(impact) {
  if (impact === '상승요인') return '#0fa336';
  if (impact === '하락요인') return '#e22718';
  return '#3c3c3c';
}

function importanceColor(imp) {
  if (imp === '높음') return '#1c69d4';
  if (imp === '낮음') return '#3c3c3c';
  return '#262626';
}

function buildReportHTML(reportData) {
  const { stocks, generatedAt } = reportData;

  const stockSections = stocks.map(stock => {
    const dartSection = stock.dart.length === 0
      ? '<p style="color:#7e7e7e;font-size:13px;padding:12px 0;">해당 기간 공시 없음</p>'
      : stock.dart.map(d => `
        <div style="background:#1a1a1a;border:1px solid #3c3c3c;padding:16px;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="color:#1c69d4;font-size:10px;font-weight:700;letter-spacing:1.5px;">DART · ${d.type} · ${d.submittedAt}</span>
            <div style="display:flex;gap:6px;">
              <span style="background:${importanceColor(d.ai?.importance)};color:#fff;font-size:9px;font-weight:700;padding:2px 8px;letter-spacing:1px;">중요도 ${d.ai?.importance || '보통'}</span>
              <span style="background:${badgeColor(d.ai?.impact)};color:#fff;font-size:9px;font-weight:700;padding:2px 8px;letter-spacing:1px;">${d.ai?.impact || '중립'}</span>
            </div>
          </div>
          <div style="font-size:13px;font-weight:700;color:#e6e6e6;margin-bottom:8px;">${d.title}</div>
          <div style="font-size:12px;font-weight:300;color:#bbbbbb;line-height:1.6;margin-bottom:8px;">${d.ai?.summary || ''}</div>
          ${d.ai?.reason ? `<div style="font-size:11px;color:#7e7e7e;margin-bottom:8px;">📌 ${d.ai.reason}</div>` : ''}
          <a href="${d.url}" style="font-size:10px;font-weight:700;color:#7e7e7e;letter-spacing:1.5px;">공시 보기 →</a>
        </div>`).join('');

    const newsSection = stock.news.length === 0
      ? '<p style="color:#7e7e7e;font-size:13px;padding:12px 0;">수집된 뉴스 없음</p>'
      : stock.news.map(n => `
        <div style="background:#1a1a1a;border:1px solid #3c3c3c;padding:16px;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="color:#7e7e7e;font-size:10px;font-weight:700;letter-spacing:1.5px;">${n.source || ''} · ${n.pubDate || ''}</span>
            <span style="background:${badgeColor(n.ai?.impact)};color:#fff;font-size:9px;font-weight:700;padding:2px 8px;letter-spacing:1px;">${n.ai?.impact || '중립'}</span>
          </div>
          <div style="font-size:13px;font-weight:700;color:#e6e6e6;margin-bottom:8px;">${n.title}</div>
          <div style="font-size:12px;font-weight:300;color:#bbbbbb;line-height:1.6;margin-bottom:8px;">${n.ai?.summary || ''}</div>
          ${n.ai?.keywords?.length ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">${n.ai.keywords.map(k => `<span style="border:1px solid #3c3c3c;color:#7e7e7e;font-size:9px;padding:2px 6px;font-weight:700;letter-spacing:1px;">${k}</span>`).join('')}</div>` : ''}
          <a href="${n.url}" style="font-size:10px;font-weight:700;color:#7e7e7e;letter-spacing:1.5px;">원문 보기 →</a>
        </div>`).join('');

    return `
      <div style="page-break-before:always;">
        <div style="height:4px;background:linear-gradient(90deg,#0066b1,#1c69d4,#e22718);margin-bottom:24px;"></div>
        <h2 style="font-size:32px;font-weight:700;color:#fff;margin-bottom:4px;">${stock.name}</h2>
        <p style="font-size:12px;color:#7e7e7e;letter-spacing:1px;margin-bottom:24px;">${stock.code} · ${stock.market || 'KOSPI'}</p>

        <h3 style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#7e7e7e;border-bottom:1px solid #3c3c3c;padding-bottom:8px;margin-bottom:12px;">DART 전자공시</h3>
        ${dartSection}

        <h3 style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#7e7e7e;border-bottom:1px solid #3c3c3c;padding-bottom:8px;margin-bottom:12px;margin-top:24px;">최신 뉴스</h3>
        ${newsSection}
      </div>`;
  }).join('');

  // 요약 테이블
  const summaryRows = stocks.map(stock => {
    const upCount = stock.news.filter(n => n.ai?.impact === '상승요인').length;
    const downCount = stock.news.filter(n => n.ai?.impact === '하락요인').length;
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #3c3c3c;color:#e6e6e6;font-weight:700;">${stock.name}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #3c3c3c;color:#0fa336;font-weight:700;text-align:center;">${upCount}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #3c3c3c;color:#e22718;font-weight:700;text-align:center;">${downCount}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #3c3c3c;color:#7e7e7e;text-align:center;">${stock.news.length - upCount - downCount}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #3c3c3c;color:#1c69d4;text-align:center;">${stock.dart.length}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #000; color: #fff; font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; padding: 40px; }
</style>
</head>
<body>
  <!-- 표지 -->
  <div style="min-height:100vh;display:flex;flex-direction:column;justify-content:center;">
    <div style="height:4px;background:linear-gradient(90deg,#0066b1,#1c69d4,#e22718);margin-bottom:48px;"></div>
    <h1 style="font-size:56px;font-weight:700;letter-spacing:2px;color:#fff;margin-bottom:16px;">주식 뉴스 리포트</h1>
    <p style="font-size:16px;font-weight:300;color:#bbbbbb;margin-bottom:48px;">STOCK NEWS REPORT</p>
    <p style="font-size:13px;color:#7e7e7e;margin-bottom:24px;">생성 일시: ${formatDateTime(new Date(generatedAt))}</p>
    <div>
      <p style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#7e7e7e;margin-bottom:12px;">포함 종목</p>
      ${stocks.map(s => `<div style="font-size:14px;font-weight:700;color:#e6e6e6;margin-bottom:6px;">${s.name} <span style="color:#7e7e7e;font-weight:300;">${s.code}</span></div>`).join('')}
    </div>
  </div>

  <!-- 종목별 섹션 -->
  ${stockSections}

  <!-- 요약 페이지 -->
  <div style="page-break-before:always;">
    <div style="height:4px;background:linear-gradient(90deg,#0066b1,#1c69d4,#e22718);margin-bottom:24px;"></div>
    <h2 style="font-size:32px;font-weight:700;color:#fff;margin-bottom:24px;">종합 요약</h2>
    <table style="width:100%;border-collapse:collapse;background:#0d0d0d;">
      <thead>
        <tr style="border-bottom:1px solid #3c3c3c;">
          <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;letter-spacing:1.5px;color:#7e7e7e;">종목</th>
          <th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:700;letter-spacing:1.5px;color:#0fa336;">상승요인</th>
          <th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:700;letter-spacing:1.5px;color:#e22718;">하락요인</th>
          <th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:700;letter-spacing:1.5px;color:#7e7e7e;">중립</th>
          <th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:700;letter-spacing:1.5px;color:#1c69d4;">DART 공시</th>
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
 * @param {object} reportData
 * @returns {Promise<string>} 저장된 파일명
 */
export async function generatePDF(reportData) {
  const html = buildReportHTML(reportData);
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 12);
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
