const MAX_RECORDING_SECONDS = 60;
const MIME_TYPES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
];

function getSupportedMimeType() {
    if (typeof MediaRecorder === 'undefined') {
        return null;
    }

    if (typeof MediaRecorder.isTypeSupported !== 'function') {
        return null;
    }

    return (
        MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ??
        null
    );
}

function stopStreamTracks(stream) {
    stream?.getTracks?.().forEach((track) => {
        try {
            track.stop();
        } catch {
            return;
        }
    });
}

export function isTabAudioCaptureSupported() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return false;
    }

    if (typeof window.MediaRecorder === 'undefined') {
        return false;
    }

    if (typeof navigator.mediaDevices?.getDisplayMedia !== 'function') {
        return false;
    }

    const userAgent = navigator.userAgent ?? '';

    if (/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)) {
        return false;
    }

    if (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1) {
        return false;
    }

    if (!/Chrome\//i.test(userAgent) && !/Edg\//i.test(userAgent)) {
        return false;
    }

    return true;
}

export async function startTabAudioCapture(options = {}) {
    const maxSeconds = options.maxSeconds ?? MAX_RECORDING_SECONDS;
    const onTick =
        typeof options.onTick === 'function' ? options.onTick : () => {};

    if (typeof MediaRecorder === 'undefined') {
        throw new Error(
            '이 브라우저는 녹음을 지원하지 않습니다. Chrome/Edge를 사용해 주세요.'
        );
    }

    if (typeof navigator.mediaDevices?.getDisplayMedia !== 'function') {
        throw new Error('이 브라우저는 탭 오디오 캡처를 지원하지 않습니다.');
    }

    let displayStream;

    try {
        displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: 1 },
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
            },
            displaySurface: 'browser',
            selfBrowserSurface: 'exclude',
            surfaceSwitching: 'exclude',
            systemAudio: 'include',
        });
    } catch (error) {
        if (error?.name === 'NotAllowedError') {
            throw new Error('화면 공유가 취소되었습니다.', {
                cause: error,
            });
        }

        if (error?.name === 'NotSupportedError') {
            throw new Error(
                '이 브라우저는 탭 오디오 캡처를 지원하지 않습니다.',
                { cause: error }
            );
        }

        throw new Error(
            error?.message || '탭 오디오 공유를 시작하지 못했습니다.',
            { cause: error }
        );
    }

    const audioTracks = displayStream.getAudioTracks();

    if (!audioTracks.length) {
        stopStreamTracks(displayStream);
        throw new Error(
            "공유 창에서 '탭 오디오 공유'를 체크해야 합니다."
        );
    }

    const audioStream = new MediaStream(audioTracks);
    const mimeType = getSupportedMimeType();
    let recorder;

    try {
        recorder = mimeType
            ? new MediaRecorder(audioStream, { mimeType })
            : new MediaRecorder(audioStream);
    } catch {
        stopStreamTracks(displayStream);
        throw new Error('녹음 포맷을 지원하지 않습니다. Chrome/Edge를 사용해 주세요.');
    }

    const chunks = [];
    const startedAt = performance.now();
    let timerId = null;
    let settled = false;
    let resolveDone;
    let rejectDone;

    const done = new Promise((resolve, reject) => {
        resolveDone = resolve;
        rejectDone = reject;
    });

    const stop = () => {
        if (settled) return;

        if (recorder.state === 'inactive') {
            finish();
            return;
        }

        try {
            recorder.stop();
        } catch (error) {
            finish(error);
        }
    };

    const handleTrackEnded = () => {
        stop();
    };

    const finish = (error) => {
        if (settled) return;

        settled = true;

        if (timerId !== null) {
            clearInterval(timerId);
            timerId = null;
        }

        audioTracks.forEach((track) => {
            track.removeEventListener?.('ended', handleTrackEnded);
        });
        stopStreamTracks(displayStream);

        if (error) {
            rejectDone(error);
            return;
        }

        const type = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type });

        if (blob.size === 0) {
            rejectDone(new Error('녹음된 오디오가 없습니다.'));
            return;
        }

        const extension = type.includes('mp4') ? 'm4a' : 'webm';
        const filename = `youtube-capture-${Date.now()}.${extension}`;

        resolveDone(new File([blob], filename, { type }));
    };

    recorder.ondataavailable = (event) => {
        if (event.data?.size) {
            chunks.push(event.data);
        }
    };

    recorder.onerror = (event) => {
        finish(
            event?.error || new Error('녹음 중 오류가 발생했습니다.')
        );
    };

    recorder.onstop = () => {
        finish();
    };

    audioTracks[0].addEventListener('ended', handleTrackEnded);

    timerId = setInterval(() => {
        const elapsed = (performance.now() - startedAt) / 1000;
        const clamped = Math.min(elapsed, maxSeconds);

        onTick(clamped);

        if (elapsed >= maxSeconds) {
            stop();
        }
    }, 200);

    try {
        recorder.start();
    } catch (error) {
        finish(error);
    }

    onTick(0);

    return { stop, done };
}

export const TAB_AUDIO_MAX_SECONDS = MAX_RECORDING_SECONDS;
