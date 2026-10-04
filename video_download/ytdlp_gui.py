#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
yt-dlp GUI — 표준 라이브러리만으로 동작하는 yt-dlp 래퍼.

추가 설치(pip 포함) 없이 `python3 ytdlp_gui.py` 로 바로 실행된다.
tkinter 를 쓸 수 있으면 창 GUI 로, 아니면 로컬 웹 GUI 로 자동 전환한다.

  python3 ytdlp_gui.py            # 자동 선택
  python3 ytdlp_gui.py --web      # 웹 GUI 강제
  python3 ytdlp_gui.py --tk       # tkinter 강제 (안 되면 그대로 실패)
  python3 ytdlp_gui.py --port 8765 --no-browser
                                  # SSH 포트 포워딩용 고정 포트

대상 환경: Rocky Linux, sudo 없음, 시스템 파이썬 3.9.
"""

from __future__ import annotations

import argparse
import datetime
import html
import json
import os
import re
import shlex
import signal
import subprocess
import sys
import threading
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urljoin, urlparse

APP_TITLE = "yt-dlp 다운로더"

# PATH 에 의존하지 않고 전체 경로를 쓴다. 환경변수는 설치 위치가 다를 때를 위한 탈출구.
YTDLP_BIN = os.environ.get("YTDLP_BIN") or os.path.expanduser("~/.local/bin/yt-dlp")
FFMPEG_DIR = os.environ.get("FFMPEG_DIR") or os.path.expanduser("~/.local/bin")
DEFAULT_OUTPUT_DIR = os.path.expanduser("~/Videos")

# 사용자가 파일명에 확장자를 붙였을 때 떼어내기 위한 목록.
# 안 떼면 "영상.mp4" 가 "영상.mp4.mp4" 로 저장된다.
MEDIA_EXTS = (
    ".mp4", ".mkv", ".webm", ".mov", ".avi", ".flv",
    ".m4a", ".mp3", ".wav", ".opus", ".aac",
)

# 페이지를 직접 받아볼 때 쓰는 UA. 기본 urllib UA 는 많은 사이트가 막는다.
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)


# --------------------------------------------------------------------------
# 핵심 — 명령 구성
# --------------------------------------------------------------------------

def clean_filename(name: str) -> str:
    """사용자가 넣은 파일명을 출력 템플릿에 넣어도 안전한 형태로 다듬는다."""
    name = name.strip().replace("/", "_").replace("\\", "_").strip()

    lowered = name.lower()
    for ext in MEDIA_EXTS:
        if lowered.endswith(ext):
            name = name[: -len(ext)]
            break

    # yt-dlp 는 `%` 를 출력 템플릿 필드의 시작으로 읽는다. 반드시 이스케이프.
    return name.strip().replace("%", "%%")


def build_command(url: str, out_dir: str, filename: str, extra: list) -> list:
    """yt-dlp 명령줄을 만든다."""
    if filename:
        template = os.path.join(out_dir, filename + ".%(ext)s")
    else:
        template = os.path.join(out_dir, "%(title)s.%(ext)s")

    return [
        YTDLP_BIN,
        # 기본 진행률은 \r 로 같은 줄을 덮어쓴다. 로그창에 흘려보내려면 줄 단위여야 한다.
        "--newline",
        # ANSI 색상 코드가 섞이면 로그창에 이스케이프 문자가 그대로 보인다.
        "--no-colors",
        "--ffmpeg-location", FFMPEG_DIR,
        "-o", template,
        *extra,
        url,
    ]


def resolve_output_dir(raw: str) -> str:
    """`~` 를 실제 경로로 펴고, 비어 있으면 기본값을 쓴다."""
    raw = (raw or "").strip()
    if not raw:
        return DEFAULT_OUTPUT_DIR
    return os.path.abspath(os.path.expanduser(raw))


def check_ytdlp(emit) -> bool:
    if not os.path.isfile(YTDLP_BIN):
        emit("[오류] yt-dlp 를 찾지 못했습니다: %s" % YTDLP_BIN)
        emit("       설치 위치가 다르면 YTDLP_BIN 환경변수로 지정할 수 있습니다.")
        return False

    if not os.access(YTDLP_BIN, os.X_OK):
        emit("[오류] yt-dlp 에 실행 권한이 없습니다: %s" % YTDLP_BIN)
        emit("       chmod +x %s" % YTDLP_BIN)
        return False

    return True


def preflight(url: str, out_dir: str, emit) -> bool:
    """실행 전 확인. 문제가 있으면 이유를 로그에 남기고 False."""
    if not url.strip():
        emit("[오류] URL 을 입력해 주세요.")
        return False

    if not check_ytdlp(emit):
        return False

    try:
        os.makedirs(out_dir, exist_ok=True)  # mkdir -p 와 같은 효과
    except OSError as exc:
        emit("[오류] 저장 폴더를 만들지 못했습니다: %s" % exc)
        return False

    return True


def ytdlp_env() -> dict:
    env = dict(os.environ)
    # yt-dlp 도 파이썬이라, 출력이 파이프로 가면 블록 버퍼링이 걸려
    # 로그가 실시간으로 흐르지 않고 뭉쳐서 튀어나온다.
    env["PYTHONUNBUFFERED"] = "1"
    # yt-dlp 가 내부적으로 ffmpeg 를 찾을 때를 위한 보조 장치.
    env["PATH"] = FFMPEG_DIR + os.pathsep + env.get("PATH", "")
    return env


def ytdlp_version() -> str:
    try:
        out = subprocess.run(
            [YTDLP_BIN, "--version"],
            capture_output=True, text=True, timeout=30, env=ytdlp_env(),
        )
        return out.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def version_age_days(version: str):
    """yt-dlp 버전은 날짜(2026.08.19)다. 며칠 묵었는지 돌려준다. 해석 못 하면 None."""
    m = re.match(r"(\d{4})\.(\d{1,2})\.(\d{1,2})", version)
    if not m:
        return None
    try:
        released = datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None
    return (datetime.date.today() - released).days


# --------------------------------------------------------------------------
# 실패 원인 진단 — yt-dlp 는 대부분의 실패를 종료 코드 1 하나로 뭉뚱그린다.
# 코드만으로는 아무것도 알 수 없으니 ERROR 줄을 읽어 원인과 해결책을 안내한다.
# --------------------------------------------------------------------------

DIAGNOSES = [
    (
        r"unsupported url",
        "yt-dlp 가 모르는 사이트(또는 주소 형태)입니다.",
        [
            "페이지 안에서 영상 주소를 찾아보는 2차 시도도 실패했습니다.",
            "브라우저에서 직접 영상 주소를 찾아 넣으면 대부분 받아집니다:",
            "  1) 영상 페이지에서 F12 → Network(네트워크) 탭을 엽니다.",
            "  2) 필터 칸에 m3u8 (안 나오면 mpd, 그다음 mp4) 를 입력합니다.",
            "  3) 영상을 재생하면 나타나는 주소를 우클릭 → Copy URL.",
            "  4) 그 주소를 URL 칸에 넣고, 추가 옵션에 아래를 넣습니다:",
            "       --referer \"원래 페이지 주소\"",
        ],
    ),
    (
        r"drm",
        "DRM 으로 보호된 영상입니다.",
        ["DRM 콘텐츠는 받을 수 없습니다 (넷플릭스·국내 OTT 등)."],
    ),
    (
        r"impersonat",
        "사이트가 봇 차단을 하고 있어 브라우저 흉내(impersonation)가 필요합니다.",
        [
            "yt-dlp 를 curl_cffi 가 포함된 빌드(yt-dlp_linux)로 바꾸면 해결됩니다.",
            "그다음 추가 옵션에 --impersonate chrome 을 넣어 보세요.",
        ],
    ),
    (
        r"sign in|\blog ?in\b|cookies|not a bot|members[- ]only|private video|"
        r"\bage\b|age[- ]restrict",
        "로그인(쿠키)이 필요한 영상입니다.",
        [
            "브라우저에서 해당 사이트에 로그인한 뒤, 추가 옵션에 넣어 보세요:",
            "  --cookies-from-browser firefox   (또는 chrome)",
        ],
    ),
    (
        r"geo|not available in your country|your country",
        "지역 제한이 걸린 영상입니다.",
        ["해당 국가에서만 볼 수 있는 영상이라 받을 수 없습니다."],
    ),
    (
        r"http error 403|forbidden",
        "서버가 요청을 거부했습니다 (403).",
        [
            "1) 먼저 [yt-dlp 업데이트] 를 눌러 최신으로 올려 보세요.",
            "2) 그래도 안 되면 추가 옵션에 --referer \"원래 페이지 주소\" 를 넣어 보세요.",
            "3) 로그인이 필요한 사이트라면 --cookies-from-browser firefox",
        ],
    ),
    (
        r"http error 404|not found",
        "영상 주소를 찾을 수 없습니다 (404).",
        ["주소가 잘못됐거나 삭제·만료된 영상입니다. 브라우저에서 열리는지 확인해 보세요."],
    ),
    (
        r"requested format is not available",
        "요청한 형식이 없습니다.",
        ["추가 옵션에 -f b 를 넣으면 받을 수 있는 형식 중 최선을 받습니다."],
    ),
    (
        r"ffmpeg|ffprobe|postprocessing",
        "ffmpeg 관련 문제입니다.",
        ["FFMPEG_DIR 이 ffmpeg 실행 파일이 들어 있는 폴더를 가리키는지 확인하세요."],
    ),
    (
        r"unable to connect|timed out|name or service not known|"
        r"temporary failure in name resolution|connection (?:reset|refused)",
        "네트워크 연결 문제입니다.",
        ["인터넷 연결이나 프록시 설정을 확인하세요."],
    ),
    (
        r"unable to extract|unable to download (?:json|api)|please report this issue|"
        r"keyerror|nonetype",
        "사이트 구조가 바뀌어 yt-dlp 추출기가 깨졌을 가능성이 큽니다.",
        ["[yt-dlp 업데이트] 를 눌러 최신으로 올린 뒤 다시 시도하세요."],
    ),
]


def diagnose(errors: list) -> list:
    """ERROR 줄 목록을 보고 사람이 읽을 안내문을 만든다."""
    text = "\n".join(errors).lower()
    out = []
    for pattern, title, hints in DIAGNOSES:
        if re.search(pattern, text):
            out.append("원인: " + title)
            out.extend("  " + h for h in hints)
            break  # 가장 구체적인 하나만. 여러 개 늘어놓으면 오히려 헷갈린다.

    if not out:
        if errors:
            out.append("원인: 위 ERROR 줄을 확인하세요.")
        else:
            out.append("원인: yt-dlp 가 ERROR 없이 실패했습니다. 위 로그를 확인하세요.")

    version = ytdlp_version()
    if version:
        age = version_age_days(version)
        line = "현재 yt-dlp 버전: %s" % version
        if age is not None:
            line += " (%d일 전 릴리스)" % age
        out.append(line)
        if age is not None and age > 30:
            out.append("  yt-dlp 가 오래됐습니다. 사이트 변경을 못 따라가는 경우가 많으니")
            out.append("  [yt-dlp 업데이트] 를 먼저 눌러 보세요.")
    return out


# --------------------------------------------------------------------------
# 2차 경로 — yt-dlp 가 모르는 사이트에서 페이지 HTML 을 직접 뒤져 영상 주소를 찾는다.
#
# 예전 Electron 버전은 숨김 브라우저로 네트워크를 가로챘지만, 표준 라이브러리만으로는
# 브라우저가 없다. 그래서 정적 HTML(+ iframe 한 단계)에 박혀 있는 주소만 찾는다.
# JS 가 런타임에 주소를 받아오는 사이트는 여기서도 못 찾는다 — 그때는 진단 안내대로
# 개발자 도구에서 주소를 직접 복사해야 한다.
# --------------------------------------------------------------------------

MANIFEST_RE = re.compile(r"\.(?:m3u8|mpd)(?:\?|$)", re.I)
PROGRESSIVE_RE = re.compile(r"\.(?:mp4|webm|m4v|mov|flv)(?:\?|$)", re.I)

# HLS/DASH 조각. init 세그먼트가 init.mp4 로 오기도 해서 progressive 보다 먼저 거른다.
SEGMENT_RES = [
    re.compile(r"\.(?:m4s|ts|aac)(?:\?|$)", re.I),
    re.compile(r"(?:^|/)(?:init|seg|segment|chunk|frag)[^/]*\.(?:mp4|m4s|webm)(?:\?|$)", re.I),
    re.compile(r"/\d{3,}\.(?:mp4|m4s|ts|webm)(?:\?|$)", re.I),
]

# 따옴표 안에 든 미디어 주소. 상대 경로도 잡아 urljoin 으로 편다.
QUOTED_MEDIA_RE = re.compile(
    r"""["']([^"'\s<>]+?\.(?:m3u8|mpd|mp4|webm|m4v|mov|flv)(?:\?[^"'\s<>]*)?)["']""",
    re.I,
)
# 따옴표 없이 박힌 절대 주소 (JS 문자열 연결, 텍스트 등)
BARE_MEDIA_RE = re.compile(
    r"""https?://[^\s"'<>]+?\.(?:m3u8|mpd|mp4|webm|m4v|mov|flv)(?:\?[^\s"'<>]*)?""",
    re.I,
)
IFRAME_RE = re.compile(r"""<iframe\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']""", re.I)
OG_TITLE_RE = re.compile(
    r"""<meta\b[^>]*?property\s*=\s*["']og:title["'][^>]*?content\s*=\s*["']([^"']*)["']""",
    re.I,
)
TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)


def fetch_page(url: str, referer: str = "") -> str:
    headers = {"User-Agent": BROWSER_UA, "Accept-Language": "ko,en;q=0.8"}
    if referer:
        headers["Referer"] = referer
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as resp:
        raw = resp.read(5 * 1024 * 1024)  # 거대한 응답에 묶이지 않게 상한
        charset = resp.headers.get_content_charset() or "utf-8"
    return raw.decode(charset, errors="replace")


def _normalize_html(text: str) -> str:
    """JSON 안에 이스케이프된 주소(https:\\/\\/..., \\u002F)를 평범한 형태로 편다."""
    text = text.replace("\\/", "/")
    text = re.sub(r"\\u002[fF]", "/", text)
    text = re.sub(r"\\u0026", "&", text)
    return html.unescape(text)


def _classify(url: str):
    if not re.match(r"https?:", url, re.I):
        return None
    path = url.split("#", 1)[0]
    if any(r.search(path) for r in SEGMENT_RES):
        return None
    if MANIFEST_RE.search(path):
        return "manifest"
    if PROGRESSIVE_RE.search(path):
        return "progressive"
    return None


def extract_media(page_url: str, text: str) -> list:
    """HTML 에서 미디어 주소 후보를 뽑는다. 매니페스트(HLS/DASH)를 앞에 둔다."""
    text = _normalize_html(text)
    found = []
    seen = set()

    raw = [m.group(1) for m in QUOTED_MEDIA_RE.finditer(text)]
    raw += [m.group(0) for m in BARE_MEDIA_RE.finditer(text)]

    for item in raw:
        url = urljoin(page_url, item.strip())
        kind = _classify(url)
        if kind and url not in seen:
            seen.add(url)
            found.append((kind, url))

    return [u for k, u in found if k == "manifest"] + [
        u for k, u in found if k == "progressive"
    ]


def extract_title(text: str) -> str:
    m = OG_TITLE_RE.search(text) or TITLE_RE.search(text)
    if not m:
        return ""
    return re.sub(r"\s+", " ", html.unescape(m.group(1))).strip()


def sniff_page(page_url: str, emit):
    """
    페이지(+ iframe 한 단계)를 받아 영상 주소 후보와 제목을 찾는다.
    반환: (후보 목록, 페이지 제목)
    """
    try:
        text = fetch_page(page_url)
    except Exception as exc:
        emit("  페이지를 받지 못했습니다: %s" % exc)
        return [], ""

    title = extract_title(text)
    candidates = extract_media(page_url, text)

    if not candidates:
        # 플레이어가 iframe 안에 있는 경우가 흔하다. 한 단계만 따라간다.
        frames = []
        for m in IFRAME_RE.finditer(text):
            src = urljoin(page_url, html.unescape(m.group(1)))
            if src.startswith("http") and src not in frames:
                frames.append(src)
        for frame_url in frames[:5]:
            emit("  iframe 확인: %s" % frame_url)
            try:
                frame_text = fetch_page(frame_url, referer=page_url)
            except Exception as exc:
                emit("    받지 못함: %s" % exc)
                continue
            for url in extract_media(frame_url, frame_text):
                if url not in candidates:
                    candidates.append(url)

    return candidates, title


# --------------------------------------------------------------------------
# 다운로드 작업 — 여러 개를 동시에 돌릴 수 있도록 작업마다 상태를 따로 갖는다.
# --------------------------------------------------------------------------

PROGRESS_RE = re.compile(r"^\[download\]\s+(\d+(?:\.\d+)?)%")
DEST_RES = [
    re.compile(r"^\[download\] Destination: (.+)$"),
    re.compile(r'^\[Merger\] Merging formats into "(.+)"$'),
    re.compile(r"^\[download\] (.+) has already been downloaded"),
]

STATUS_LABELS = {
    "running": "받는 중",
    "done": "완료",
    "failed": "실패",
    "canceled": "취소됨",
}


class Job:
    """다운로드 1건. 워커 스레드가 쓰고 UI 가 읽으므로 상태는 잠금 아래에서만 바꾼다."""

    def __init__(self, job_id: int, kind: str, url: str = "", out_dir: str = "",
                 filename: str = "", extra: str = "") -> None:
        self.id = job_id
        self.kind = kind  # "download" | "update"
        self.url = url.strip()
        self.out_dir_raw = out_dir
        self.filename_raw = filename
        self.extra_raw = extra
        self.label = filename.strip() or self.url or "yt-dlp 업데이트"

        self.lock = threading.Lock()
        self.lines = []
        self.errors = []
        self.status = "running"
        self.code = None
        self.progress = ""
        self.proc = None
        self.cancel_requested = False

    # -- 워커 쪽 --------------------------------------------------------

    def emit(self, line: str) -> None:
        with self.lock:
            self.lines.append(line)

    def feed(self, line: str) -> None:
        """yt-dlp 출력 한 줄을 받아 진행률·파일명·오류를 갈라낸다."""
        if line.startswith("ERROR:"):
            with self.lock:
                self.errors.append(line)

        for pattern in DEST_RES:
            m = pattern.match(line)
            if m:
                with self.lock:
                    self.label = os.path.basename(m.group(1).strip())
                break

        m = PROGRESS_RE.match(line)
        if m:
            # 진행률은 초당 여러 줄씩 쏟아진다. 작업이 여러 개면 로그가 이걸로 도배되니
            # 마지막 값만 상태 칸에 보여준다.
            with self.lock:
                self.progress = line[len("[download]"):].strip()
            # yt-dlp 는 끝에 "100% of … in 00:05" 요약 줄을 따로 찍는다. 그것만 남긴다.
            if float(m.group(1)) < 100 or "ETA" in line:
                return

        self.emit(line)

    def finish(self, code: int) -> None:
        with self.lock:
            self.code = code
            self.proc = None
            if self.cancel_requested:
                self.status = "canceled"
            elif code == 0:
                self.status = "done"
                self.progress = "100%"
            else:
                self.status = "failed"

    # -- UI 쪽 ----------------------------------------------------------

    def cancel(self) -> None:
        with self.lock:
            if self.status != "running":
                return
            self.cancel_requested = True
            proc = self.proc
        if proc is not None:
            kill_process(proc)

    def since(self, offset: int):
        with self.lock:
            if offset < 0 or offset > len(self.lines):
                offset = 0
            return self.lines[offset:], len(self.lines)

    def summary(self) -> dict:
        with self.lock:
            status_text = STATUS_LABELS[self.status]
            if self.status == "failed" and self.code is not None:
                status_text += " (코드 %d)" % self.code
            return {
                "id": self.id,
                "label": self.label,
                "status": self.status,
                "status_text": status_text,
                "progress": self.progress,
                "code": self.code,
            }


def kill_process(proc) -> None:
    """yt-dlp 가 띄운 ffmpeg 까지 같이 끝낸다. 그룹째 보내지 않으면 ffmpeg 가 남는다."""
    try:
        if os.name == "posix":
            os.killpg(proc.pid, signal.SIGTERM)
        else:
            proc.terminate()
    except (OSError, ProcessLookupError):
        pass


def run_process(job: Job, cmd: list) -> int:
    """명령을 실행하고 출력을 job 에 흘려보낸다. 반환값은 종료 코드."""
    with job.lock:
        if job.cancel_requested:
            return 1

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,  # 오류도 같은 로그창에 섞어 보여준다
            text=True,
            bufsize=1,
            env=ytdlp_env(),
            # 취소할 때 자식(ffmpeg)까지 한 번에 끝내려고 프로세스 그룹을 따로 만든다
            start_new_session=(os.name == "posix"),
        )
    except OSError as exc:
        job.emit("[오류] yt-dlp 를 실행하지 못했습니다: %s" % exc)
        return 2

    with job.lock:
        job.proc = proc
        canceled = job.cancel_requested
    if canceled:  # Popen 과 취소 사이의 틈을 메운다
        kill_process(proc)

    assert proc.stdout is not None
    for line in iter(proc.stdout.readline, ""):
        job.feed(line.rstrip("\n"))
    proc.stdout.close()
    return proc.wait()


def run_download(job: Job) -> int:
    """다운로드 1건 전체 흐름. 반드시 별도 스레드에서 호출할 것."""
    url = job.url
    out_dir = resolve_output_dir(job.out_dir_raw)
    filename = clean_filename(job.filename_raw or "")

    try:
        extra = shlex.split(job.extra_raw or "")
    except ValueError as exc:
        job.emit("[오류] 추가 옵션을 해석하지 못했습니다: %s" % exc)
        return 2

    if not preflight(url, out_dir, job.emit):
        return 2

    cmd = build_command(url, out_dir, filename, extra)
    job.emit("저장 폴더: %s" % out_dir)
    job.emit("실행: %s" % " ".join(shlex.quote(c) for c in cmd))
    job.emit("-" * 60)

    code = run_process(job, cmd)

    # yt-dlp 가 모르는 사이트면 페이지를 직접 뒤져 영상 주소를 찾아 다시 넘긴다.
    with job.lock:
        unsupported = any("unsupported url" in e.lower() for e in job.errors)
        canceled = job.cancel_requested
    if code != 0 and unsupported and not canceled:
        code = run_sniff_fallback(job, url, out_dir, filename, extra)

    job.emit("-" * 60)
    with job.lock:
        canceled = job.cancel_requested
        errors = list(job.errors)
    if canceled:
        job.emit("취소했습니다.")
    elif code == 0:
        job.emit("완료 — %s 에 저장했습니다." % out_dir)
    else:
        job.emit("실패 (종료 코드 %d)" % code)
        for line in diagnose(errors):
            job.emit(line)
    return code


def run_sniff_fallback(job, page_url, out_dir, filename, extra) -> int:
    job.emit("-" * 60)
    job.emit("[2차 시도] yt-dlp 가 모르는 사이트입니다. 페이지에서 영상 주소를 찾습니다…")
    candidates, title = sniff_page(page_url, job.emit)

    if not candidates:
        job.emit("  페이지에서 영상 주소를 찾지 못했습니다.")
        return 1

    job.emit("  후보 %d개를 찾았습니다." % len(candidates))
    # 매니페스트 주소로 받으면 제목이 'master', 'playlist' 같은 이름이 된다.
    # 파일명을 안 줬으면 페이지 제목을 쓴다.
    name = filename or clean_filename(title)[:120].strip()
    if name:
        job.emit("  파일명: %s" % name.replace("%%", "%"))

    code = 1
    for i, media_url in enumerate(candidates[:3], 1):
        with job.lock:
            if job.cancel_requested:
                return code
            job.errors = []  # 새 시도의 오류로 진단해야 한다
        job.emit("-" * 60)
        job.emit("[2차 시도 %d] %s" % (i, media_url))
        # 많은 CDN 이 Referer 로 자기 사이트에서 온 요청인지 확인한다
        cmd = build_command(media_url, out_dir, name, ["--referer", page_url, *extra])
        code = run_process(job, cmd)
        if code == 0:
            return 0
    return code


def run_update(job: Job) -> int:
    if not check_ytdlp(job.emit):
        return 2
    before = ytdlp_version()
    if before:
        job.emit("현재 버전: %s" % before)
    job.emit("실행: %s -U" % YTDLP_BIN)
    job.emit("-" * 60)
    code = run_process(job, [YTDLP_BIN, "-U"])
    job.emit("-" * 60)
    if code == 0:
        job.emit("업데이트 확인 완료.")
    else:
        job.emit("업데이트 실패 (종료 코드 %d)" % code)
        job.emit("  pip 로 설치했다면: python3 -m pip install --user -U yt-dlp")
    return code


class JobManager:
    """작업 목록. 개수 제한 없이 동시에 돌린다."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.jobs = {}
        self.next_id = 1

    def _start(self, job: Job, target) -> Job:
        with self.lock:
            self.jobs[job.id] = job

        def worker() -> None:
            code = 1
            try:
                code = target(job)
            except Exception as exc:  # 스레드에서 새면 조용히 죽으므로 반드시 잡는다
                job.emit("[오류] 예기치 못한 문제: %s" % exc)
            finally:
                job.finish(code)

        threading.Thread(target=worker, daemon=True).start()
        return job

    def _new_id(self) -> int:
        with self.lock:
            job_id = self.next_id
            self.next_id += 1
            return job_id

    def start_download(self, url, out_dir, filename, extra) -> Job:
        job = Job(self._new_id(), "download", url, out_dir, filename, extra)
        return self._start(job, run_download)

    def start_update(self) -> Job:
        return self._start(Job(self._new_id(), "update"), run_update)

    def get(self, job_id):
        with self.lock:
            return self.jobs.get(job_id)

    def all(self) -> list:
        with self.lock:
            return list(self.jobs.values())

    def running(self) -> list:
        return [j for j in self.all() if j.status == "running"]

    def clear_finished(self) -> None:
        with self.lock:
            for job_id in [k for k, j in self.jobs.items() if j.status != "running"]:
                del self.jobs[job_id]

    def cancel_all(self) -> None:
        for job in self.running():
            job.cancel()


JOBS = JobManager()


# --------------------------------------------------------------------------
# tkinter GUI
# --------------------------------------------------------------------------

def make_tk_root():
    """
    tkinter 루트 창을 만들어 돌려준다. 못 쓰면 None.

    import 성공과 사용 가능은 별개다 — 화면 없는 서버에 SSH 로 붙으면
    import 는 되지만 Tk() 에서 "no display name and no $DISPLAY" 로 터진다.
    그래서 실제로 창을 만들어 보는 데까지가 가용성 판단이다.
    """
    try:
        import tkinter as tk
    except ImportError:
        return None

    try:
        return tk.Tk()
    except Exception:
        return None


def run_tk_gui(root) -> None:
    import tkinter as tk
    from tkinter import filedialog, messagebox, scrolledtext, ttk

    root.title(APP_TITLE + " (tkinter)")
    root.geometry("900x720")
    root.minsize(680, 560)

    frame = tk.Frame(root, padx=12, pady=12)
    frame.pack(fill="both", expand=True)
    frame.columnconfigure(1, weight=1)

    # --- 입력 ---
    tk.Label(frame, text="URL").grid(row=0, column=0, sticky="w", pady=4)
    url_entry = tk.Entry(frame)
    url_entry.grid(row=0, column=1, columnspan=2, sticky="ew", pady=4, padx=(8, 0))

    tk.Label(frame, text="저장 경로").grid(row=1, column=0, sticky="w", pady=4)
    dir_entry = tk.Entry(frame)
    dir_entry.insert(0, DEFAULT_OUTPUT_DIR)
    dir_entry.grid(row=1, column=1, sticky="ew", pady=4, padx=(8, 0))

    def choose_dir() -> None:
        initial = resolve_output_dir(dir_entry.get())
        if not os.path.isdir(initial):
            initial = os.path.expanduser("~")
        picked = filedialog.askdirectory(initialdir=initial, title="저장 폴더 선택")
        if picked:
            dir_entry.delete(0, "end")
            dir_entry.insert(0, picked)

    tk.Button(frame, text="찾아보기", command=choose_dir).grid(
        row=1, column=2, sticky="w", padx=(8, 0)
    )

    tk.Label(frame, text="파일명").grid(row=2, column=0, sticky="w", pady=4)
    name_entry = tk.Entry(frame)
    name_entry.grid(row=2, column=1, columnspan=2, sticky="ew", pady=4, padx=(8, 0))
    tk.Label(
        frame,
        text="비워두면 영상 원래 제목을 씁니다. 확장자는 자동으로 붙습니다.",
        fg="#666",
    ).grid(row=3, column=1, columnspan=2, sticky="w", padx=(8, 0))

    tk.Label(frame, text="추가 옵션").grid(row=4, column=0, sticky="w", pady=4)
    extra_entry = tk.Entry(frame)
    extra_entry.grid(row=4, column=1, columnspan=2, sticky="ew", pady=4, padx=(8, 0))
    tk.Label(
        frame,
        text="선택. yt-dlp 옵션을 그대로 넘깁니다. 예: --cookies-from-browser firefox",
        fg="#666",
    ).grid(row=5, column=1, columnspan=2, sticky="w", padx=(8, 0))

    # --- 실행 ---
    buttons = tk.Frame(frame)
    buttons.grid(row=6, column=0, columnspan=3, sticky="ew", pady=(12, 4))
    buttons.columnconfigure(0, weight=1)
    start_button = tk.Button(buttons, text="다운로드 추가")
    start_button.grid(row=0, column=0, sticky="ew")
    update_button = tk.Button(buttons, text="yt-dlp 업데이트")
    update_button.grid(row=0, column=1, padx=(8, 0))

    # --- 작업 목록 ---
    tree = ttk.Treeview(
        frame, columns=("status", "progress", "label"), show="headings",
        height=6, selectmode="browse",
    )
    tree.heading("status", text="상태")
    tree.heading("progress", text="진행")
    tree.heading("label", text="대상")
    tree.column("status", width=110, stretch=False)
    tree.column("progress", width=300, stretch=False)
    tree.column("label", width=360)
    tree.tag_configure("done", foreground="#1a7f37")
    tree.tag_configure("failed", foreground="#c02626")
    tree.tag_configure("canceled", foreground="#888")
    tree.grid(row=7, column=0, columnspan=3, sticky="nsew", pady=(8, 0))

    actions = tk.Frame(frame)
    actions.grid(row=8, column=0, columnspan=3, sticky="ew", pady=(4, 0))
    cancel_button = tk.Button(actions, text="선택 작업 취소")
    cancel_button.pack(side="left")
    clear_button = tk.Button(actions, text="끝난 작업 지우기")
    clear_button.pack(side="left", padx=(8, 0))

    log_title = tk.Label(frame, text="로그", anchor="w", fg="#444")
    log_title.grid(row=9, column=0, columnspan=3, sticky="ew", pady=(8, 0))

    log = scrolledtext.ScrolledText(frame, height=14, wrap="word", state="disabled")
    log.grid(row=10, column=0, columnspan=3, sticky="nsew")
    frame.rowconfigure(7, weight=1)
    frame.rowconfigure(10, weight=2)

    # 워커 스레드는 위젯을 직접 건드리면 안 된다. UI 스레드가 주기적으로 상태를 읽어 그린다.
    view = {"job": None, "offset": 0}

    def select_job(job_id) -> None:
        view["job"] = job_id
        view["offset"] = 0
        log.configure(state="normal")
        log.delete("1.0", "end")
        log.configure(state="disabled")
        if job_id is not None and tree.exists(str(job_id)):
            tree.selection_set(str(job_id))
            tree.see(str(job_id))

    def refresh() -> None:
        jobs = JOBS.all()
        alive = set()
        for job in jobs:
            s = job.summary()
            iid = str(s["id"])
            alive.add(iid)
            values = (s["status_text"], s["progress"], s["label"])
            if tree.exists(iid):
                tree.item(iid, values=values, tags=(s["status"],))
            else:
                tree.insert("", 0, iid=iid, values=values, tags=(s["status"],))
        for iid in tree.get_children():
            if iid not in alive:
                tree.delete(iid)

        job = JOBS.get(view["job"])
        if job is None:
            if view["job"] is not None:
                select_job(None)
            log_title.configure(text="로그 — 목록에서 작업을 고르세요")
        else:
            lines, view["offset"] = job.since(view["offset"])
            if lines:
                # 사용자가 위로 스크롤해 읽는 중이면 따라가지 않는다
                stick = log.yview()[1] >= 0.999
                log.configure(state="normal")
                log.insert("end", "\n".join(lines) + "\n")
                log.configure(state="disabled")
                if stick:
                    log.see("end")
            log_title.configure(text="로그 — %s" % job.summary()["label"])

        n = len([j for j in jobs if j.status == "running"])
        start_button.configure(
            text="다운로드 추가" + (" (진행 중 %d개)" % n if n else "")
        )
        root.after(300, refresh)

    def on_select(_event=None) -> None:
        sel = tree.selection()
        if sel and sel[0] != str(view["job"]):
            select_job(int(sel[0]))

    def on_start() -> None:
        if not url_entry.get().strip():
            url_entry.focus_set()
            return
        job = JOBS.start_download(
            url_entry.get(), dir_entry.get(), name_entry.get(), extra_entry.get()
        )
        # 바로 다음 주소를 넣을 수 있게 비운다. 저장 경로·추가 옵션은 유지.
        url_entry.delete(0, "end")
        name_entry.delete(0, "end")
        url_entry.focus_set()
        refresh_once(job.id)

    def refresh_once(job_id) -> None:
        s = JOBS.get(job_id).summary()
        if not tree.exists(str(job_id)):
            tree.insert("", 0, iid=str(job_id),
                        values=(s["status_text"], s["progress"], s["label"]))
        select_job(job_id)

    def on_update() -> None:
        refresh_once(JOBS.start_update().id)

    def on_cancel() -> None:
        job = JOBS.get(view["job"])
        if job is not None:
            job.cancel()

    def on_close() -> None:
        n = len(JOBS.running())
        if n and not messagebox.askokcancel(
            APP_TITLE, "진행 중인 작업 %d개를 취소하고 종료할까요?" % n
        ):
            return
        JOBS.cancel_all()
        root.destroy()

    start_button.configure(command=on_start)
    update_button.configure(command=on_update)
    cancel_button.configure(command=on_cancel)
    clear_button.configure(command=JOBS.clear_finished)
    tree.bind("<<TreeviewSelect>>", on_select)
    url_entry.bind("<Return>", lambda _event: on_start())
    name_entry.bind("<Return>", lambda _event: on_start())
    root.protocol("WM_DELETE_WINDOW", on_close)
    url_entry.focus_set()

    root.after(300, refresh)
    root.mainloop()


# --------------------------------------------------------------------------
# 웹 GUI (표준 라이브러리 http.server 만 사용)
# --------------------------------------------------------------------------

PAGE = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
                 "Noto Sans KR", "Malgun Gothic", sans-serif;
    font-size: 14px; line-height: 1.5;
    background: #14161a; color: #e6e9ef;
  }
  .wrap { max-width: 860px; margin: 0 auto; }
  h1 { font-size: 17px; margin: 0 0 4px; }
  .sub { color: #8b93a3; font-size: 12.5px; margin: 0 0 20px; }
  label { display: block; font-size: 12.5px; color: #8b93a3; margin-bottom: 4px; }
  .row { margin-bottom: 14px; }
  input[type=text] {
    width: 100%; padding: 10px 12px; border-radius: 8px;
    border: 1px solid #2c313c; background: #1c1f26; color: #e6e9ef;
    font-size: 14px; font-family: inherit;
  }
  input[type=text]:focus { outline: none; border-color: #4c8dff; }
  .hint { color: #6f7788; font-size: 11.5px; margin-top: 4px; }
  code { color: #c6cbd6; }
  .btns { display: flex; gap: 8px; }
  button {
    padding: 11px 14px; border-radius: 8px; border: none;
    background: #4c8dff; color: #fff; font-size: 14px; font-weight: 600;
    font-family: inherit; cursor: pointer;
  }
  button.secondary { background: #2c313c; color: #e6e9ef; font-weight: 500; }
  button.small { padding: 4px 10px; font-size: 12px; }
  #go { flex: 1; }
  .section { margin: 20px 0 8px; display: flex; align-items: center; gap: 8px;
             font-size: 13px; color: #8b93a3; }
  .section span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #jobs { border: 1px solid #2c313c; border-radius: 8px; overflow: hidden; }
  #jobs:empty::before { content: '아직 작업이 없습니다'; display: block;
                        padding: 12px; color: #6f7788; font-size: 12.5px; }
  .job { display: grid; grid-template-columns: 92px 1fr auto; gap: 10px;
         align-items: center; padding: 8px 12px; border-top: 1px solid #2c313c;
         cursor: pointer; }
  .job:first-child { border-top: none; }
  .job:hover { background: #1c1f26; }
  .job.sel { background: #1d2a44; }
  .job .st { font-size: 12.5px; color: #8b93a3; }
  .job.done .st { color: #3fb950; } .job.failed .st { color: #ff6b6b; }
  .job.canceled .st { color: #6f7788; }
  .job .main { min-width: 0; }
  .job .label, .job .prog { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .job .prog { font-size: 11.5px; color: #6f7788;
               font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  pre {
    background: #0e1013; border: 1px solid #2c313c; border-radius: 8px;
    padding: 12px; height: 340px; overflow: auto; margin: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px; white-space: pre-wrap; word-break: break-all;
  }
</style>
</head>
<body>
<div class="wrap">
  <h1>__TITLE__</h1>
  <p class="sub">웹 GUI 모드 — tkinter 를 쓸 수 없어 브라우저로 띄웠습니다.</p>

  <div class="row">
    <label for="url">URL</label>
    <input type="text" id="url" placeholder="영상 주소를 붙여넣으세요" autofocus>
  </div>

  <div class="row">
    <label for="dir">저장 경로</label>
    <input type="text" id="dir" value="__DEFAULT_DIR__">
    <div class="hint">없는 폴더면 자동으로 만듭니다. <code>~</code> 도 씁니다.</div>
  </div>

  <div class="row">
    <label for="name">파일명</label>
    <input type="text" id="name" placeholder="비워두면 영상 원래 제목을 사용">
    <div class="hint">확장자는 자동으로 붙습니다.</div>
  </div>

  <div class="row">
    <label for="extra">추가 옵션</label>
    <input type="text" id="extra" placeholder="선택 — 예: --cookies-from-browser firefox">
    <div class="hint">yt-dlp 옵션을 그대로 넘깁니다.</div>
  </div>

  <div class="btns">
    <button id="go">다운로드 추가</button>
    <button id="update" class="secondary">yt-dlp 업데이트</button>
  </div>

  <div class="section">
    <span>작업 목록 — 받는 중에도 계속 추가할 수 있습니다</span>
    <button id="clear" class="secondary small">끝난 작업 지우기</button>
  </div>
  <div id="jobs"></div>

  <div class="section"><span id="logtitle">로그 — 목록에서 작업을 고르세요</span></div>
  <pre id="log"></pre>
</div>

<script>
  var selected = null, offset = 0;
  var $ = function (id) { return document.getElementById(id); };
  var logEl = $('log'), jobsEl = $('jobs');

  function post(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.json(); });
  }

  function select(id) {
    if (selected === id) return;
    selected = id; offset = 0; logEl.textContent = '';
    renderSelection();
  }

  function renderSelection() {
    Array.prototype.forEach.call(jobsEl.children, function (el) {
      el.classList.toggle('sel', Number(el.dataset.id) === selected);
    });
  }

  function renderJobs(jobs) {
    var ids = {};
    jobs.forEach(function (j) {
      ids[j.id] = true;
      var el = jobsEl.querySelector('[data-id="' + j.id + '"]');
      if (!el) {
        el = document.createElement('div');
        el.dataset.id = j.id;
        el.innerHTML = '<div class="st"></div><div class="main">' +
          '<div class="label"></div><div class="prog"></div></div>' +
          '<button class="secondary small cancel">취소</button>';
        el.addEventListener('click', function () { select(j.id); });
        el.querySelector('.cancel').addEventListener('click', function (e) {
          e.stopPropagation();
          post('/cancel', { id: j.id });
        });
        jobsEl.insertBefore(el, jobsEl.firstChild);
      }
      el.className = 'job ' + j.status + (j.id === selected ? ' sel' : '');
      el.querySelector('.st').textContent = j.status_text;
      el.querySelector('.label').textContent = j.label;
      el.querySelector('.label').title = j.label;
      el.querySelector('.prog').textContent = j.progress;
      el.querySelector('.cancel').style.visibility =
        j.status === 'running' ? 'visible' : 'hidden';
      if (j.id === selected) $('logtitle').textContent = '로그 — ' + j.label;
    });
    Array.prototype.slice.call(jobsEl.children).forEach(function (el) {
      if (!ids[el.dataset.id]) el.remove();
    });
    if (selected !== null && !ids[selected]) {
      selected = null; logEl.textContent = '';
      $('logtitle').textContent = '로그 — 목록에서 작업을 고르세요';
    }
  }

  function append(lines) {
    if (!lines.length) return;
    // 사용자가 위로 스크롤해 읽는 중이면 따라가지 않는다
    var stick = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 30;
    logEl.textContent += lines.join('\\n') + '\\n';
    if (stick) logEl.scrollTop = logEl.scrollHeight;
  }

  function tick() {
    var jobsReq = fetch('/jobs').then(function (r) { return r.json(); })
      .then(function (d) { renderJobs(d.jobs); });
    var logReq = Promise.resolve();
    if (selected !== null) {
      var want = selected;
      logReq = fetch('/log?id=' + want + '&offset=' + offset)
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (want !== selected || !d.ok) return;  // 그 사이 다른 작업을 골랐다
          append(d.lines);
          offset = d.next;
        });
    }
    Promise.all([jobsReq, logReq])
      .catch(function () {})
      .then(function () { setTimeout(tick, 500); });
  }

  function start() {
    var url = $('url').value.trim();
    if (!url) { $('url').focus(); return; }
    post('/start', {
      url: url, dir: $('dir').value, name: $('name').value, extra: $('extra').value
    }).then(function (d) {
      if (d.ok) select(d.id);
    });
    // 바로 다음 주소를 넣을 수 있게 비운다. 저장 경로·추가 옵션은 유지.
    $('url').value = ''; $('name').value = ''; $('url').focus();
  }

  $('go').addEventListener('click', start);
  $('update').addEventListener('click', function () {
    post('/update').then(function (d) { if (d.ok) select(d.id); });
  });
  $('clear').addEventListener('click', function () { post('/clear'); });
  ['url', 'name'].forEach(function (id) {
    $(id).addEventListener('keydown', function (e) {
      if (e.key === 'Enter') start();
    });
  });
  tick();
</script>
</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    server_version = "ytdlp-gui"

    def log_message(self, fmt, *args) -> None:
        """기본 구현은 요청마다 터미널에 찍어 로그를 어지럽힌다. 끈다."""
        return

    # -- 응답 헬퍼 --------------------------------------------------------

    def _send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, payload: dict, code: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._send(code, body, "application/json; charset=utf-8")

    def _job_from(self, raw):
        try:
            return JOBS.get(int(raw))
        except (TypeError, ValueError):
            return None

    # -- 라우팅 -----------------------------------------------------------

    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/":
            page = (
                PAGE.replace("__TITLE__", html.escape(APP_TITLE))
                .replace("__DEFAULT_DIR__", html.escape(DEFAULT_OUTPUT_DIR, quote=True))
            )
            self._send(200, page.encode("utf-8"), "text/html; charset=utf-8")
            return

        if parsed.path == "/jobs":
            self._send_json({"jobs": [j.summary() for j in JOBS.all()]})
            return

        if parsed.path == "/log":
            query = parse_qs(parsed.query)
            job = self._job_from(query.get("id", [""])[0])
            if job is None:
                self._send_json({"ok": False, "error": "없는 작업"}, 404)
                return
            try:
                offset = int(query.get("offset", ["0"])[0])
            except ValueError:
                offset = 0
            lines, total = job.since(offset)
            self._send_json({"ok": True, "lines": lines, "next": total})
            return

        self._send(404, b"not found", "text/plain; charset=utf-8")

    def do_POST(self) -> None:
        path = urlparse(self.path).path

        try:
            length = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except (ValueError, UnicodeDecodeError):
            self._send_json({"ok": False, "error": "잘못된 요청"}, 400)
            return

        if path == "/start":
            job = JOBS.start_download(
                str(payload.get("url", "")),
                str(payload.get("dir", "")),
                str(payload.get("name", "")),
                str(payload.get("extra", "")),
            )
            self._send_json({"ok": True, "id": job.id})
            return

        if path == "/update":
            self._send_json({"ok": True, "id": JOBS.start_update().id})
            return

        if path == "/cancel":
            job = self._job_from(payload.get("id"))
            if job is not None:
                job.cancel()
            self._send_json({"ok": job is not None})
            return

        if path == "/clear":
            JOBS.clear_finished()
            self._send_json({"ok": True})
            return

        self._send(404, b"not found", "text/plain; charset=utf-8")


def run_web_gui(port: int = 0, open_browser: bool = True) -> None:
    # 127.0.0.1 로만 묶는다. 같은 네트워크의 다른 기기에 노출되면 안 된다.
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    actual_port = server.server_address[1]
    url = "http://127.0.0.1:%d/" % actual_port

    print("  주소:      %s" % url)
    print("  멈추려면:  Ctrl+C")
    print()
    print("  화면 없는 서버라 브라우저가 안 열리면, 로컬 PC 에서 아래처럼 터널을 뚫고")
    print("  브라우저로 http://127.0.0.1:%d/ 에 접속하세요:" % actual_port)
    print("      ssh -L %d:127.0.0.1:%d <이 서버 주소>" % (actual_port, actual_port))
    print()
    sys.stdout.flush()

    if open_browser:
        # 브라우저가 없는 환경에서는 조용히 실패한다. 위에 주소를 찍어 뒀으니 괜찮다.
        threading.Thread(target=lambda: webbrowser.open(url), daemon=True).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n종료합니다.")
    finally:
        # yt-dlp 는 별도 프로세스 그룹이라 우리가 죽어도 남는다. 직접 정리한다.
        JOBS.cancel_all()
        server.server_close()


# --------------------------------------------------------------------------
# 진입점
# --------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description=APP_TITLE)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--web", action="store_true", help="웹 GUI 강제")
    mode.add_argument("--tk", action="store_true", help="tkinter 강제")
    parser.add_argument("--port", type=int, default=0, help="웹 GUI 포트 (기본: 임의)")
    parser.add_argument(
        "--no-browser", action="store_true", help="브라우저를 자동으로 열지 않음"
    )
    args = parser.parse_args()

    print("=" * 62)
    print("  %s" % APP_TITLE)
    print("  yt-dlp: %s" % YTDLP_BIN)
    print("  ffmpeg: %s" % FFMPEG_DIR)

    if not os.path.isfile(YTDLP_BIN):
        print("  경고:   yt-dlp 를 찾지 못했습니다. 다운로드는 실패합니다.")

    if args.web:
        print("  GUI:    웹 (--web 으로 지정)")
        print("=" * 62)
        run_web_gui(args.port, not args.no_browser)
        return 0

    root = make_tk_root()

    if root is None and args.tk:
        print("  GUI:    실패 — tkinter 를 쓸 수 없습니다 (--tk 로 강제했음)")
        print("=" * 62)
        print("--web 을 쓰거나 옵션 없이 실행하면 웹 GUI 로 자동 전환됩니다.")
        return 1

    if root is None:
        print("  GUI:    웹 (tkinter 를 쓸 수 없어 자동 전환)")
        print("=" * 62)
        run_web_gui(args.port, not args.no_browser)
        return 0

    print("  GUI:    tkinter (창이 떴습니다)")
    print("=" * 62)
    run_tk_gui(root)
    return 0


if __name__ == "__main__":
    sys.exit(main())
