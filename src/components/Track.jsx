import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';

import { useData } from '../stores/useData';
import { synthMap } from '../audio/synthMap';

// ==========================================
// 기본 설정
// ==========================================

const DEFAULT_BPM = 120;

const MIN_MIDI = 21;
const MAX_MIDI = 108;

const NOTE_HEIGHT = 12;
const NOTE_WIDTH = 20;

// Canvas 내부 여백 설정
const PADDING_X = 24;
const PADDING_TOP = 18;
const PADDING_BOTTOM = 18;

// 강조 노트가 화면 좌측으로 벗어나지 않도록 유지할 앵커 위치와 카메라 스무딩 시간
const FOCUS_ANCHOR_RATIO = 0.18;
const FOCUS_SMOOTHING_MS = 120;

// 마우스 휠 한 칸으로 이동할 거리(px)
const WHEEL_STEP_PX = 50;

// ==========================================
// MIDI 파일 경로
// ==========================================

const midiUrls = import.meta.glob('../midi/*.mid', {
    eager: true,
    query: '?url',
    import: 'default',
});

function resolveMidiURL(midiUrl) {
    if (!midiUrl) return null;
    if (midiUrl.startsWith('blob:') || midiUrl.startsWith('http')) {
        return midiUrl;
    }
    const filename = midiUrl.split('/').pop();
    return midiUrls[`../midi/${filename}`] || midiUrl;
}

// ==========================================
// 악기 생성
// ==========================================

function createInstrument(font) {
    if (font?.type === 'sampler') {
        return new Tone.Sampler({
            urls: font.urls,
            baseUrl: font.baseUrl,
            release: 1,
        }).toDestination();
    }

    const Voice = synthMap[font?.type] ?? Tone.Synth;
    return new Tone.PolySynth(Voice).toDestination();
}

// ==========================================
// MIDI 노트 그룹화 (동시 타이밍 단위)
// ==========================================

function groupNotesByTime(notes, threshold = 0.02) {
    const groups = [];

    for (const note of notes) {
        const lastGroup = groups[groups.length - 1];

        if (!lastGroup) {
            groups.push([note]);
            continue;
        }

        const groupTime = lastGroup[0].time;

        if (Math.abs(note.time - groupTime) <= threshold) {
            lastGroup.push(note);
        } else {
            groups.push([note]);
        }
    }

    return groups;
}

// ==========================================
// Track Component
// ==========================================

const Track = () => {
    const soundFontList = useData((state) => state.soundFontList ?? []);
    const currentSoundFontId = useData((state) => state.currentSoundFontId);
    const currentMidiId = useData((state) => state.currentMidiId);
    const midiList = useData((state) => state.midiList ?? []);
    const isAutoPlay = useData((state) => state.isAutoPlay);
    const autoPlaySessionId = useData((state) => state.autoPlaySessionId);
    const storeCurrentStep = useData((state) => state.currentStep);
    const stopAutoPlay = useData((state) => state.stopAutoPlay);
    const setTotalSteps = useData((state) => state.setTotalSteps);
    const setStoreCurrentStep = useData((state) => state.setCurrentStep);
    const seekVersion = useData((state) => state.seekVersion);
    const pixelsPerBeat = useData((state) => state.pixelsPerBeat ?? 80);
    const volume = useData((state) => state.volume ?? -6);

    const currentFont =
        soundFontList.find(
            (font) => Number(font.id) === Number(currentSoundFontId)
        ) ?? soundFontList[0];

    const currentMidi =
        midiList.find(
            (midi) => Number(midi.id) === Number(currentMidiId)
        ) ?? midiList[0];

    const synthRef = useRef(null);
    const volumeRef = useRef(volume);
    const stepRef = useRef(0);
    const lastSeekVersionRef = useRef(seekVersion);
    const canvasRef = useRef(null);
    const viewportRef = useRef(null);
    const rafIdRef = useRef(null);
    const wheelStepRef = useRef(0);

    const sizeRef = useRef({
        width: 1280,
        height: 720,
    });

    const autoPlayRef = useRef({
        active: false,
        startAudioSec: 0,
        startSongTime: 0,
    });

    const callbacksRef = useRef({
        playGroup: null,
        stopAutoPlay: null,
        setStoreCurrentStep: null,
    });

    const [notes, setNotes] = useState([]);
    const [bpm, setBpm] = useState(DEFAULT_BPM);
    const [currentStep, setCurrentStep] = useState(0);
    const [playingStep, setPlayingStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const noteGroups = useMemo(() => groupNotesByTime(notes), [notes]);

    const midiRange = useMemo(() => {
        if (!notes.length) {
            return {
                minMidi: MIN_MIDI,
                maxMidi: MAX_MIDI,
                midiSpan: MAX_MIDI - MIN_MIDI,
            };
        }

        let min = Infinity;
        let max = -Infinity;

        for (const note of notes) {
            if (note.midi < min) min = note.midi;
            if (note.midi > max) max = note.midi;
        }

        return {
            minMidi: min,
            maxMidi: max,
            midiSpan: Math.max(max - min, 1),
        };
    }, [notes]);

    // 재생 중인 그룹(강조 표시)
    const playingGroup = useMemo(() => {
        if (!noteGroups.length) return [];

        const safeIdx = Math.min(
            Math.max(playingStep, 0),
            noteGroups.length - 1
        );

        return noteGroups[safeIdx] ?? [];
    }, [noteGroups, playingStep]);

    // 다음에 이동할 그룹(커서 스크롤 타깃)
    const targetGroup = useMemo(() => {
        if (!noteGroups.length) return [];

        const safeIdx = Math.min(
            Math.max(currentStep, 0),
            noteGroups.length - 1
        );

        return noteGroups[safeIdx] ?? [];
    }, [noteGroups, currentStep]);

    const targetCursorTime = targetGroup?.[0]?.time ?? 0;

    const renderStateRef = useRef({
        notes: [],
        noteGroups: [],
        bpm: DEFAULT_BPM,
        pixelsPerBeat: 80,
        targetCursorTime: 0,
        midiRange: {
            minMidi: MIN_MIDI,
            maxMidi: MAX_MIDI,
            midiSpan: MAX_MIDI - MIN_MIDI,
        },
        activeUids: new Set(),
        activeFocusTime: null,
        displayCursorTime: 0,
        lastFrameTime: null,
    });

    const playGroup = useCallback((group, when) => {
        if (!group || !synthRef.current) return;

        const scheduleTime =
            typeof when === 'number' && Number.isFinite(when)
                ? when
                : undefined;

        for (const note of group) {
            if (!note?.name) continue;

            const duration =
                Number.isFinite(note.duration) && note.duration > 0
                    ? Math.max(note.duration, 0.1)
                    : 0.2;

            synthRef.current.triggerAttackRelease(
                note.name,
                duration,
                scheduleTime,
                note.velocity ?? 0.8
            );
        }
    }, []);

    // 다음 노트 그룹으로 진행하며 재생 (키보드 / 터치 공통)
    const advanceStep = useCallback(() => {
        if (!noteGroups.length || !synthRef.current) {
            return;
        }

        if (autoPlayRef.current.active) {
            autoPlayRef.current.active = false;
            stopAutoPlay?.();
        }

        const idx = stepRef.current % noteGroups.length;
        const group = noteGroups[idx];
        const nextStep = (idx + 1) % noteGroups.length;

        setPlayingStep(idx);

        stepRef.current = nextStep;
        setCurrentStep(nextStep);
        setStoreCurrentStep(nextStep);

        const triggerNotes = () => {
            playGroup(group, Tone.now());
        };

        if (Tone.getContext().state !== 'running') {
            Tone.start()
                .then(() => {
                    if (currentFont?.type === 'sampler') {
                        return Tone.loaded();
                    }
                })
                .then(triggerNotes)
                .catch((err) => {
                    console.error('[Audio] Playback error:', err);
                });
        } else {
            triggerNotes();
        }
    }, [
        noteGroups,
        currentFont?.type,
        playGroup,
        stopAutoPlay,
        setStoreCurrentStep,
    ]);

    useEffect(() => {
        callbacksRef.current = {
            playGroup,
            stopAutoPlay,
            setStoreCurrentStep,
        };
    }, [playGroup, stopAutoPlay, setStoreCurrentStep]);

    useEffect(() => {
        renderStateRef.current.notes = notes;
        renderStateRef.current.noteGroups = noteGroups;
        renderStateRef.current.bpm = bpm;
        renderStateRef.current.pixelsPerBeat = pixelsPerBeat;
        renderStateRef.current.targetCursorTime = targetCursorTime;
        renderStateRef.current.midiRange = midiRange;
        renderStateRef.current.activeUids = new Set(
            playingGroup.map((note) => note._uid)
        );
        renderStateRef.current.activeFocusTime =
            playingGroup[0]?.time ?? null;
    }, [
        notes,
        noteGroups,
        bpm,
        pixelsPerBeat,
        targetCursorTime,
        midiRange,
        playingGroup,
    ]);

    // MIDI 로딩
    useEffect(() => {
        if (!currentMidi?.url) {
            setNotes([]);
            setTotalSteps(0);
            setCurrentStep(0);
            setPlayingStep(0);
            setStoreCurrentStep(0);
            renderStateRef.current.activeFocusTime = null;
            renderStateRef.current.displayCursorTime = 0;
            return;
        }

        let active = true;

        stopAutoPlay?.();
        autoPlayRef.current.active = false;

        setLoading(true);
        setError(null);
        setNotes([]);
        setBpm(DEFAULT_BPM);
        setCurrentStep(0);
        setPlayingStep(0);
        setTotalSteps(0);
        setStoreCurrentStep(0);
        stepRef.current = 0;
        renderStateRef.current.activeFocusTime = null;
        renderStateRef.current.displayCursorTime = 0;
        renderStateRef.current.lastFrameTime = null;

        const loadMidi = async () => {
            try {
                const url = resolveMidiURL(currentMidi.url);
                const midi = await Midi.fromUrl(url);

                if (!active) return;

                const extractedNotes = midi.tracks
                    .flatMap((track, trackIdx) =>
                        track.notes
                            .filter((note) => Boolean(note.name))
                            .map((note, noteIdx) => ({
                                name: note.name,
                                midi: note.midi,
                                time: note.time,
                                duration: note.duration,
                                velocity: note.velocity,
                                _uid: `${trackIdx}-${noteIdx}-${note.midi}-${note.time.toFixed(4)}`,
                            }))
                    )
                    .sort((a, b) => a.time - b.time);

                if (extractedNotes.length === 0) {
                    throw new Error(
                        'MIDI 파일에 재생 가능한 노트가 없습니다.'
                    );
                }

                const midiBpm =
                    midi.header.tempos[0]?.bpm ?? DEFAULT_BPM;
                const groups = groupNotesByTime(extractedNotes);

                if (!active) return;

                setNotes(extractedNotes);
                setBpm(midiBpm);
                setCurrentStep(0);
                setPlayingStep(0);
                setTotalSteps(groups.length);
                setStoreCurrentStep(0);

                stepRef.current = 0;
                renderStateRef.current.activeFocusTime =
                    groups[0]?.[0]?.time ?? null;
                renderStateRef.current.displayCursorTime = 0;
                renderStateRef.current.lastFrameTime = null;
            } catch (err) {
                if (!active) return;
                setNotes([]);
                setTotalSteps(0);
                setCurrentStep(0);
                setPlayingStep(0);
                setStoreCurrentStep(0);
                renderStateRef.current.activeFocusTime = null;
                setError(err.message);
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        loadMidi();

        return () => {
            active = false;
        };
    }, [
        currentMidi?.url,
        stopAutoPlay,
        setTotalSteps,
        setStoreCurrentStep,
    ]);

    // 슬라이더 / 처음으로 이동 동기화
    // 일반 키 입력/자동재생의 currentStep 변경에는 스냅하지 않고,
    // 실제 seek 동작(seekVersion 증가)에서만 커서를 즉시 이동시킵니다.
    // useLayoutEffect로 페인트/다음 rAF 이전에 반영해 자동재생 루프와의 경합을 막습니다.
    useLayoutEffect(() => {
        if (lastSeekVersionRef.current === seekVersion) {
            return;
        }

        lastSeekVersionRef.current = seekVersion;

        const safeStep = Math.min(
            storeCurrentStep,
            Math.max(noteGroups.length - 1, 0)
        );

        const group =
            noteGroups.length > 0 ? noteGroups[safeStep] : null;
        const groupTime = group?.[0]?.time ?? 0;

        const pxPerSec = (bpm / 60) * pixelsPerBeat;
        const innerWidth = Math.max(
            sizeRef.current.width - PADDING_X * 2,
            1
        );
        const anchorSec =
            (innerWidth * FOCUS_ANCHOR_RATIO) / Math.max(pxPerSec, 1);

        stepRef.current = safeStep;
        setCurrentStep(safeStep);
        setPlayingStep(safeStep);
        renderStateRef.current.displayCursorTime = Math.max(
            groupTime - anchorSec,
            0
        );
        renderStateRef.current.activeFocusTime = groupTime;

        // 자동 재생 중이면 새 위치에서 이어서 재생하도록 앵커 재설정
        if (autoPlayRef.current.active) {
            synthRef.current?.releaseAll?.();

            autoPlayRef.current.startSongTime = groupTime;
            autoPlayRef.current.startAudioSec = Tone.now();
        }
    }, [
        seekVersion,
        storeCurrentStep,
        noteGroups,
        bpm,
        pixelsPerBeat,
    ]);

    // 볼륨 변경 (악기 재생성 없이 실시간 반영)
    useEffect(() => {
        volumeRef.current = volume;

        if (synthRef.current) {
            synthRef.current.volume.value = volume;
        }
    }, [volume]);

    // 악기 생성 및 정리
    useEffect(() => {
        const synth = createInstrument(currentFont);
        synth.volume.value = volumeRef.current;
        synthRef.current = synth;

        return () => {
            synth.releaseAll?.();
            synth.dispose();

            if (synthRef.current === synth) {
                synthRef.current = null;
            }
        };
    }, [currentFont]);

    // 자동 재생
    useEffect(() => {
        if (!isAutoPlay) {
            autoPlayRef.current.active = false;
            return;
        }

        if (!noteGroups.length || !synthRef.current) {
            stopAutoPlay?.();
            return;
        }

        let cancelled = false;

        const startPlayback = async () => {
            try {
                if (Tone.getContext().state !== 'running') {
                    await Tone.start();
                }

                if (currentFont?.type === 'sampler') {
                    await Tone.loaded();
                }

                if (cancelled) return;

                const idx = Math.min(
                    stepRef.current,
                    noteGroups.length - 1
                );
                const currentGroup = noteGroups[idx];
                const startSongTime = currentGroup?.[0]?.time ?? 0;
                const startAudioSec = Tone.now();

                playGroup(currentGroup, startAudioSec);
                setPlayingStep(idx);

                const nextStep = idx + 1;
                stepRef.current = nextStep;
                setCurrentStep(nextStep);
                setStoreCurrentStep(nextStep);

                const renderState = renderStateRef.current;
                const pxPerSec =
                    (renderState.bpm / 60) * renderState.pixelsPerBeat;
                const innerWidth = Math.max(
                    sizeRef.current.width - PADDING_X * 2,
                    1
                );
                const anchorSec =
                    (innerWidth * FOCUS_ANCHOR_RATIO) /
                    Math.max(pxPerSec, 1);

                renderState.activeFocusTime = startSongTime;
                renderState.displayCursorTime = Math.max(
                    startSongTime - anchorSec,
                    0
                );

                autoPlayRef.current = {
                    active: true,
                    startAudioSec,
                    startSongTime,
                };
            } catch (err) {
                console.error('[Audio] Playback error:', err);
                stopAutoPlay?.();
            }
        };

        startPlayback();

        return () => {
            cancelled = true;
        };
    }, [
        isAutoPlay,
        autoPlaySessionId,
        noteGroups,
        currentFont?.type,
        playGroup,
        stopAutoPlay,
        setStoreCurrentStep,
    ]);

    // Canvas 크기 감지
    useEffect(() => {
        const element = viewportRef.current;
        if (!element) return;

        const updateSize = () => {
            const rect = element.getBoundingClientRect();
            const width = Math.max(Math.floor(rect.width), 200);
            const height = Math.max(Math.floor(rect.height), 200);

            sizeRef.current = { width, height };

            const canvas = canvasRef.current;
            if (canvas) {
                const dpr = window.devicePixelRatio || 1;
                canvas.width = Math.floor(width * dpr);
                canvas.height = Math.floor(height * dpr);
            }
        };

        updateSize();

        const observer = new ResizeObserver(updateSize);
        observer.observe(element);
        window.addEventListener('resize', updateSize);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateSize);
        };
    }, []);

    // 슬라이더/키보드로 이동한 현재 위치를 휠 스크럽 기준점과 동기화
    useEffect(() => {
        wheelStepRef.current = storeCurrentStep;
    }, [storeCurrentStep]);

    // 마우스 휠로 위치 이동 (스크롤 중에는 소리를 내지 않음)
    useEffect(() => {
        const element = viewportRef.current;
        if (!element) return;

        let accumulated = 0;
        let resetTimer = null;

        const handleWheel = (e) => {
            e.preventDefault();

            const storeState = useData.getState();

            // 스크롤하는 동안은 자동 재생을 멈추고 울리는 소리를 해제
            if (autoPlayRef.current.active || storeState.isAutoPlay) {
                autoPlayRef.current.active = false;
                stopAutoPlay?.();
            }
            synthRef.current?.releaseAll?.();

            const delta =
                e.deltaMode === 1
                    ? e.deltaY * 16
                    : e.deltaMode === 2
                      ? e.deltaY * 400
                      : e.deltaY;

            accumulated += delta;

            if (resetTimer) clearTimeout(resetTimer);
            resetTimer = setTimeout(() => {
                accumulated = 0;
            }, 180);

            const steps = Math.trunc(accumulated / WHEEL_STEP_PX);
            if (steps === 0) return;

            accumulated -= steps * WHEEL_STEP_PX;

            const maxStep = Math.max(noteGroups.length - 1, 0);
            const baseStep = Math.min(
                Math.max(wheelStepRef.current, 0),
                maxStep
            );
            const nextStep = Math.min(
                Math.max(baseStep + steps, 0),
                maxStep
            );

            if (nextStep === baseStep) return;

            wheelStepRef.current = nextStep;
            storeState.seekToStep(nextStep);
        };

        element.addEventListener('wheel', handleWheel, {
            passive: false,
        });

        return () => {
            element.removeEventListener('wheel', handleWheel);
            if (resetTimer) clearTimeout(resetTimer);
        };
    }, [noteGroups.length, stopAutoPlay]);

    // 키보드 입력 시 다음 노트 그룹으로 진행하며 소리 재생
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.repeat) return;

            const tag = e.target?.tagName;
            if (
                tag === 'INPUT' ||
                tag === 'SELECT' ||
                tag === 'TEXTAREA'
            ) {
                return;
            }

            advanceStep();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [advanceStep]);

    // 캔버스 터치/클릭 시에도 동일하게 진행 (첫 포인터만 인식)
    useEffect(() => {
        const element = viewportRef.current;
        if (!element) return;

        const handlePointerDown = (e) => {
            if (!e.isPrimary) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;

            e.preventDefault();
            advanceStep();
        };

        element.addEventListener('pointerdown', handlePointerDown, {
            passive: false,
        });

        return () => {
            element.removeEventListener('pointerdown', handlePointerDown);
        };
    }, [advanceStep]);

    // Canvas 렌더링 루프: displayCursorTime을 부드럽게 이동시켜 노트가 스무스하게 흐름
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const draw = (now) => {
            const state = renderStateRef.current;
            const { width, height } = sizeRef.current;
            const {
                playGroup: runPlayGroup,
                stopAutoPlay: runStopAutoPlay,
                setStoreCurrentStep: runSetStoreStep,
            } = callbacksRef.current;

            const dpr = window.devicePixelRatio || 1;
            const targetW = Math.floor(width * dpr);
            const targetH = Math.floor(height * dpr);

            if (
                canvas.width !== targetW ||
                canvas.height !== targetH
            ) {
                canvas.width = targetW;
                canvas.height = targetH;
            }

            const dtMs =
                state.lastFrameTime == null
                    ? 16.67
                    : Math.min(Math.max(now - state.lastFrameTime, 1), 32);
            state.lastFrameTime = now;

            const innerX = PADDING_X;
            const innerY = PADDING_TOP;
            const innerWidth = Math.max(width - PADDING_X * 2, 1);
            const innerHeight = Math.max(
                height - PADDING_TOP - PADDING_BOTTOM,
                1
            );

            const pxPerSec = (state.bpm / 60) * state.pixelsPerBeat;

            if (
                autoPlayRef.current.active &&
                state.noteGroups.length > 0
            ) {
                const nowAudioSec = Tone.now();
                const elapsedSec = Math.max(
                    nowAudioSec - autoPlayRef.current.startAudioSec,
                    0
                );
                const songTime =
                    autoPlayRef.current.startSongTime + elapsedSec;

                let idx = stepRef.current % state.noteGroups.length;
                let triggered = false;
                let lastTriggered = -1;

                while (idx < state.noteGroups.length) {
                    const nextGroup = state.noteGroups[idx];
                    const groupTime = nextGroup?.[0]?.time ?? Infinity;

                    if (songTime >= groupTime) {
                        const lagSec = Math.max(songTime - groupTime, 0);
                        const scheduledWhen = Math.max(
                            nowAudioSec - lagSec,
                            Tone.now()
                        );

                        runPlayGroup?.(nextGroup, scheduledWhen);
                        lastTriggered = idx;
                        idx += 1;
                        triggered = true;
                    } else {
                        break;
                    }
                }

                if (triggered) {
                    if (lastTriggered >= 0) {
                        setPlayingStep(lastTriggered);

                        const triggeredGroup =
                            state.noteGroups[lastTriggered];
                        state.activeFocusTime =
                            triggeredGroup?.[0]?.time ??
                            state.activeFocusTime;
                    }

                    if (idx >= state.noteGroups.length) {
                        stepRef.current = 0;
                        setCurrentStep(0);
                        setPlayingStep(0);
                        runSetStoreStep?.(0);
                        state.activeFocusTime = 0;
                        state.displayCursorTime = 0;
                        autoPlayRef.current.active = false;
                        runStopAutoPlay?.();
                    } else {
                        stepRef.current = idx;
                        setCurrentStep(idx);
                        runSetStoreStep?.(idx);
                    }
                }
            }

            // 재생 중 강조 노트를 화면 좌측 앵커 안에 유지하도록
            // 카메라(displayCursorTime)를 부드럽게 이동시킵니다.
            const focusTime = state.activeFocusTime;
            const anchorSec =
                (innerWidth * FOCUS_ANCHOR_RATIO) /
                Math.max(pxPerSec, 1);
            const focusTarget =
                focusTime != null
                    ? Math.max(focusTime - anchorSec, 0)
                    : state.targetCursorTime;
            const focusAlpha =
                1 - Math.exp(-dtMs / FOCUS_SMOOTHING_MS);

            state.displayCursorTime +=
                (focusTarget - state.displayCursorTime) * focusAlpha;

            if (Math.abs(focusTarget - state.displayCursorTime) < 0.0005) {
                state.displayCursorTime = focusTarget;
            }

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, width, height);

            ctx.save();
            ctx.beginPath();
            ctx.rect(innerX - 2, innerY - 2, innerWidth + 4, innerHeight + 4);
            ctx.clip();

            const currentNotes = state.notes;
            const { minMidi, midiSpan } = state.midiRange;
            const usableHeight = Math.max(
                innerHeight - NOTE_HEIGHT,
                1
            );

            const activeNotesToDraw = [];

            for (let i = 0; i < currentNotes.length; i++) {
                const note = currentNotes[i];
                const deltaSec = note.time - state.displayCursorTime;
                const x = innerX + deltaSec * pxPerSec;

                // 화면 왼쪽/오른쪽 영역을 벗어난 노트만 스킵해 불필요한 드로우 방지
                if (
                    x + NOTE_WIDTH < innerX - NOTE_WIDTH ||
                    x > innerX + innerWidth + 80
                ) {
                    continue;
                }

                const midiRatio = Math.min(
                    Math.max((note.midi - minMidi) / midiSpan, 0),
                    1
                );
                const y =
                    innerY +
                    (1 - midiRatio) * usableHeight;

                // 지나간 노트(x < innerX)는 즉시 지우지 않고 왼쪽 경계 근처에서 서서히 감쇠
                const distPastLeft = Math.max(innerX - x, 0);
                const fadeAlpha =
                    distPastLeft > 0
                        ? Math.max(1 - distPastLeft / 60, 0.15)
                        : 1;

                if (state.activeUids.has(note._uid)) {
                    activeNotesToDraw.push({ note, x, y, fadeAlpha });
                    continue;
                }

                const isSharp = note.name?.includes('#');

                ctx.save();
                ctx.globalAlpha = fadeAlpha;
                ctx.fillStyle = isSharp ? '#b58900' : '#3b82f6';
                ctx.beginPath();
                ctx.rect(x, y, NOTE_WIDTH, NOTE_HEIGHT);
                ctx.fill();

                ctx.lineWidth = 2;
                ctx.strokeStyle = '#0f172a';
                ctx.stroke();
                ctx.restore();
            }

            // 현재 타겟 노트 그룹 강조
            for (let i = 0; i < activeNotesToDraw.length; i++) {
                const { x, y, fadeAlpha } = activeNotesToDraw[i];

                ctx.save();
                ctx.globalAlpha = fadeAlpha;
                ctx.fillStyle = 'goldenrod';
                ctx.beginPath();
                ctx.rect(x, y, NOTE_WIDTH, NOTE_HEIGHT);
                ctx.fill();

                ctx.lineWidth = 3;
                ctx.lineJoin = 'round';
                ctx.strokeStyle = '#fff8cc';
                ctx.stroke();
                ctx.restore();
            }

            ctx.restore();

            rafIdRef.current = requestAnimationFrame(draw);
        };

        rafIdRef.current = requestAnimationFrame(draw);

        return () => {
            if (rafIdRef.current != null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
            }
        };
    }, []);

    return (
        <div className="Track">
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                    position: 'relative',
                    zIndex: 5,
                    padding: '10px 16px',
                }}
            >
                <span>{currentFont?.fontName}</span>
                <span>{currentMidi?.title}</span>
                <span>BPM: {bpm.toFixed(1)}</span>
                <span>
                    진행: {currentStep} / {noteGroups.length}
                </span>
            </div>

            {loading && (
                <div className="track-loading">MIDI 파일 로딩 중...</div>
            )}

            {error && (
                <div
                    className="track-error"
                    style={{
                        color: 'red',
                        padding: '10px',
                    }}
                >
                    MIDI 오류: {error}
                </div>
            )}

            {!loading && !error && (
                <div className="track-info">
                    전체 노트: {notes.length}
                    {' / '}
                    노트 그룹: {noteGroups.length}
                </div>
            )}

            <div
                ref={viewportRef}
                className="track-viewport"
            >
                <canvas
                    ref={canvasRef}
                    style={{
                        display: 'block',
                        width: '100%',
                        height: '100%',
                    }}
                />
            </div>
        </div>
    );
};

export default Track;