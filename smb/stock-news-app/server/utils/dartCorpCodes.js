import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createWriteStream } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = join(__dirname, '../data/dartCorpCodes.json');

let corpCodeMap = null; // { stockCode: corpCode }

/**
 * DART 기업코드 XML 다운로드 및 파싱
 * ZIP 파일을 직접 처리하기 위해 adm-zip 대신 API 방식 사용
 */
async function downloadCorpCodes(apiKey) {
  // DART API: 기업코드 ZIP 다운로드
  const url = `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${apiKey}`;
  const { data } = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
  });

  // ZIP 내부 CORPCODE.xml 파싱 (adm-zip 없이 간단한 방식)
  // ZIP 바이너리에서 XML 추출
  const buf = Buffer.from(data);
  const zipText = buf.toString('latin1');
  const xmlStart = zipText.indexOf('<?xml');
  const xmlEnd = zipText.lastIndexOf('</result>') + '</result>'.length;

  let xmlStr;
  if (xmlStart !== -1 && xmlEnd > xmlStart) {
    xmlStr = zipText.slice(xmlStart, xmlEnd);
  } else {
    // fallback: adm-zip 사용
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(buf);
    xmlStr = zip.readAsText('CORPCODE.xml');
  }

  const parsed = await parseStringPromise(xmlStr, { explicitArray: false });
  const list = parsed.result?.list || [];
  const arr = Array.isArray(list) ? list : [list];

  const map = {};
  for (const item of arr) {
    if (item.stock_code && item.corp_code) {
      map[item.stock_code.trim()] = item.corp_code.trim();
    }
  }
  return map;
}

/**
 * 기업코드 맵 로드 (캐시 우선, 없으면 다운로드)
 */
export async function getCorpCodeMap() {
  if (corpCodeMap) return corpCodeMap;

  // 캐시 확인
  if (existsSync(CACHE_FILE)) {
    const raw = await readFile(CACHE_FILE, 'utf-8');
    corpCodeMap = JSON.parse(raw);
    return corpCodeMap;
  }

  // API 키 없으면 빈 맵 반환
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) {
    console.warn('[DART] API 키 없음 — 공시 기능 비활성화');
    corpCodeMap = {};
    return corpCodeMap;
  }

  console.log('[DART] 기업코드 다운로드 중...');
  try {
    corpCodeMap = await downloadCorpCodes(apiKey);
    const dataDir = join(__dirname, '../data');
    if (!existsSync(dataDir)) await mkdir(dataDir, { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(corpCodeMap), 'utf-8');
    console.log(`[DART] 기업코드 캐시 저장 완료 (${Object.keys(corpCodeMap).length}개)`);
  } catch (err) {
    console.error('[DART] 기업코드 다운로드 실패:', err.message);
    corpCodeMap = {};
  }

  return corpCodeMap;
}

/**
 * 종목코드(6자리) → DART 기업고유번호(8자리)
 */
export async function lookupCorpCode(stockCode) {
  const map = await getCorpCodeMap();
  return map[stockCode] || null;
}
