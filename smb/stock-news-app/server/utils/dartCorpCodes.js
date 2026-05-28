import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import AdmZip from 'adm-zip';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../data');
const CORP_CODE_MAP_FILE = join(DATA_DIR, 'dartCorpCodes.json');    // stockCode → corpCode
const COMPANY_LIST_FILE  = join(DATA_DIR, 'dartCompanyList.json');   // 검색용 전체 상장사 목록

let corpCodeMap   = null; // { '005930': '00126380', ... }
let companyList   = null; // [{ code, name, corpCode }, ...]

async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
}

/**
 * DART corpCode.xml ZIP 다운로드 → 파싱 → 두 파일 저장
 */
async function downloadAndParse(apiKey) {
  console.log('[DART] 전체 기업코드 다운로드 중...');
  const url = `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${apiKey}`;
  const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });

  // ZIP → XML 추출
  const zip = new AdmZip(Buffer.from(data));
  const entry = zip.getEntries().find(e => e.entryName.toUpperCase() === 'CORPCODE.XML');
  if (!entry) throw new Error('CORPCODE.XML을 ZIP에서 찾을 수 없습니다');
  const xmlStr = zip.readAsText(entry);

  // XML 파싱
  const parsed = await parseStringPromise(xmlStr, { explicitArray: false });
  const rawList = parsed?.result?.list;
  const arr = Array.isArray(rawList) ? rawList : rawList ? [rawList] : [];

  // 상장사만 필터 (stock_code가 있는 것)
  const codeMap = {};
  const searchList = [];

  for (const item of arr) {
    const stockCode = (item.stock_code || '').trim();
    const corpCode  = (item.corp_code  || '').trim();
    const corpName  = (item.corp_name  || '').trim();
    if (stockCode && corpCode) {
      codeMap[stockCode] = corpCode;
      searchList.push({ code: stockCode, name: corpName, corpCode });
    }
  }

  await ensureDataDir();
  await writeFile(CORP_CODE_MAP_FILE, JSON.stringify(codeMap),      'utf-8');
  await writeFile(COMPANY_LIST_FILE,  JSON.stringify(searchList),    'utf-8');

  console.log(`[DART] 기업코드 저장 완료 — 상장사 ${searchList.length}개`);
  return { codeMap, searchList };
}

/**
 * 캐시 로드 또는 다운로드
 */
 async function loadOrDownload() {
  // 이미 메모리에 있으면 그대로
  if (corpCodeMap && companyList) return;

  // 캐시 파일 있으면 읽기
  if (existsSync(CORP_CODE_MAP_FILE) && existsSync(COMPANY_LIST_FILE)) {
    corpCodeMap  = JSON.parse(await readFile(CORP_CODE_MAP_FILE, 'utf-8'));
    companyList  = JSON.parse(await readFile(COMPANY_LIST_FILE,  'utf-8'));
    console.log(`[DART] 기업코드 캐시 로드 — 상장사 ${companyList.length}개`);
    return;
  }

  // 캐시 없으면 다운로드
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) {
    console.warn('[DART] API 키 없음 — 기업코드 기능 비활성화');
    corpCodeMap = {};
    companyList = [];
    return;
  }

  const result = await downloadAndParse(apiKey);
  corpCodeMap = result.codeMap;
  companyList = result.searchList;
}

/**
 * 종목코드(6자리) → DART 기업고유번호(8자리)
 */
export async function lookupCorpCode(stockCode) {
  await loadOrDownload();
  return corpCodeMap[stockCode] || null;
}

/**
 * 종목코드(6자리) → 시장 구분 (KOSPI | KOSDAQ | KONEX | 기타)
 * DART company.json API의 corp_cls 필드 사용: Y=KOSPI, K=KOSDAQ, N=KONEX
 */
export async function lookupMarketByCode(stockCode) {
  await loadOrDownload();
  const corpCode = corpCodeMap[stockCode];
  if (!corpCode) return 'KOSPI'; // 기본값

  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) return 'KOSPI';

  try {
    const url = `https://opendart.fss.or.kr/api/company.json?crtfc_key=${apiKey}&corp_code=${corpCode}`;
    const { data } = await axios.get(url, { timeout: 5000 });
    const cls = data?.corp_cls;
    if (cls === 'Y') return 'KOSPI';
    if (cls === 'K') return 'KOSDAQ';
    if (cls === 'N') return 'KONEX';
    return '기타';
  } catch {
    return 'KOSPI'; // API 실패 시 기본값
  }
}

/**
 * 회사명/종목코드로 검색 (최대 15개)
 * @param {string} query
 * @returns {{ code: string, name: string, corpCode: string }[]}
 */
export async function searchCompanies(query) {
  await loadOrDownload();
  if (!query || !companyList?.length) return [];

  const q = query.trim().toLowerCase();
  return companyList
    .filter(c => c.name.toLowerCase().includes(q) || c.code.includes(q))
    .slice(0, 15);
}

/**
 * 앱 시작 시 백그라운드로 기업코드 초기화
 */
export async function initCorpCodes() {
  try {
    await loadOrDownload();
  } catch (err) {
    console.error('[DART] 기업코드 초기화 실패:', err.message);
  }
}
