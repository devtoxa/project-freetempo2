import { Midi } from '@tonejs/midi';

const MIN_AMPLITUDE = 0.06;
const MIN_NOTE_DURATION = 0.05;
const MAX_NOTE_GAP = 0.06;
const DEFAULT_BPM = 120;

async function loadBasicPitch() {
    if (typeof window === 'undefined') {
        globalThis.window = globalThis;
    }

    const tf = await import('@tensorflow/tfjs');

    await tf.setBackend('cpu');
    await tf.ready();

    return import('@spotify/basic-pitch');
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function cleanUpNotes(notes) {
    const sorted = notes
        .map((note) => ({
            start: Math.max(note.startTimeSeconds, 0),
            duration: Math.max(note.durationSeconds, 0),
            pitchMidi: Math.round(note.pitchMidi),
            amplitude: note.amplitude,
        }))
        .filter(
            (note) =>
                Number.isFinite(note.start) &&
                Number.isFinite(note.pitchMidi) &&
                note.amplitude >= MIN_AMPLITUDE
        )
        .sort((a, b) => {
            if (a.start !== b.start) return a.start - b.start;
            return b.amplitude - a.amplitude;
        });

    const merged = [];
    const lastByPitch = new Map();

    for (const note of sorted) {
        const previous = lastByPitch.get(note.pitchMidi);
        const previousEnd = previous
            ? previous.start + previous.duration
            : 0;

        if (
            previous &&
            note.start >= previous.start &&
            note.start - previousEnd <= MAX_NOTE_GAP
        ) {
            previous.duration = Math.max(
                previous.duration,
                note.start + note.duration - previous.start
            );
            previous.amplitude = Math.max(
                previous.amplitude,
                note.amplitude
            );
            continue;
        }

        const copy = { ...note };
        merged.push(copy);
        lastByPitch.set(note.pitchMidi, copy);
    }

    return merged
        .filter((note) => note.duration >= MIN_NOTE_DURATION)
        .map((note) => ({
            ...note,
            duration: Math.max(note.duration, MIN_NOTE_DURATION),
            amplitude: clamp(note.amplitude, 0.15, 1),
        }))
        .sort((a, b) => a.start - b.start);
}

function createMidiBytes(notes) {
    const midi = new Midi();

    midi.header.setTempo(DEFAULT_BPM);

    const track = midi.addTrack();
    track.name = 'Transcribed';
    track.channel = 0;
    track.instrument.number = 0;

    for (const note of notes) {
        track.addNote({
            midi: note.pitchMidi,
            time: note.start,
            duration: note.duration,
            velocity: note.amplitude,
        });
    }

    const bytes = midi.toArray();

    return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
    );
}

async function transcribe(payload) {
    const {
        samples,
        modelUrl,
        duration,
        minNoteLengthFrames,
    } = payload;

    self.postMessage({ type: 'progress', progress: 0.02 });

    const {
        BasicPitch,
        noteFramesToTime,
        outputToNotesPoly,
    } = await loadBasicPitch();
    const basicPitch = new BasicPitch(modelUrl);
    const frames = [];
    const onsets = [];

    await basicPitch.evaluateModel(
        samples,
        (frameBatch, onsetBatch) => {
            frames.push(...frameBatch);
            onsets.push(...onsetBatch);
        },
        (progress) => {
            self.postMessage({
                type: 'progress',
                progress: 0.05 + clamp(progress, 0, 1) * 0.85,
            });
        }
    );

    self.postMessage({ type: 'progress', progress: 0.92 });

    if (!frames.length || !onsets.length) {
        throw new Error(
            '음정을 찾지 못했습니다. 배경음이 적은 녹음을 사용해 보세요.'
        );
    }

    const rawNotes = noteFramesToTime(
        outputToNotesPoly(
            frames,
            onsets,
            0.5,
            0.3,
            minNoteLengthFrames,
            true,
            null,
            null,
            true,
            11
        )
    );
    const notes = cleanUpNotes(rawNotes);

    if (!notes.length) {
        throw new Error(
            '음정을 찾지 못했습니다. 배경음이 적은 녹음을 사용해 보세요.'
        );
    }

    self.postMessage({ type: 'progress', progress: 0.96 });

    const midiBytes = createMidiBytes(notes);

    self.postMessage(
        {
            type: 'done',
            midiBytes,
            duration,
            notes: notes.map((note) => ({
                start: note.start,
                duration: note.duration,
                pitchMidi: note.pitchMidi,
                amplitude: note.amplitude,
            })),
        },
        [midiBytes]
    );
}

self.onmessage = async (event) => {
    const payload = event.data;

    if (payload?.type !== 'transcribe') {
        return;
    }

    try {
        await transcribe(payload);
    } catch (error) {
        self.postMessage({
            type: 'error',
            message:
                error?.message ||
                'MIDI 변환 중 알 수 없는 오류가 발생했습니다.',
        });
    }
};
