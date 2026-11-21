import { useEffect, useRef, useState } from 'react';
import { useData } from '../stores/useData';
import {
    decodeAndResample,
    getAudioRms,
    transcribeSamples,
} from '../audio/transcribeAudio';
import {
    TAB_AUDIO_MAX_SECONDS,
    getTabAudioCaptureSupport,
    startTabAudioCapture,
} from '../audio/tabAudioCapture';
import { fetchYouTubeTitle, parseYouTubeUrl } from '../audio/youtubeUrl';

const BUSY_STATUSES = new Set([
    'starting',
    'recording',
    'stopping',
    'converting',
]);

const RECORDING_BARS = [0.45, 0.8, 1, 0.6, 0.9, 0.5, 0.75, 0.35];

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
    const [support] = useState(() => getTabAudioCaptureSupport());
    const [url, setUrl] = useState('');
    const [videoTitle, setVideoTitle] = useState('');
    const [status, setStatus] = useState('idle');
    const [elapsed, setElapsed] = useState(0);
    const [level, setLevel] = useState(0);
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

    if (support.isMobile) {
        return null;
    }

    if (!support.supported) {
        return (
            <div className="YouTubeToMidi">
                <div className="Key">[YouTube → MIDI]</div>
                <div className="Value">
                    <div className="youtube-to-midi-hint">
                        {support.reason}
                    </div>
                </div>
            </div>
        );
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
            setLevel(0);
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

        const capturePromise = startTabAudioCapture({
            maxSeconds: TAB_AUDIO_MAX_SECONDS,
            onTick: (value) => {
                if (!mountedRef.current) return;

                setElapsed(value);

                if (value >= TAB_AUDIO_MAX_SECONDS) {
                    setStatus('stopping');
                }
            },
            onLevel: (value) => {
                if (mountedRef.current) {
                    setLevel(value);
                }
            },
            onStop: () => {
                if (!mountedRef.current) return;

                setLevel(0);
                setStatus('stopping');
            },
        });

        setError('');
        setResult(null);
        setProgress(0);
        setElapsed(0);
        setLevel(0);
        setStatus('starting');

        if (!videoTitleRef.current) {
            fetchYouTubeTitle(parsed.canonicalUrl).then(applyVideoTitle);
        }

        let controller;

        try {
            controller = await capturePromise;
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

    const progressPercent = Math.round(progress * 100);
    const isRecording = status === 'recording';
    const isProcessing =
        status === 'starting' ||
        status === 'stopping' ||
        status === 'converting';
    const actionDisabled =
        !canUseLink || (isBusy && status !== 'recording');

    let actionLabel = '탭 오디오 녹음';

    if (status === 'starting') {
        actionLabel = '공유 탭 선택 중…';
    } else if (status === 'recording') {
        actionLabel = '녹음 중지';
    } else if (status === 'stopping') {
        actionLabel = '녹음 완료 · 처리 중…';
    } else if (status === 'converting') {
        actionLabel = `처리 중… ${progressPercent}%`;
    } else if (status === 'done') {
        actionLabel = '다시 녹음';
    }

    const showCaptureHint =
        /탭 오디오|오디오 공유|소리가|화면 공유|공유 창/.test(error);

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
                    {isRecording ? (
                        <button
                            type="button"
                            className="youtube-to-midi-stop"
                            onClick={handleStop}
                        >
                            녹음 중지
                        </button>
                    ) : (
                        <button
                            type="button"
                            className={`youtube-to-midi-record${
                                isProcessing ? ' is-processing' : ''
                            }`}
                            onClick={handleCapture}
                            disabled={actionDisabled}
                            aria-busy={isProcessing}
                        >
                            {isProcessing && (
                                <span
                                    className="youtube-button-spinner"
                                    aria-hidden="true"
                                />
                            )}
                            {actionLabel}
                        </button>
                    )}
                </div>

                {isRecording && (
                    <>
                        <div className="youtube-recording-visual">
                            <span
                                className="youtube-recording-dot"
                                aria-hidden="true"
                            />
                            <div
                                className="youtube-recording-bars"
                                aria-hidden="true"
                            >
                                {RECORDING_BARS.map(
                                    (multiplier, index) => (
                                        <span
                                            key={index}
                                            style={{
                                                height: `${Math.round(
                                                    6 +
                                                        level *
                                                            30 *
                                                            multiplier
                                                )}px`,
                                            }}
                                        />
                                    )
                                )}
                            </div>
                            <span className="youtube-recording-time">
                                {formatSeconds(elapsed)} /{' '}
                                {formatSeconds(TAB_AUDIO_MAX_SECONDS)}
                            </span>
                        </div>

                        <div className="youtube-recording-progress">
                            <div
                                style={{
                                    width: `${Math.min(
                                        100,
                                        (elapsed /
                                            TAB_AUDIO_MAX_SECONDS) *
                                            100
                                    )}%`,
                                }}
                            />
                        </div>
                    </>
                )}

                <div className="youtube-to-midi-hint">
                    Chrome/Edge 데스크톱 전용
                </div>

                {!isBusy && (
                    <div className="youtube-to-midi-steps">
                        <span>1. 열기 → YouTube 영상 재생</span>
                        <span>2. 탭 오디오 녹음 클릭</span>
                        <span>3. 공유 창의 Chrome Tab에서 YouTube 선택</span>
                        <span>
                            4. 왼쪽 아래 &apos;탭 오디오 공유&apos; 체크 후
                            공유
                        </span>
                    </div>
                )}

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
                        "공유 창에서 YouTube 탭과 '탭 오디오 공유'를 체크한 뒤 공유를 누르세요…"}
                    {status === 'recording' &&
                        `녹음 중 · ${formatSeconds(elapsed)} / ${formatSeconds(TAB_AUDIO_MAX_SECONDS)}`}
                    {status === 'stopping' && '녹음 완료 · 처리 중…'}
                    {status === 'converting' &&
                        `처리 중 · 음정 분석 ${progressPercent}%`}
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
                        녹음 중에는 이 메뉴를 닫지 마세요. 일찍 끝내려면
                        Chrome 공유 표시줄의 &apos;공유 중지&apos;를
                        누르세요.
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
                    <div className="midi-file-error youtube-to-midi-error">
                        {error}
                        {showCaptureHint && (
                            <div className="youtube-to-midi-error-hint">
                                공유 창 왼쪽 아래의 &apos;탭 오디오
                                공유&apos;가 켜져 있는지 확인해 주세요.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
