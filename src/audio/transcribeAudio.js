const TARGET_SAMPLE_RATE = 22050;
export const MAX_AUDIO_SECONDS = 60;
const MIN_NOTE_LENGTH_MS = 130;

function getAudioContext() {
    const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
        throw new Error('이 브라우저는 Web Audio API를 지원하지 않습니다.');
    }

    return new AudioContextClass();
}

function getOfflineAudioContext(channels, length, sampleRate) {
    const OfflineAudioContextClass =
        window.OfflineAudioContext || window.webkitOfflineAudioContext;

    if (!OfflineAudioContextClass) {
        throw new Error('이 브라우저는 오프라인 오디오 처리를 지원하지 않습니다.');
    }

    return new OfflineAudioContextClass(channels, length, sampleRate);
}

function decodeAudioData(context, arrayBuffer) {
    return new Promise((resolve, reject) => {
        const promise = context.decodeAudioData(
            arrayBuffer,
            resolve,
            (error) =>
                reject(
                    error ??
                        new Error('오디오 파일을 디코딩하지 못했습니다.')
                )
        );

        if (promise && typeof promise.then === 'function') {
            promise.then(resolve).catch(reject);
        }
    });
}

export async function decodeAndResample(file, options = {}) {
    const maxSeconds = options.maxSeconds ?? MAX_AUDIO_SECONDS;
    const arrayBuffer = await file.arrayBuffer();
    const context = getAudioContext();
    let decoded;

    try {
        decoded = await decodeAudioData(context, arrayBuffer);
    } finally {
        await context.close().catch(() => {});
    }

    const originalDuration = decoded.duration;
    const duration = Math.min(originalDuration, maxSeconds);
    const length = Math.max(
        1,
        Math.ceil(duration * TARGET_SAMPLE_RATE)
    );
    const offline = getOfflineAudioContext(
        1,
        length,
        TARGET_SAMPLE_RATE
    );
    const source = offline.createBufferSource();

    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();

    const rendered = await offline.startRendering();
    const samples = Float32Array.from(rendered.getChannelData(0));

    return {
        samples,
        duration,
        originalDuration,
        truncated: originalDuration > maxSeconds,
    };
}

export function getFrameLengthForMilliseconds(milliseconds) {
    return Math.max(
        1,
        Math.round(
            (milliseconds / 1000) * (TARGET_SAMPLE_RATE / 256)
        )
    );
}

export function transcribeSamples(samples, options = {}) {
    const onProgress =
        typeof options.onProgress === 'function'
            ? options.onProgress
            : () => {};
    const modelUrl =
        options.modelUrl ??
        `${import.meta.env.BASE_URL}model/model.json`;

    return new Promise((resolve, reject) => {
        let worker;

        try {
            worker = new Worker(
                new URL('../workers/transcribe.worker.js', import.meta.url),
                { type: 'module' }
            );
        } catch (error) {
            reject(error);
            return;
        }

        const finish = (callback, value) => {
            worker.terminate();
            callback(value);
        };

        worker.onmessage = (event) => {
            const data = event.data ?? {};

            if (data.type === 'progress') {
                onProgress(data.progress ?? 0);
                return;
            }

            if (data.type === 'done') {
                finish(resolve, {
                    midiBytes: data.midiBytes,
                    notes: data.notes,
                    duration: data.duration,
                });
                return;
            }

            if (data.type === 'error') {
                finish(
                    reject,
                    new Error(
                        data.message ??
                            'MIDI 변환 중 알 수 없는 오류가 발생했습니다.'
                    )
                );
            }
        };

        worker.onerror = (event) => {
            finish(
                reject,
                new Error(
                    event?.message ||
                        'MIDI 변환 워커를 실행하지 못했습니다.'
                )
            );
        };

        worker.onmessageerror = () => {
            finish(
                reject,
                new Error('MIDI 변환 결과를 읽지 못했습니다.')
            );
        };

        const transferable = samples.buffer;

        worker.postMessage(
            {
                type: 'transcribe',
                samples,
                sampleRate: TARGET_SAMPLE_RATE,
                modelUrl,
                minNoteLengthFrames: getFrameLengthForMilliseconds(
                    MIN_NOTE_LENGTH_MS
                ),
                duration: options.duration ?? samples.length / TARGET_SAMPLE_RATE,
            },
            [transferable]
        );
    });
}

export function getAudioRms(samples) {
    if (!samples?.length) return 0;

    let sum = 0;

    for (let i = 0; i < samples.length; i += 1) {
        sum += samples[i] * samples[i];
    }

    return Math.sqrt(sum / samples.length);
}

export const audioToMidiConfig = {
    TARGET_SAMPLE_RATE,
    MAX_AUDIO_SECONDS,
    MIN_NOTE_LENGTH_MS,
};
