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
import html
import json
import os
import subprocess
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

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


# --------------------------------------------------------------------------
# 핵심 — 명령 구성과 실시간 출력 스트리밍
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


def build_command(url: str, out_dir: str, filename: str) -> list:
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
        url,
    ]


def resolve_output_dir(raw: str) -> str:
    """`~` 를 실제 경로로 펴고, 비어 있으면 기본값을 쓴다."""
    raw = (raw or "").strip()
    if not raw:
        return DEFAULT_OUTPUT_DIR
    return os.path.abspath(os.path.expanduser(raw))


def preflight(url: str, out_dir: str, emit) -> bool:
    """실행 전 확인. 문제가 있으면 이유를 로그에 남기고 False."""
    if not url.strip():
        emit("[오류] URL 을 입력해 주세요.")
        return False

    if not os.path.isfile(YTDLP_BIN):
        emit("[오류] yt-dlp 를 찾지 못했습니다: %s" % YTDLP_BIN)
        emit("       설치 위치가 다르면 YTDLP_BIN 환경변수로 지정할 수 있습니다.")
        return False

    if not os.access(YTDLP_BIN, os.X_OK):
        emit("[오류] yt-dlp 에 실행 권한이 없습니다: %s" % YTDLP_BIN)
        emit("       chmod +x %s" % YTDLP_BIN)
        return False

    try:
        os.makedirs(out_dir, exist_ok=True)  # mkdir -p 와 같은 효과
    except OSError as exc:
        emit("[오류] 저장 폴더를 만들지 못했습니다: %s" % exc)
        return False

    return True


def run_download(url: str, out_dir_raw: str, filename_raw: str, emit) -> int:
    """
    yt-dlp 를 실행하고 출력을 한 줄씩 emit 으로 흘려보낸다.
    반드시 별도 스레드에서 호출할 것. 반환값은 종료 코드.
    """
    url = url.strip()
    out_dir = resolve_output_dir(out_dir_raw)
    filename = clean_filename(filename_raw or "")

    if not preflight(url, out_dir, emit):
        return 2

    cmd = build_command(url, out_dir, filename)

    emit("저장 폴더: %s" % out_dir)
    emit("실행: %s" % " ".join(cmd))
    emit("-" * 60)

    env = dict(os.environ)
    # yt-dlp 도 파이썬이라, 출력이 파이프로 가면 블록 버퍼링이 걸려
    # 로그가 실시간으로 흐르지 않고 뭉쳐서 튀어나온다.
    env["PYTHONUNBUFFERED"] = "1"
    # yt-dlp 가 내부적으로 ffmpeg 를 찾을 때를 위한 보조 장치.
    env["PATH"] = FFMPEG_DIR + os.pathsep + env.get("PATH", "")

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,  # 오류도 같은 로그창에 섞어 보여준다
            text=True,
            bufsize=1,
            env=env,
        )
    except OSError as exc:
        emit("[오류] yt-dlp 를 실행하지 못했습니다: %s" % exc)
        return 2

    assert proc.stdout is not None
    for line in iter(proc.stdout.readline, ""):
        emit(line.rstrip("\n"))
    proc.stdout.close()

    code = proc.wait()
    emit("-" * 60)
    if code == 0:
        emit("완료 — %s 에 저장했습니다." % out_dir)
    else:
        emit("실패 (종료 코드 %d)" % code)
    return code


def start_download_thread(url, out_dir, filename, on_line, on_done) -> threading.Thread:
    """다운로드를 백그라운드 스레드로 띄운다. 화면이 멈추지 않게 하기 위함."""

    def worker() -> None:
        code = 1
        try:
            code = run_download(url, out_dir, filename, on_line)
        except Exception as exc:  # 스레드에서 새면 조용히 죽으므로 반드시 잡는다
            on_line("[오류] 예기치 못한 문제: %s" % exc)
        finally:
            on_done(code)

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    return thread


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
    from tkinter import filedialog, scrolledtext

    root.title(APP_TITLE + " (tkinter)")
    root.geometry("820x600")
    root.minsize(640, 460)

    state = {"running": False}

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

    # --- 실행 ---
    button = tk.Button(frame, text="다운로드")
    button.grid(row=4, column=0, columnspan=3, sticky="ew", pady=(12, 4))

    status = tk.Label(frame, text="대기 중", anchor="w", fg="#444")
    status.grid(row=5, column=0, columnspan=3, sticky="ew")

    log = scrolledtext.ScrolledText(frame, height=18, wrap="word", state="disabled")
    log.grid(row=6, column=0, columnspan=3, sticky="nsew", pady=(8, 0))
    frame.rowconfigure(6, weight=1)

    # 워커 스레드는 위젯을 직접 건드리면 안 된다. 큐에 쌓고 UI 스레드가 꺼내 쓴다.
    import queue as queue_mod

    pending = queue_mod.Queue()

    def append(line: str) -> None:
        log.configure(state="normal")
        log.insert("end", line + "\n")
        log.see("end")
        log.configure(state="disabled")

    def drain() -> None:
        try:
            while True:
                kind, payload = pending.get_nowait()
                if kind == "line":
                    append(payload)
                else:
                    state["running"] = False
                    button.configure(state="normal", text="다운로드")
                    if payload == 0:
                        status.configure(text="완료", fg="#1a7f37")
                    else:
                        status.configure(text="실패 (코드 %d)" % payload, fg="#c02626")
        except queue_mod.Empty:
            pass
        root.after(100, drain)

    def on_start() -> None:
        if state["running"]:
            return
        state["running"] = True

        log.configure(state="normal")
        log.delete("1.0", "end")
        log.configure(state="disabled")

        button.configure(state="disabled", text="받는 중…")
        status.configure(text="다운로드 중…", fg="#444")

        start_download_thread(
            url_entry.get(),
            dir_entry.get(),
            name_entry.get(),
            lambda line: pending.put(("line", line)),
            lambda code: pending.put(("done", code)),
        )

    button.configure(command=on_start)
    url_entry.bind("<Return>", lambda _event: on_start())
    name_entry.bind("<Return>", lambda _event: on_start())
    url_entry.focus_set()

    root.after(100, drain)
    root.mainloop()


# --------------------------------------------------------------------------
# 웹 GUI (표준 라이브러리 http.server 만 사용)
# --------------------------------------------------------------------------

class WebState:
    """웹 GUI 가 공유하는 상태. 여러 요청 스레드가 동시에 건드리므로 잠근다."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.lines = []
        self.running = False
        self.code = None

    def reset(self) -> None:
        with self.lock:
            self.lines = []
            self.running = True
            self.code = None

    def add(self, line: str) -> None:
        with self.lock:
            self.lines.append(line)

    def finish(self, code: int) -> None:
        with self.lock:
            self.running = False
            self.code = code

    def since(self, offset: int):
        with self.lock:
            if offset < 0 or offset > len(self.lines):
                offset = 0
            return self.lines[offset:], len(self.lines), self.running, self.code


WEB_STATE = WebState()

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
  button {
    width: 100%; padding: 11px; border-radius: 8px; border: none;
    background: #4c8dff; color: #fff; font-size: 14px; font-weight: 600;
    font-family: inherit; cursor: pointer;
  }
  button:disabled { opacity: .5; cursor: default; }
  #status { margin: 14px 0 8px; font-size: 13px; color: #8b93a3; }
  #status.ok { color: #3fb950; } #status.bad { color: #ff6b6b; }
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

  <button id="go">다운로드</button>
  <div id="status">대기 중</div>
  <pre id="log"></pre>
</div>

<script>
  var offset = 0;
  var go = document.getElementById('go');
  var logEl = document.getElementById('log');
  var statusEl = document.getElementById('status');

  function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = cls || '';
  }

  function append(lines) {
    if (!lines.length) return;
    // 사용자가 위로 스크롤해 읽는 중이면 따라가지 않는다
    var stick = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 30;
    logEl.textContent += lines.join('\\n') + '\\n';
    if (stick) logEl.scrollTop = logEl.scrollHeight;
  }

  function poll() {
    fetch('/log?offset=' + offset)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        append(d.lines);
        offset = d.next;
        if (d.running) {
          setTimeout(poll, 300);
        } else {
          go.disabled = false;
          go.textContent = '다운로드';
          if (d.code === 0) setStatus('완료', 'ok');
          else setStatus('실패 (종료 코드 ' + d.code + ')', 'bad');
        }
      })
      .catch(function () { setTimeout(poll, 1000); });
  }

  function start() {
    if (go.disabled) return;
    go.disabled = true;
    go.textContent = '받는 중…';
    setStatus('다운로드 중…');
    logEl.textContent = '';
    offset = 0;

    fetch('/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: document.getElementById('url').value,
        dir: document.getElementById('dir').value,
        name: document.getElementById('name').value
      })
    })
      .then(function (r) { return r.json(); })
      .then(function () { poll(); })
      .catch(function (e) {
        go.disabled = false;
        go.textContent = '다운로드';
        setStatus('요청 실패: ' + e, 'bad');
      });
  }

  go.addEventListener('click', start);
  ['url', 'name'].forEach(function (id) {
    document.getElementById(id).addEventListener('keydown', function (e) {
      if (e.key === 'Enter') start();
    });
  });
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

        if parsed.path == "/log":
            raw = parse_qs(parsed.query).get("offset", ["0"])[0]
            try:
                offset = int(raw)
            except ValueError:
                offset = 0
            lines, total, running, code = WEB_STATE.since(offset)
            self._send_json(
                {"lines": lines, "next": total, "running": running, "code": code}
            )
            return

        self._send(404, b"not found", "text/plain; charset=utf-8")

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/start":
            self._send(404, b"not found", "text/plain; charset=utf-8")
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except (ValueError, UnicodeDecodeError):
            self._send_json({"ok": False, "error": "잘못된 요청"}, 400)
            return

        with WEB_STATE.lock:
            if WEB_STATE.running:
                self._send_json({"ok": False, "error": "이미 실행 중입니다"}, 409)
                return

        WEB_STATE.reset()
        start_download_thread(
            str(payload.get("url", "")),
            str(payload.get("dir", "")),
            str(payload.get("name", "")),
            WEB_STATE.add,
            WEB_STATE.finish,
        )
        self._send_json({"ok": True})


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
