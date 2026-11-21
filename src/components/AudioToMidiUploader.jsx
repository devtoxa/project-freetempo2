import { useState } from 'react';
import { useData } from '../stores/useData';
import {
    MAX_AUDIO_SECONDS,
    decodeAndResample,
    transcribeSamples,
} from '../audio/transcribeAudio';

const MAX_FILE_SIZE = 40 * 1024 * 1024;
const AUDIO_EXTENSION = /\.(mp3|wav|m4a|aac|ogg|oga|flac|webm|mp4)$/i;

function isAudioFile(file) {
    return file.type?.startsWith('audio/') || AUDIO_EXTENSION.test(file.name);
}

function stripExtension(filename) {
    return filename.replace(/\.[^.]+$/, '');
}

function safeFilename(filename) {
    return filename.replace(/[\\/:*?"<>|]/g, '_');
}

export default function AudioToMidiUploader() {
    const addLocalMidi = useData((state) => state.addLocalMidi);
    const [status, setStatus] = useState('idle');
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);

    const isBusy = status === 'decoding' || status === 'converting';

    const handleFileChange = async (event) => {
        const file = event.target.files?.[0];

        event.target.value = '';

        if (!file || isBusy) return;

        if (!isAudioFile(file)) {
            setError('오디오 파일을 선택해 주세요.');
            setResult(null);
            return;
        }

        if (file.size > MAX_FILE_SIZE) {
            setError('파일이 너무 큽니다. 40MB 이하의 짧은 녹음을 사용해 주세요.');
            setResult(null);
            return;
        }

        setError('');
        setResult(null);
        setProgress(0);
        setStatus('decoding');

        try {
            const audio = await decodeAndResample(file);
            setStatus('converting');

            const transcribed = await transcribeSamples(audio.samples, {
                duration: audio.duration,
                onProgress: (value) => {
                    setProgress(value);
                },
            });

            const baseTitle = stripExtension(file.name);
            const title = `${baseTitle} (음성→MIDI)`;
            const blob = new Blob([transcribed.midiBytes], {
                type: 'audio/midi',
            });
            const url = URL.createObjectURL(blob);

            addLocalMidi({
                title,
                artist: 'Audio → MIDI',
                url,
            });

            setProgress(1);
            setStatus('done');
            setResult({
                title,
                url,
                noteCount: transcribed.notes.length,
                truncated: audio.truncated,
                downloadName: `${safeFilename(baseTitle)}.mid`,
            });
        } catch (err) {
            setStatus('error');
            setError(
                err?.name === 'EncodingError'
                    ? '이 오디오 형식을 브라우저에서 디코딩할 수 없습니다. MP3/WAV/M4A 파일을 사용해 주세요.'
                    : err?.message || 'MIDI 변환에 실패했습니다.'
            );
        }
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
        <div className="AudioToMidiUploader">
            <div className="Key">[음성 → MIDI]</div>
            <div className="Value">
                <input
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.flac,.webm,.mp4"
                    onChange={handleFileChange}
                    disabled={isBusy}
                />

                <div
                    className="audio-to-midi-status"
                    aria-live="polite"
                >
                    {status === 'decoding' &&
                        '오디오 준비 중…'}
                    {status === 'converting' &&
                        `음정 분석 중… ${Math.round(progress * 100)}%`}
                    {status === 'done' &&
                        result &&
                        `MIDI 생성 완료 · 노트 ${result.noteCount}개${
                            result.truncated
                                ? ` · 앞 ${MAX_AUDIO_SECONDS}초만 변환`
                                : ''
                        }`}
                </div>

                {isBusy && (
                    <div className="audio-to-midi-progress">
                        <div
                            className="audio-to-midi-progress-bar"
                            style={{
                                width: `${Math.round(progress * 100)}%`,
                            }}
                        />
                    </div>
                )}

                {isBusy && progress < 0.05 && (
                    <div className="audio-to-midi-hint">
                        첫 변환은 모델을 내려받아 조금 더 걸릴 수 있습니다.
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
