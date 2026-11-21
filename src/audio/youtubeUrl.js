const YOUTUBE_HOSTS = new Set([
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'music.youtube.com',
    'youtube-nocookie.com',
    'www.youtube-nocookie.com',
    'youtu.be',
]);

const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const PATH_VIDEO_KEYS = new Set(['shorts', 'embed', 'live', 'v']);

function extractVideoId(url) {
    if (url.hostname.toLowerCase() === 'youtu.be') {
        const id = url.pathname.split('/').filter(Boolean)[0];
        return VIDEO_ID_PATTERN.test(id ?? '') ? id : null;
    }

    const queryId = url.searchParams.get('v');

    if (queryId && VIDEO_ID_PATTERN.test(queryId)) {
        return queryId;
    }

    const segments = url.pathname.split('/').filter(Boolean);

    if (PATH_VIDEO_KEYS.has(segments[0])) {
        const id = segments[1];
        return VIDEO_ID_PATTERN.test(id ?? '') ? id : null;
    }

    return null;
}

export function parseYouTubeUrl(rawUrl) {
    const trimmed = String(rawUrl ?? '').trim();

    if (!trimmed) {
        throw new Error('YouTube 링크를 입력해 주세요.');
    }

    let url;

    try {
        url = new URL(
            /^https?:\/\//i.test(trimmed)
                ? trimmed
                : `https://${trimmed}`
        );
    } catch {
        throw new Error('올바른 YouTube 링크가 아닙니다.');
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('올바른 YouTube 링크가 아닙니다.');
    }

    if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) {
        throw new Error('YouTube 링크만 사용할 수 있습니다.');
    }

    const videoId = extractVideoId(url);

    if (!videoId) {
        throw new Error('올바른 YouTube 영상 링크가 아닙니다.');
    }

    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

    return {
        videoId,
        canonicalUrl,
        url: url.toString(),
    };
}

export async function fetchYouTubeTitle(canonicalUrl) {
    try {
        const response = await fetch(
            `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(canonicalUrl)}`
        );

        if (!response.ok) {
            return null;
        }

        const data = await response.json();

        return typeof data.title === 'string' ? data.title : null;
    } catch {
        return null;
    }
}
