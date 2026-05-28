import express from 'express';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { collectDart } from '../api/dartCollector.js';

const router = express.Router();

// GET /api/dart/:code?name=종목명
router.get('/:code', async (req, res) => {
  const { code } = req.params;
  const name = req.query.name || code;
  try {
    const disclosures = await collectDart({ code, name });
    res.json(disclosures);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dart/pdf/:rcpNo — DART 공시 PDF 다운로드
router.get('/pdf/:rcpNo', async (req, res) => {
  const { rcpNo } = req.params;
  const apiKey = process.env.DART_API_KEY;

  if (!apiKey) {
    return res.status(503).json({ error: 'DART API 키가 설정되지 않았습니다' });
  }

  try {
    // DART document.xml API → ZIP 바이너리
    const { data } = await axios.get(
      'https://opendart.fss.or.kr/api/document.xml',
      {
        params: { crtfc_key: apiKey, rcept_no: rcpNo },
        responseType: 'arraybuffer',
        timeout: 15000,
      }
    );

    const zip = new AdmZip(Buffer.from(data));
    const entries = zip.getEntries();

    // PDF 우선, 없으면 HWP
    const pdfEntry = entries.find(e => e.entryName.toLowerCase().endsWith('.pdf'));
    const hwpEntry = entries.find(e => e.entryName.toLowerCase().endsWith('.hwp') || e.entryName.toLowerCase().endsWith('.hwpx'));
    const target = pdfEntry || hwpEntry;

    if (!target) {
      return res.status(404).json({ error: 'PDF/HWP 파일이 없는 공시입니다' });
    }

    const fileBuffer = target.getData();
    const ext = target.entryName.split('.').pop().toLowerCase();
    const mimeType = ext === 'pdf' ? 'application/pdf' : 'application/x-hwp';
    const filename = `dart_${rcpNo}.${ext}`;

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(fileBuffer);
  } catch (err) {
    console.error(`[DART] PDF 다운로드 실패 (${rcpNo}):`, err.message);
    res.status(500).json({ error: '공시 파일을 가져오지 못했습니다: ' + err.message });
  }
});

export default router;
