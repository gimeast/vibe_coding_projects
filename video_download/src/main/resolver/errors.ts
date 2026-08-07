/**
 * yt-dlp 의 stderr 를 사람이 읽을 수 있는 안내문으로 옮긴다.
 *
 * 원문을 그대로 노출하면 대부분 사용자에게 무의미하다. 다만 매칭에 실패했을 때는
 * 원문 마지막 줄을 남겨야 디버깅이 가능하므로 잘라서 덧붙인다.
 */

interface Rule {
  match: RegExp
  message: string
}

const RULES: Rule[] = [
  {
    match: /DRM|drm_protected|widevine/i,
    message:
      'DRM 으로 보호된 영상입니다. 이 앱은 DRM 우회를 지원하지 않습니다.',
  },
  {
    match: /Private video|This video is private/i,
    message: '비공개 영상입니다. 접근 권한이 있는 계정으로 로그인해야 합니다.',
  },
  {
    match: /Sign in to confirm|age.?restricted|confirm your age/i,
    message: '연령 확인이 필요한 영상입니다. 로그인이 필요합니다.',
  },
  {
    match: /members-only|available to (this channel's )?members/i,
    message: '멤버십 전용 영상입니다.',
  },
  {
    match: /Video unavailable|has been removed|no longer available/i,
    message: '더 이상 제공되지 않는 영상입니다.',
  },
  {
    match: /geo.?restricted|not available in your country|blocked it in your country/i,
    message: '지역 제한으로 접근할 수 없는 영상입니다.',
  },
  // 버전 노후 판정은 아래 일반 규칙들보다 먼저 와야 한다.
  // 추출기가 낡으면 최종 에러가 "Requested format is not available" 로 나와서,
  // 순서를 뒤로 두면 "다른 화질을 고르세요" 라는 엉뚱한 안내가 나간다.
  {
    match:
      /nsig extraction failed|Signature extraction failed|Only images are available|SABR|player response|Falling back to generic n function/i,
    message:
      '사이트가 바뀌어 추출에 실패했습니다. yt-dlp 버전이 오래됐을 가능성이 높습니다 — 아래 "업데이트" 를 눌러 주세요.',
  },
  {
    match: /Unsupported URL/i,
    message: 'yt-dlp 가 지원하지 않는 사이트입니다.',
  },
  {
    match: /Unable to download webpage|Failed to resolve|getaddrinfo|ENOTFOUND/i,
    message: '페이지를 불러오지 못했습니다. URL 과 네트워크 연결을 확인해 주세요.',
  },
  {
    match: /HTTP Error 404/i,
    message: '페이지를 찾을 수 없습니다 (404).',
  },
  {
    match: /HTTP Error 40[13]/i,
    message: '접근이 거부되었습니다. 로그인이 필요한 페이지일 수 있습니다.',
  },
  {
    match: /HTTP Error 429|Too Many Requests/i,
    message: '요청이 너무 잦아 사이트가 일시적으로 차단했습니다. 잠시 후 다시 시도해 주세요.',
  },
  {
    match: /Requested format is not available/i,
    message: '선택한 화질을 제공하지 않습니다. 다른 프리셋이나 포맷을 골라 주세요.',
  },
  {
    match: /ffmpeg (is )?not (installed|found)|ffprobe/i,
    message: 'ffmpeg 를 찾지 못해 병합에 실패했습니다. 설치 상태를 확인해 주세요.',
  },
]

/** stderr 에서 의미 있는 마지막 줄만 뽑는다. */
function lastMeaningfulLine(stderr: string): string {
  const lines = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^\s*$/.test(l))

  const errorLine = [...lines].reverse().find((l) => /^ERROR/i.test(l))
  const line = errorLine ?? lines[lines.length - 1] ?? ''
  return line.replace(/^ERROR:\s*/i, '').slice(0, 300)
}

export function humanizeYtdlpError(stderr: string): string {
  for (const rule of RULES) {
    if (rule.match.test(stderr)) return rule.message
  }

  const raw = lastMeaningfulLine(stderr)
  return raw ? `다운로드에 실패했습니다: ${raw}` : '알 수 없는 이유로 실패했습니다.'
}
