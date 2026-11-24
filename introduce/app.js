/* ==========================================================================
   FreeTempo — project motion graphic
   A tiny timeline player: CSS drives entrances, this file drives time,
   scene changes, canvas piano rolls, synced interactions and optional audio.
   ========================================================================== */

import {
    PianoRoll,
    buildDemoNotes,
    buildAmbientNotes,
    countPassed
} from './piano-roll.js';

/* ───────────────────────── dom ───────────────────────── */

const $ = (id) => document.getElementById(id);

const stage = $('stage');
const sceneEls = Array.from(document.querySelectorAll('.scene'));
const bgCanvas = $('bg-canvas');
const appCanvas = $('app-canvas');
const seqCanvas = $('seq-canvas');
const audioCanvas = $('audio-canvas');

const hudIndex = $('hud-index');
const hudTitle = $('hud-title');
const ctrlIndex = $('ctrl-index');
const ctrlTitle = $('ctrl-title');
const timelineFill = $('timeline-fill');
const timelineSegments = $('timeline-segments');
const timeCurrent = $('time-current');
const timeTotal = $('time-total');

const btnPlay = $('btn-play');
const btnPrev = $('btn-prev');
const btnNext = $('btn-next');
const btnRestart = $('btn-restart');
const btnSound = $('btn-sound');
const btnFull = $('btn-full');
const btnHelp = $('btn-help');
const soundLabel = $('sound-label');
const helpPopover = $('help');
const helpClose = $('help-close');

const keycap = $('keycap');
const keyRipples = Array.from(document.querySelectorAll('#key-ripple i'));
const pressSteps = Array.from(document.querySelectorAll('#press-sequence .press-step'));

const appStep = $('app-step');
const appReadoutStep = $('app-readout-step');
const appPress = $('app-press');

const seqSteps = Array.from(document.querySelectorAll('#seq-steps .seq-step'));
const monitorCall = $('monitor-call');
const monitorStep = $('monitor-step');
const seqMonitor = document.querySelector('.seq-monitor');

const archCols = Array.from(document.querySelectorAll('.arch-col'));
const archTourIndex = $('arch-tour-index');
const archTourText = $('arch-tour-text');
const archTourDot = $('arch-tour-dot');

const audioResult = $('audio-result');
const outroReplay = $('outro-replay');

/* ───────────────────────── scenes ───────────────────────── */

const SCENES = sceneEls.map((el) => ({
    el,
    id: el.dataset.scene,
    title: el.dataset.title || el.dataset.scene,
    duration: Number(el.dataset.duration) || 8000
}));

const starts = [];
let totalDuration = 0;

for (const scene of SCENES) {
    starts.push(totalDuration);
    totalDuration += scene.duration;
}

const state = {
    time: 0,
    index: -1,
    playing: true,
    ended: false
};

const params = new URLSearchParams(window.location.search);

const demo = buildDemoNotes();
const ambient = buildAmbientNotes();

/* ───────────────────────── runtime ───────────────────────── */

const runtime = {
    fired: new Set(),
    seen: { shift: null, product: null, sequence: null },
    tour: { index: -1 },
    bgDirty: true,
    drawOnce: true
};

const SHIFT_PRESSES = [1600, 2900, 4300, 6000];
const SHIFT_CHORDS = [
    [64, 67, 72],
    [65, 69, 72],
    [67, 71, 74],
    [60, 64, 67]
];

const PRODUCT_PRESSES = [1800, 3100, 4400, 5700, 7000, 8300];

const SEQ_STEPS = [1600, 2900, 4200, 5500, 6800, 8100];
const SEQ_CALLS = [
    'onKeyDown → advanceStep()',
    'advanceStep() → playGroup(noteGroups[idx])',
    'synth.triggerAttackRelease(notes, duration, now, velocity)',
    'setCurrentStep(next) → store.currentStep',
    'displayCursorTime → groupTime − anchor',
    'requestAnimationFrame(draw)'
];

const ARCH_TOUR = [
    {
        at: 5200,
        col: 'ui',
        color: '#3b82f6',
        text: 'React 19 · 접이식 메뉴 · 셀렉터 · 컨트롤러'
    },
    {
        at: 7400,
        col: 'state',
        color: '#daa520',
        text: 'Zustand 5 · 곡 · 악기 · 진행 · 볼륨 · seekVersion'
    },
    {
        at: 9600,
        col: 'engine',
        color: '#fbbf24',
        text: 'Track.jsx · MIDI 파싱 · rAF 루프 · Tone.js'
    },
    {
        at: 11800,
        col: 'assets',
        color: '#94a3b8',
        text: '53 MIDI · Basic Pitch TF.js 모델 · Salamander 샘플'
    }
];

/* ───────────────────────── sound ───────────────────────── */

class SoundEngine {
    constructor() {
        this.enabled = false;
        this.ctx = null;
        this.master = null;
        this.sources = new Set();
    }

    async enable() {
        try {
            if (!this.ctx) {
                const AudioContextClass =
                    window.AudioContext || window.webkitAudioContext;

                if (!AudioContextClass) return false;

                this.ctx = new AudioContextClass();
                this.master = this.ctx.createGain();
                this.master.gain.value = 0.55;
                this.master.connect(this.ctx.destination);
            }

            await this.ctx.resume();
            this.enabled = true;
            return true;
        } catch (error) {
            console.warn('[FreeTempo] audio unavailable', error);
            return false;
        }
    }

    disable() {
        this.enabled = false;
        this.suspend();
    }

    suspend() {
        if (this.ctx && this.ctx.state === 'running') {
            this.ctx.suspend().catch(() => {});
        }
    }

    resume() {
        if (this.enabled && this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
    }

    stopAll() {
        for (const source of this.sources) {
            try {
                source.stop();
            } catch {
                /* already stopped */
            }
        }

        this.sources.clear();
    }

    note(midi, when, duration, gain) {
        if (!this.ctx || !this.master) return;

        const ctx = this.ctx;
        const frequency = 440 * Math.pow(2, (midi - 69) / 12);
        const envelope = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2400, when);
        filter.Q.value = 0.6;

        envelope.gain.setValueAtTime(0.0001, when);
        envelope.gain.exponentialRampToValueAtTime(
            Math.max(gain * 0.26, 0.0002),
            when + 0.014
        );
        envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);

        filter.connect(envelope);
        envelope.connect(this.master);

        const partials = [
            { type: 'sine', ratio: 1, level: 1 },
            { type: 'triangle', ratio: 2, level: 0.17 },
            { type: 'sine', ratio: 3, level: 0.06 }
        ];

        for (const partial of partials) {
            const osc = ctx.createOscillator();
            const partialGain = ctx.createGain();

            osc.type = partial.type;
            osc.frequency.value = frequency * partial.ratio;
            osc.detune.value = (Math.random() - 0.5) * 4;

            partialGain.gain.value = partial.level;
            osc.connect(partialGain);
            partialGain.connect(filter);

            osc.start(when);
            osc.stop(when + duration + 0.08);

            this.sources.add(osc);
            osc.onended = () => this.sources.delete(osc);
        }
    }

    chord(midis, { gain = 0.32, duration = 1.1, spread = 0 } = {}) {
        if (!this.enabled || !this.ctx) return;

        const now = this.ctx.currentTime + 0.02;

        midis.forEach((midi, index) => {
            this.note(midi, now + spread * index, duration, gain);
        });
    }

    whoosh() {
        if (!this.enabled || !this.ctx || !this.master) return;

        const ctx = this.ctx;
        const now = ctx.currentTime + 0.01;
        const length = Math.floor(ctx.sampleRate * 0.5);
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let index = 0; index < length; index += 1) {
            data[index] = (Math.random() * 2 - 1) * (1 - index / length);
        }

        const source = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const envelope = ctx.createGain();

        filter.type = 'bandpass';
        filter.Q.value = 0.8;
        filter.frequency.setValueAtTime(320, now);
        filter.frequency.exponentialRampToValueAtTime(2200, now + 0.34);

        envelope.gain.setValueAtTime(0.0001, now);
        envelope.gain.exponentialRampToValueAtTime(0.045, now + 0.05);
        envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.46);

        source.buffer = buffer;
        source.connect(filter);
        filter.connect(envelope);
        envelope.connect(this.master);
        source.start(now);
        source.stop(now + 0.5);

        this.sources.add(source);
        source.onended = () => this.sources.delete(source);
    }
}

const sound = new SoundEngine();

function productChord(groupIndex) {
    const group = demo.groups[groupIndex];
    return group ? group.map((note) => note.midi) : [];
}

const AUDIO_EVENTS = {
    intro: [{ at: 900, notes: [48, 55, 64], duration: 3.2, gain: 0.2 }],
    shift: SHIFT_PRESSES.map((at, index) => ({
        at,
        notes: SHIFT_CHORDS[index],
        duration: 1.5,
        gain: 0.3
    })),
    product: PRODUCT_PRESSES.map((at, index) => ({
        at,
        notes: productChord(index),
        duration: 1.45,
        gain: 0.3
    })),
    sequence: [
        { at: 2900, notes: [60, 64, 67, 72], duration: 1.3, gain: 0.26 }
    ],
    audio: [
        { at: 8700, notes: [72, 76, 79, 84], duration: 1.6, gain: 0.22 }
    ],
    outro: [
        { at: 1000, notes: [48, 55, 64, 67, 72], duration: 3.4, gain: 0.24 }
    ]
};

/* ───────────────────────── formatting ───────────────────────── */

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function pad(value) {
    return String(value).padStart(2, '0');
}

function formatTime(ms) {
    const safe = Math.max(ms, 0);
    const seconds = Math.floor(safe / 1000);
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${pad(seconds % 60)}`;
}

function setText(element, text) {
    if (element && element.textContent !== text) {
        element.textContent = text;
    }
}

function sceneAtTime(time) {
    for (let index = SCENES.length - 1; index >= 0; index -= 1) {
        if (time >= starts[index]) return index;
    }

    return 0;
}

function sceneLocal() {
    if (state.index < 0) return 0;
    return state.time - starts[state.index];
}

/* ───────────────────────── stage scale ───────────────────────── */

function fitStage() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const reserved = width <= 820 ? 62 : 86;
    const scale = Math.max(
        Math.min(width / 1600, (height - reserved) / 900),
        0.12
    );

    const scaledHeight = 900 * scale;
    const free = Math.max(height - scaledHeight, 0);
    const top = Math.max((free - reserved) / 2, 6);
    const shift = top - free / 2;

    stage.style.setProperty('--stage-scale', String(scale));
    stage.style.setProperty('--stage-shift', `${shift.toFixed(2)}px`);

    runtime.drawOnce = true;
    runtime.bgDirty = true;
}

/* ───────────────────────── canvases ───────────────────────── */

let bgRoll = null;
let appRoll = null;
let seqRoll = null;
let audioRoll = null;

function buildRolls() {
    bgRoll = new PianoRoll(bgCanvas, {
        bpm: 120,
        pixelsPerBeat: 80,
        noteWidth: 20,
        noteHeight: 10,
        paddingX: 0,
        paddingTop: 80,
        paddingBottom: 80,
        laneLines: false,
        beatGrid: false,
        anchor: false,
        maxDpr: 1.5
    });

    appRoll = new PianoRoll(appCanvas, {
        bpm: demo.bpm,
        pixelsPerBeat: 80,
        noteWidth: 20,
        noteHeight: 12,
        paddingX: 24,
        paddingTop: 18,
        paddingBottom: 18,
        laneLines: true,
        beatGrid: true,
        anchor: true
    });

    seqRoll = new PianoRoll(seqCanvas, {
        bpm: demo.bpm,
        pixelsPerBeat: 80,
        noteWidth: 22,
        noteHeight: 13,
        paddingX: 22,
        paddingTop: 16,
        paddingBottom: 16,
        laneLines: true,
        beatGrid: true,
        anchor: true
    });

    audioRoll = new PianoRoll(audioCanvas, {
        bpm: demo.bpm,
        pixelsPerBeat: 36,
        noteWidth: 9,
        noteHeight: 5,
        paddingX: 8,
        paddingTop: 6,
        paddingBottom: 6,
        laneLines: false,
        beatGrid: false,
        anchor: false
    });
}

function drawAmbient(cursor, alpha) {
    if (!bgRoll) return;

    bgRoll.draw({
        notes: ambient.notes,
        groups: ambient.groups,
        cursor,
        alpha,
        minMidi: 44,
        maxMidi: 90
    });
}

/* ───────────────────────── timeline ui ───────────────────────── */

function buildTimeline() {
    timelineSegments.innerHTML = '';

    SCENES.forEach((scene, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'timeline-seg';
        button.style.flexGrow = String(scene.duration);
        button.title = `${pad(index + 1)} · ${scene.title}`;
        button.setAttribute('aria-label', `${scene.title} 장면으로 이동`);
        button.addEventListener('click', () => seekToScene(index));
        timelineSegments.appendChild(button);
    });

    setText(timeTotal, formatTime(totalDuration));
}

function updateMeta() {
    if (state.index < 0) return;

    const scene = SCENES[state.index];
    setText(hudIndex, pad(state.index + 1));
    setText(hudTitle, scene.title.toUpperCase());
    setText(ctrlIndex, pad(state.index + 1));
    setText(ctrlTitle, scene.title);
}

function updateProgress() {
    const ratio = totalDuration > 0 ? clamp(state.time / totalDuration, 0, 1) : 0;
    timelineFill.style.width = `${(ratio * 100).toFixed(3)}%`;
    setText(timeCurrent, formatTime(state.time));
}

/* ───────────────────────── scene visuals ───────────────────────── */

const keyStage = document.querySelector('.key-stage');
const ANCHOR_SMOOTH_MS = 120;

function intensityAt(times, local, decay = 200) {
    for (let index = times.length - 1; index >= 0; index -= 1) {
        if (local >= times[index]) {
            return Math.exp(-(local - times[index]) / decay);
        }
    }

    return 0;
}

function anchorSeconds(roll) {
    if (!roll || !roll.width) return 0;

    const pxPerSec = (demo.bpm / 60) * roll.options.pixelsPerBeat;
    const anchorX = roll.width * roll.options.anchorRatio;

    return Math.max((anchorX - roll.options.paddingX) / Math.max(pxPerSec, 1), 0);
}

function cameraCursor(groups, pressTimes, local, roll, leadIn = 1.55) {
    if (!groups.length) return 0;

    const lastIndex = groups.length - 1;
    const anchor = anchorSeconds(roll);
    const home = Math.max(groups[0][0].time - anchor - leadIn, 0);
    const passed = countPassed(pressTimes, local);

    if (passed === 0) return home;

    const to = groups[Math.min(passed, lastIndex)][0].time - anchor;
    const from =
        passed >= 2
            ? groups[Math.min(passed - 1, lastIndex)][0].time - anchor
            : home;
    const since = Math.max(local - pressTimes[passed - 1], 0);
    const eased = 1 - Math.exp(-since / ANCHOR_SMOOTH_MS);

    return Math.max(from + (to - from) * eased, 0);
}

function rippleKey() {
    const ripple = keyRipples[0]?.parentElement;
    if (!ripple) return;

    ripple.classList.remove('is-pulsing');
    void ripple.offsetWidth;
    ripple.classList.add('is-pulsing');
}

function updateShift(local) {
    const passed = countPassed(SHIFT_PRESSES, local);
    const press = intensityAt(SHIFT_PRESSES, local, 240);

    keyStage.style.setProperty('--press', press.toFixed(3));
    keycap.classList.toggle('is-down', press > 0.45);

    pressSteps.forEach((step, index) => {
        step.classList.toggle('is-on', index === passed - 1);
        step.classList.toggle('is-done', index < passed - 1);
    });

    if (runtime.seen.shift != null && passed > runtime.seen.shift) {
        rippleKey();
    }

    runtime.seen.shift = passed;
}

function updateProduct(local) {
    if (!appRoll.width) appRoll.resize();

    const passed = countPassed(PRODUCT_PRESSES, local);
    const press = intensityAt(PRODUCT_PRESSES, local, 220);
    const step = Math.min(7 + passed, 148);

    appPress.style.setProperty('--press', press.toFixed(3));
    setText(appStep, pad(step));
    setText(appReadoutStep, `STEP ${pad(step)} / 148`);

    if (state.playing || runtime.drawOnce) {
        appRoll.draw({
            notes: demo.notes,
            groups: demo.groups,
            focusIndex: Math.min(passed, demo.groups.length - 1),
            cursor: cameraCursor(demo.groups, PRODUCT_PRESSES, local, appRoll, 1.5),
            pulse: press,
            minMidi: 40,
            maxMidi: 76
        });
    }

    runtime.seen.product = passed;
}

function updateSequence(local) {
    if (!seqRoll.width) seqRoll.resize();

    const passed = countPassed(SEQ_STEPS, local);
    const press = intensityAt(SEQ_STEPS, local, 220);
    const active = Math.min(passed, SEQ_CALLS.length - 1);

    seqMonitor.classList.toggle('tone', press > 0.16);

    seqSteps.forEach((step, index) => {
        step.classList.toggle('is-on', index === active);
        step.classList.toggle('is-done', index < passed);
    });

    setText(monitorCall, SEQ_CALLS[active]);
    setText(monitorStep, `${12 + passed} / 148`);

    if (state.playing || runtime.drawOnce) {
        seqRoll.draw({
            notes: demo.notes,
            groups: demo.groups,
            focusIndex: Math.min(passed, demo.groups.length - 1),
            cursor: cameraCursor(demo.groups, SEQ_STEPS, local, seqRoll, 1.6),
            pulse: press,
            minMidi: 40,
            maxMidi: 76
        });
    }

    runtime.seen.sequence = passed;
}

function updateArchitecture(local) {
    let index = -1;

    for (let i = 0; i < ARCH_TOUR.length; i += 1) {
        if (local >= ARCH_TOUR[i].at) index = i;
    }

    if (index === runtime.tour.index) return;

    runtime.tour.index = index;

    archCols.forEach((column) => {
        column.classList.toggle(
            'is-focus',
            index >= 0 && column.dataset.col === ARCH_TOUR[index].col
        );
    });

    if (index < 0) return;

    const item = ARCH_TOUR[index];
    setText(archTourIndex, `${pad(index + 1)} / 04`);
    setText(archTourText, item.text);
    archTourDot.style.background = item.color;
    archTourDot.style.boxShadow = `0 0 12px ${item.color}`;
}

function updateAudio(local) {
    const label =
        local < 1500
            ? 'UPLOADING AUDIO …'
            : local < 8600
              ? 'ANALYZING AUDIO …'
              : 'MIDI READY · 148 NOTES';

    setText(audioResult, label);

    if (!audioRoll.width) audioRoll.resize();

    if (state.playing || runtime.drawOnce) {
        audioRoll.draw({
            notes: ambient.notes,
            groups: ambient.groups,
            cursor: 2 + (local / 1000) * 0.62,
            alpha: 0.85,
            minMidi: 44,
            maxMidi: 90
        });
    }
}

/* ───────────────────────── audio events ───────────────────────── */

function primeAudio(sceneId, local) {
    const events = AUDIO_EVENTS[sceneId];
    if (!events) return;

    events.forEach((event, index) => {
        if (local >= event.at) {
            runtime.fired.add(`${sceneId}:${index}`);
        }
    });
}

function fireAudio(sceneId, local) {
    const events = AUDIO_EVENTS[sceneId];
    if (!events) return;

    events.forEach((event, index) => {
        const key = `${sceneId}:${index}`;

        if (runtime.fired.has(key) || local < event.at) return;

        runtime.fired.add(key);

        if (sound.enabled) {
            sound.chord(event.notes, {
                duration: event.duration,
                gain: event.gain
            });
        }
    });
}

/* ───────────────────────── scene lifecycle ───────────────────────── */

function resetRuntime(sceneId, local) {
    runtime.seen.shift = countPassed(SHIFT_PRESSES, local);
    runtime.seen.product = countPassed(PRODUCT_PRESSES, local);
    runtime.seen.sequence = countPassed(SEQ_STEPS, local);
    runtime.tour.index = -2;
    runtime.fired.clear();
    runtime.bgDirty = true;
    runtime.drawOnce = true;

    primeAudio(sceneId, local);

    keycap.classList.remove('is-down');
    keyStage.style.setProperty('--press', '0');
    appPress.style.setProperty('--press', '0');
    seqMonitor.classList.remove('tone');

    pressSteps.forEach((step) => {
        step.classList.remove('is-on', 'is-done');
    });
    seqSteps.forEach((step) => {
        step.classList.remove('is-on', 'is-done');
    });
}

function syncCssAnimations(element, localMs) {
    if (typeof element.getAnimations !== 'function') return;

    const time = Math.max(localMs, 0);

    for (const animation of element.getAnimations({ subtree: true })) {
        try {
            animation.currentTime = time;
        } catch {
            /* not seekable */
        }
    }
}

function enterScene(index) {
    const scene = SCENES[index];
    if (!scene) return;

    const local = Math.max(state.time - starts[index], 0);
    const previous = state.index;

    for (const other of SCENES) {
        if (other !== scene) other.el.classList.remove('is-active');
    }

    scene.el.classList.remove('is-active');
    void scene.el.offsetWidth;
    scene.el.classList.add('is-active');

    state.index = index;
    resetRuntime(scene.id, local);
    updateMeta();
    updateProgress();
    syncCssAnimations(scene.el, local);

    if (previous !== -1 && previous !== index) flashCut();
}

let cutTimer = 0;

function flashCut() {
    stage.classList.remove('is-cut');
    void stage.offsetWidth;
    stage.classList.add('is-cut');

    window.clearTimeout(cutTimer);
    cutTimer = window.setTimeout(() => stage.classList.remove('is-cut'), 620);
}

/* ───────────────────────── playback ───────────────────────── */

function setPlaying(playing) {
    if (playing && state.ended) {
        restart();
        return;
    }

    state.playing = playing;
    stage.classList.toggle('is-paused', !playing);

    btnPlay.setAttribute(
        'aria-label',
        playing ? '일시정지' : '재생'
    );

    if (playing) {
        sound.resume();
    } else {
        sound.stopAll();
        sound.suspend();
    }
}

function finish() {
    state.playing = false;
    state.ended = true;
    stage.classList.remove('is-paused', 'is-cut');
    stage.classList.add('is-ended');
    sound.stopAll();
    sound.suspend();
    btnPlay.setAttribute('aria-label', '다시 재생');
}

function restart() {
    state.ended = false;
    state.time = 0;
    stage.classList.remove('is-ended', 'is-cut');
    enterScene(0);
    setPlaying(true);
}

function seekToScene(index, options = {}) {
    const target = Math.min(Math.max(index, 0), SCENES.length - 1);

    state.ended = false;
    state.time = starts[target];
    stage.classList.remove('is-ended');
    enterScene(target);

    if (options.autoPlay) setPlaying(true);
    else if (state.playing) sound.resume();
}

/* ───────────────────────── main loop ───────────────────────── */

let lastTimestamp = 0;
let ambientAccum = 0;

function frame(timestamp) {
    requestAnimationFrame(frame);

    if (!lastTimestamp) lastTimestamp = timestamp;

    const delta = clamp((timestamp - lastTimestamp) / 1000, 0, 0.1);
    lastTimestamp = timestamp;

    if (state.playing && !state.ended) {
        state.time += delta * 1000;

        if (state.time >= totalDuration) {
            state.time = totalDuration;
            finish();
        }
    }

    const index = sceneAtTime(state.time);
    if (index !== state.index) enterScene(index);

    const scene = SCENES[state.index];
    if (!scene) return;

    const local = Math.max(state.time - starts[state.index], 0);

    updateProgress();
    fireAudio(scene.id, local);

    switch (scene.id) {
        case 'shift':
            updateShift(local);
            break;
        case 'product':
            updateProduct(local);
            break;
        case 'sequence':
            updateSequence(local);
            break;
        case 'architecture':
            updateArchitecture(local);
            break;
        case 'audio':
            updateAudio(local);
            break;
        default:
            break;
    }

    if (state.playing || runtime.bgDirty) {
        ambientAccum += delta;

        if (ambientAccum >= 0.075) {
            ambientAccum = 0;
            runtime.bgDirty = false;
            drawAmbient(4 + (state.time / 1000) * 0.34, 0.22);
        }
    }

    runtime.drawOnce = false;
}

/* ───────────────────────── sound toggle ───────────────────────── */

async function toggleSound(force) {
    const next = typeof force === 'boolean' ? force : !sound.enabled;

    if (next) {
        const ready = await sound.enable();
        if (!ready) return;
        sound.resume();
    } else {
        sound.stopAll();
        sound.disable();
    }

    btnSound.classList.toggle('is-sound', sound.enabled);
    btnSound.setAttribute(
        'aria-label',
        sound.enabled ? '사운드 끄기' : '사운드 켜기'
    );
    setText(soundLabel, sound.enabled ? 'ON' : 'OFF');
}

/* ───────────────────────── help / fullscreen ───────────────────────── */

function setHelp(open) {
    helpPopover.classList.toggle('is-open', open);
    helpPopover.setAttribute('aria-hidden', String(!open));
}

async function toggleFullscreen() {
    try {
        if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
        } else {
            await document.exitFullscreen();
        }
    } catch {
        /* fullscreen rejected */
    }
}

document.addEventListener('fullscreenchange', () => {
    btnFull.classList.toggle('is-active', Boolean(document.fullscreenElement));
    fitStage();
});

/* ───────────────────────── wiring ───────────────────────── */

function bindControls() {
    btnPlay.addEventListener('click', () => setPlaying(!state.playing));

    btnPrev.addEventListener('click', () => {
        if (state.time - starts[state.index] > 1400) {
            seekToScene(state.index);
        } else {
            seekToScene(state.index - 1);
        }
    });

    btnNext.addEventListener('click', () => {
        if (state.index >= SCENES.length - 1) {
            seekToScene(0, { autoPlay: state.playing });
        } else {
            seekToScene(state.index + 1);
        }
    });

    btnRestart.addEventListener('click', restart);
    outroReplay.addEventListener('click', restart);
    btnSound.addEventListener('click', () => toggleSound());
    btnFull.addEventListener('click', toggleFullscreen);

    btnHelp.addEventListener('click', () => {
        setHelp(!helpPopover.classList.contains('is-open'));
    });
    helpClose.addEventListener('click', () => setHelp(false));

    stage.addEventListener('click', (event) => {
        if (event.target.closest('a, button, input, label')) return;
        setPlaying(!state.playing);
    });

    window.addEventListener('resize', fitStage);

    window.addEventListener('keydown', (event) => {
        const target = event.target;

        if (
            target instanceof HTMLElement &&
            (target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable)
        ) {
            return;
        }

        if (event.metaKey || event.ctrlKey || event.altKey) return;

        switch (event.key) {
            case ' ':
            case 'Spacebar':
                event.preventDefault();
                setPlaying(!state.playing);
                break;
            case 'ArrowLeft':
                event.preventDefault();
                seekToScene(state.index - 1);
                break;
            case 'ArrowRight':
                event.preventDefault();
                seekToScene(state.index + 1);
                break;
            case 'Home':
                event.preventDefault();
                restart();
                break;
            case 'r':
            case 'R':
                restart();
                break;
            case 'm':
            case 'M':
                toggleSound();
                break;
            case 'f':
            case 'F':
                toggleFullscreen();
                break;
            case '?':
                setHelp(!helpPopover.classList.contains('is-open'));
                break;
            case 'Escape':
                setHelp(false);
                break;
            default:
                if (/^[1-9]$/.test(event.key)) {
                    seekToScene(Number(event.key) - 1);
                }
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            sound.suspend();
        } else if (sound.enabled && state.playing) {
            sound.resume();
        }
    });
}

/* ───────────────────────── boot ───────────────────────── */

function boot() {
    buildTimeline();

    const sceneParam = Number.parseInt(params.get('scene'), 10);
    const sceneIndex = clamp(
        Number.isFinite(sceneParam) ? sceneParam - 1 : 0,
        0,
        SCENES.length - 1
    );

    let startTime = starts[sceneIndex];

    const atParam = Number.parseFloat(params.get('at'));
    if (Number.isFinite(atParam)) {
        startTime += clamp(atParam, 0, SCENES[sceneIndex].duration / 1000) * 1000;
    }

    const timeParam = Number.parseFloat(params.get('t'));
    if (Number.isFinite(timeParam)) {
        startTime = clamp(timeParam, 0, totalDuration / 1000) * 1000;
    }

    state.time = Math.min(startTime, totalDuration);
    state.index = -1;

    buildRolls();
    fitStage();

    enterScene(sceneAtTime(state.time));

    const reduced = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
    ).matches;
    const startPaused =
        params.get('paused') === '1' || (reduced && params.get('paused') !== '0');

    setPlaying(!startPaused);

    if (params.get('sound') === '1') {
        toggleSound(true);
    }

    updateProgress();
    runtime.bgDirty = true;

    requestAnimationFrame(frame);
}

bindControls();
boot();

