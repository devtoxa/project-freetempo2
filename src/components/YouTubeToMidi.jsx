import { useEffect, useRef, useState } from 'react';
import { useData } from '../stores/useData';
import {
    decodeAndResample,
    getAudioRms,
    transcribeSamples,
} from '../audio/transcribeAudio';
import {
    TAB_AUDIO_MAX_SECONDS,
    isTabAudioCaptureSupported,
    startTabAudioCapture,
} from '../audio/tabAudioCapture';
import { fetchYouTubeTitle, parseYouTubeUrl } from '../audio/youtubeUrl';

const BUSY_STATUSES = new Set([
    'starting',
    'recording',
    'stopping',
    'converting',
]);

function formatSeconds(value) {
    const total = Math.max(0, Math.round(value));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function safeFilename(filename) {
    return filename.replace(/[\\/:*?"<>|]/g, '_');
}

export default function YouTubeToMidi() {
    const addLocalMidi = useData((state) => state.addLocalMidi);
    const [supported] = useState(() => isTabAudioCaptureSupported());
    const [url, setUrl] = useState('');
    const [videoTitle, setVideoTitle] = useState('');
    const [status, setStatus] = useState('idle');
    const [elapsed, setElapsed] = useState(0);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);
    const captureRef = useRef(null);
    const mountedRef = useRef(true);
    const videoTitleRef = useRef('');

    useEffect(() => {
        return () => {
            mountedRef.current = false;
            captureRef.current?.stop();
        };
    }, []);

    if (!supported) {
        return null;
    }

    const isBusy = BUSY_STATUSES.has(status);
    const canUseLink = Boolean(url.trim());

    const applyVideoTitle = (title) => {
        if (!title) return;

        videoTitleRef.current = title;

        if (mountedRef.current) {
            setVideoTitle(title);
        }
    };

    const handleUrlChange = (event) => {
        setUrl(event.target.value);
        setVideoTitle('');
        videoTitleRef.current = '';
        setError('');

        if (!BUSY_STATUSES.has(status)) {
            setStatus('idle');
            setResult(null);
            setProgress(0);
            setElapsed(0);
        }
    };

    const handleOpen = () => {
        let parsed;

        try {
            parsed = parseYouTubeUrl(url);
        } catch (err) {
            setError(err.message);
            return;
        }

        setError('');
        window.open(parsed.canonicalUrl, '_blank', 'noopener,noreferrer');

        fetchYouTubeTitle(parsed.canonicalUrl).then(applyVideoTitle);
    };

    const handleCapture = async () => {
        if (isBusy) return;

        let parsed;

        try {
            parsed = parseYouTubeUrl(url);
        } catch (err) {
            setError(err.message);
            return;
        }

        setError('');
        setResult(null);
        setProgress(0);
        setElapsed(0);
        setStatus('starting');

        if (!videoTitleRef.current) {
            fetchYouTubeTitle(parsed.canonicalUrl).then(applyVideoTitle);
        }

        let controller;

        try {
            controller = await startTabAudioCapture({
                maxSeconds: TAB_AUDIO_MAX_SECONDS,
                onTick: (value) => {
                    if (mountedRef.current) {
                        setElapsed(value);
                    }
                },
            });
        } catch (err) {
            if (!mountedRef.current) return;

            setStatus('error');
            setError(
                err?.message || '탭 오디오 녹음을 시작하지 못했습니다.'
            );
            return;
        }

        if (!mountedRef.current) {
            controller.stop();
            return;
        }

        captureRef.current = controller;
        setStatus('recording');

        try {
            const file = await controller.done;

            captureRef.current = null;

            if (!mountedRef.current) return;

            setStatus('converting');

            const audio = await decodeAndResample(file);

            if (getAudioRms(audio.samples) < 0.001) {
                throw new Error(
                    "소리가 감지되지 않았습니다. YouTube 탭과 '탭 오디오 공유'를 확인해 주세요."
                );
            }

            const transcribed = await transcribeSamples(audio.samples, {
                duration: audio.duration,
                onProgress: (value) => {
                    if (mountedRef.current) {
                        setProgress(value);
                    }
                },
            });

            if (!mountedRef.current) return;

            const baseTitle =
                videoTitleRef.current.trim() || 'YouTube 오디오';
            const title = `${baseTitle} (YouTube→MIDI)`;
            const blob = new Blob([transcribed.midiBytes], {
                type: 'audio/midi',
            });
            const objectUrl = URL.createObjectURL(blob);

            addLocalMidi({
                title,
                artist: 'YouTube → MIDI',
                url: objectUrl,
            });

            setProgress(1);
            setStatus('done');
            setResult({
                title,
                url: objectUrl,
                noteCount: transcribed.notes.length,
                truncated: audio.truncated,
                downloadName: `${safeFilename(baseTitle)}.mid`,
            });
        } catch (err) {
            captureRef.current = null;

            if (!mountedRef.current) return;

            setStatus('error');
            setError(
                err?.name === 'EncodingError'
                    ? '녹음한 오디오를 디코딩할 수 없습니다. Chrome/Edge에서 다시 시도해 주세요.'
                    : err?.message || 'YouTube 오디오 변환에 실패했습니다.'
            );
        }
    };

    const handleStop = () => {
        if (!captureRef.current) return;

        setStatus('stopping');
        captureRef.current.stop();
    };

    const handleDownload = () => {
        if (!result?.url || !result.downloadName) return;

        const anchor = document.createElement('a');
        anchor.href = result.url;
        anchor.download = result.downloadName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    };

    return (
        <div className="YouTubeToMidi">
            <div className="Key">[YouTube → MIDI]</div>
            <div className="Value">
                <div className="youtube-to-midi-row">
                    <input
                        type="url"
                        inputMode="url"
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={url}
                        onChange={handleUrlChange}
                        disabled={isBusy}
                    />
                    <button
                        type="button"
                        onClick={handleOpen}
                        disabled={isBusy || !canUseLink}
                    >
                        열기
                    </button>
                </div>

                <div className="youtube-to-midi-actions">
                    {status === 'recording' ? (
                        <button type="button" onClick={handleStop}>
                            녹음 중지
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handleCapture}
                            disabled={isBusy || !canUseLink}
                        >
                            탭 오디오 녹음
                        </button>
                    )}

                    {status === 'recording' && (
                        <span className="youtube-recording-time">
                            {formatSeconds(elapsed)} /{' '}
                            {formatSeconds(TAB_AUDIO_MAX_SECONDS)}
                        </span>
                    )}
                </div>

                <div className="youtube-to-midi-hint">
                    Chrome/Edge 데스크톱 · 공유 창에서 YouTube 탭과
                    &apos;탭 오디오 공유&apos;를 체크하세요.
                </div>

                {videoTitle && !isBusy && (
                    <div className="youtube-to-midi-title">
                        {videoTitle}
                    </div>
                )}

                <div
                    className="audio-to-midi-status"
                    aria-live="polite"
                >
                    {status === 'starting' &&
                        '공유할 YouTube 탭을 선택하세요…'}
                    {status === 'recording' && 'YouTube 오디오 녹음 중…'}
                    {status === 'stopping' && '녹음 마무리 중…'}
                    {status === 'converting' &&
                        `음정 분석 중… ${Math.round(progress * 100)}%`}
                    {status === 'done' &&
                        result &&
                        `MIDI 생성 완료 · 노트 ${result.noteCount}개${
                            result.truncated
                                ? ` · 앞 ${TAB_AUDIO_MAX_SECONDS}초만 변환`
                                : ''
                        }`}
                </div>

                {status === 'converting' && (
                    <div className="audio-to-midi-progress">
                        <div
                            className="audio-to-midi-progress-bar"
                            style={{
                                width: `${Math.round(progress * 100)}%`,
                            }}
                        />
                    </div>
                )}

                {(status === 'starting' || status === 'recording') && (
                    <div className="youtube-to-midi-warning">
                        녹음 중에는 이 메뉴를 닫지 마세요.
                    </div>
                )}

                {status === 'done' && result && (
                    <button
                        type="button"
                        className="audio-to-midi-download"
                        onClick={handleDownload}
                    >
                        MIDI 다운로드
                    </button>
                )}

                {error && (
                    <div className="midi-file-error">{error}</div>
                )}
            </div>
        </div>
    );
}
