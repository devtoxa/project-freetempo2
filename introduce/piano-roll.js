/* ==========================================================================
   FreeTempo — canvas piano roll
   A small, dependency-free renderer that mirrors the app's Track.jsx rules:
     · notes flow right → left as the camera (displayCursorTime) advances
     · the focused group is pinned at the 18% anchor
     · natural notes are blue, sharps amber, the focused group goldenrod
     · notes fade out over 60px after the left edge
   ========================================================================== */

const SHARP_PCS = new Set([1, 3, 6, 8, 10]);

function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function groupNotes(notes, threshold = 0.02) {
    const groups = [];

    for (const note of notes) {
        const last = groups[groups.length - 1];

        if (!last || Math.abs(note.time - last[0].time) > threshold) {
            groups.push([note]);
        } else {
            last.push(note);
        }
    }

    return groups;
}

function withUids(notes, prefix) {
    return notes
        .slice()
        .sort((a, b) => a.time - b.time || a.midi - b.midi)
        .map((note, index) => ({ ...note, uid: `${prefix}-${index}` }));
}

/* ── a short, hummable piece used by the product / monitor canvases ──────── */

export function buildDemoNotes() {
    const bpm = 120;
    const secondsPerBeat = 60 / bpm;
    const leadIn = 4;
    const raw = [];

    const add = (beat, midi, beats, velocity = 0.78) => {
        raw.push({ midi, beat, dur: beats, velocity });
    };

    // melody — Ode to Joy ­shaped, with a little turn at the end
    const melody = [
        [0, 64, 1], [1, 64, 1], [2, 65, 1], [3, 67, 1],
        [4, 67, 1], [5, 65, 1], [6, 64, 1], [7, 62, 1],
        [8, 60, 1], [9, 60, 1], [10, 62, 1], [11, 64, 1],
        [12, 64, 1.5], [13.5, 62, 0.5], [14, 62, 2],
        [16, 62, 1], [17, 62, 1], [18, 64, 1], [19, 60, 1],
        [20, 62, 1], [21, 64, 1], [22, 65, 1], [23, 64, 1],
        [24, 62, 1], [25, 60, 1], [26, 62, 1], [27, 60, 2]
    ];

    for (const [beat, midi, dur] of melody) {
        add(beat, midi, dur, 0.8);
    }

    // sustained harmony + bass make several input groups into chords
    const chords = [
        [0, [48, 55], 2.2],
        [4, [43, 50], 2.2],
        [8, [45, 52], 2.2],
        [12, [41, 48], 2.2],
        [16, [48, 55], 2.2],
        [20, [43, 50], 2.2],
        [24, [48, 55], 2.2]
    ];

    for (const [beat, pitches, dur] of chords) {
        for (const midi of pitches) {
            add(beat, midi, dur, 0.5);
        }
    }

    const notes = withUids(
        raw.map((note) => ({
            midi: note.midi,
            time: (note.beat + leadIn) * secondsPerBeat,
            duration: Math.max(note.dur, 0.18) * secondsPerBeat,
            velocity: note.velocity
        })),
        'demo'
    );

    return { bpm, notes, groups: groupNotes(notes) };
}

/* ── sparse ambient notes for the intro / features / outro backdrop ─────── */

export function buildAmbientNotes() {
    const bpm = 120;
    const secondsPerBeat = 60 / bpm;
    const random = mulberry32(20261124);
    const raw = [];
    const scaleSteps = [-2, -1, -1, 0, 0, 1, 1, 2, 3];
    let midi = 67;

    for (let index = 0; index < 210; index += 1) {
        const beat = -10 + index * 0.62 + random() * 0.22;
        const step = scaleSteps[Math.floor(random() * scaleSteps.length)];
        midi = clamp(midi + step, 50, 86);

        const duration = 0.55 + random() * 2.4;
        raw.push({ midi, beat, dur: duration, velocity: 0.4 + random() * 0.4 });

        if (random() < 0.3) {
            raw.push({
                midi: midi - 12,
                beat,
                dur: duration,
                velocity: 0.35
            });
        }

        if (random() < 0.16) {
            raw.push({
                midi: clamp(midi + (random() < 0.5 ? 3 : 4), 50, 88),
                beat,
                dur: duration * 0.7,
                velocity: 0.3
            });
        }
    }

    const notes = withUids(
        raw.map((note) => ({
            midi: note.midi,
            time: note.beat * secondsPerBeat,
            duration: note.dur * secondsPerBeat,
            velocity: note.velocity
        })),
        'ambient'
    );

    return { bpm, notes, groups: groupNotes(notes) };
}

/* ── renderer ───────────────────────────────────────────────────────────── */

export class PianoRoll {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.options = {
            bpm: 120,
            pixelsPerBeat: 80,
            noteWidth: 20,
            noteHeight: 12,
            paddingX: 24,
            paddingTop: 16,
            paddingBottom: 16,
            anchorRatio: 0.18,
            radius: 3,
            laneLines: true,
            beatGrid: true,
            anchor: false,
            fade: 72,
            maxDpr: 2.5,
            ...options
        };
        this.width = 0;
        this.height = 0;
        this.dpr = 1;
        this.resize();
    }

    resize() {
        const canvas = this.canvas;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        if (!width || !height) {
            return false;
        }

        const dpr = Math.min(window.devicePixelRatio || 1, this.options.maxDpr);
        this.width = width;
        this.height = height;
        this.dpr = dpr;

        const pixelWidth = Math.round(width * dpr);
        const pixelHeight = Math.round(height * dpr);

        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
            canvas.width = pixelWidth;
            canvas.height = pixelHeight;
        }

        return true;
    }

    draw(view = {}) {
        if (this.canvas.clientWidth !== this.width || this.canvas.clientHeight !== this.height) {
            if (!this.resize()) return;
        }
        if (!this.width || !this.height) return;

        const { ctx } = this;
        const options = this.options;
        const width = this.width;
        const height = this.height;
        const alpha = view.alpha ?? 1;

        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        if (alpha <= 0) return;

        const padX = options.paddingX;
        const padTop = options.paddingTop;
        const innerWidth = Math.max(width - padX * 2, 1);
        const innerHeight = Math.max(height - padTop - options.paddingBottom, 1);
        const pxPerSec = (options.bpm / 60) * options.pixelsPerBeat;
        const anchorX = width * options.anchorRatio;
        const cursor = view.cursor ?? 0;
        const notes = view.notes ?? [];
        const groups = view.groups ?? [];
        const focusIndex = view.focusIndex ?? -1;
        const focusGroup =
            focusIndex >= 0 && focusIndex < groups.length ? groups[focusIndex] : [];
        const focusUids = new Set(focusGroup.map((note) => note.uid));

        let minMidi = view.minMidi;
        let maxMidi = view.maxMidi;

        if (minMidi == null || maxMidi == null) {
            minMidi = 21;
            maxMidi = 108;

            if (notes.length) {
                minMidi = Infinity;
                maxMidi = -Infinity;

                for (const note of notes) {
                    if (note.midi < minMidi) minMidi = note.midi;
                    if (note.midi > maxMidi) maxMidi = note.midi;
                }

                minMidi -= 1;
                maxMidi += 1;
            }
        }

        const midiSpan = Math.max(maxMidi - minMidi, 1);
        const noteWidth = options.noteWidth;
        const noteHeight = options.noteHeight;
        const usableHeight = Math.max(innerHeight - noteHeight, 1);
        const beatSec = 60 / options.bpm;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.rect(0, padTop - 2, width, innerHeight + 4);
        ctx.clip();

        // horizontal octave lanes
        if (options.laneLines) {
            for (let midi = Math.ceil(minMidi / 12) * 12; midi <= maxMidi; midi += 12) {
                const ratio = clamp((midi - minMidi) / midiSpan, 0, 1);
                const y = padTop + (1 - ratio) * usableHeight + noteHeight / 2;

                ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, y + 0.5);
                ctx.lineTo(width, y + 0.5);
                ctx.stroke();
            }
        }

        // beat / bar grid
        if (options.beatGrid) {
            const firstBeat = Math.floor(cursor / beatSec);
            const visibleBeats = innerWidth / (pxPerSec * beatSec) + 2;
            const lastBeat = Math.ceil(firstBeat + visibleBeats);

            for (let beat = firstBeat; beat <= lastBeat; beat += 1) {
                const x = padX + (beat * beatSec - cursor) * pxPerSec;
                if (x < -2 || x > width + 2) continue;

                const isBar = ((beat % 4) + 4) % 4 === 0;
                ctx.strokeStyle = isBar
                    ? 'rgba(255, 255, 255, 0.06)'
                    : 'rgba(255, 255, 255, 0.022)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x + 0.5, padTop - 2);
                ctx.lineTo(x + 0.5, padTop + innerHeight + 2);
                ctx.stroke();
            }
        }

        // anchor guide
        if (options.anchor) {
            const band = ctx.createLinearGradient(anchorX - 26, 0, anchorX + 26, 0);
            band.addColorStop(0, 'rgba(218, 165, 32, 0)');
            band.addColorStop(0.5, 'rgba(218, 165, 32, 0.07)');
            band.addColorStop(1, 'rgba(218, 165, 32, 0)');
            ctx.fillStyle = band;
            ctx.fillRect(anchorX - 26, padTop - 2, 52, innerHeight + 4);

            const line = ctx.createLinearGradient(0, padTop, 0, padTop + innerHeight);
            line.addColorStop(0, 'rgba(218, 165, 32, 0)');
            line.addColorStop(0.18, 'rgba(218, 165, 32, 0.5)');
            line.addColorStop(0.82, 'rgba(218, 165, 32, 0.5)');
            line.addColorStop(1, 'rgba(218, 165, 32, 0)');

            ctx.strokeStyle = line;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(anchorX + 0.5, padTop - 2);
            ctx.lineTo(anchorX + 0.5, padTop + innerHeight + 2);
            ctx.stroke();

            ctx.fillStyle = 'rgba(218, 165, 32, 0.8)';
            ctx.beginPath();
            ctx.moveTo(anchorX - 4, padTop);
            ctx.lineTo(anchorX + 4, padTop);
            ctx.lineTo(anchorX, padTop + 6);
            ctx.closePath();
            ctx.fill();
        }

        // input pulse travelling down the anchor
        if (view.pulse > 0.001) {
            const pulseHeight = innerHeight * 0.5;
            const pulseY =
                padTop + (1 - clamp(view.pulse, 0, 1)) * (innerHeight - pulseHeight);
            const glow = ctx.createLinearGradient(0, pulseY, 0, pulseY + pulseHeight);
            glow.addColorStop(0, 'rgba(255, 248, 204, 0)');
            glow.addColorStop(0.5, `rgba(255, 248, 204, ${0.28 * view.pulse})`);
            glow.addColorStop(1, 'rgba(255, 248, 204, 0)');
            ctx.fillStyle = glow;
            ctx.fillRect(anchorX - 10, pulseY, 20, pulseHeight);
        }

        const inactive = [];
        const active = [];

        for (const note of notes) {
            const x = padX + (note.time - cursor) * pxPerSec;

            if (
                x + noteWidth < -options.fade ||
                x > width + 24
            ) {
                continue;
            }

            const ratio = clamp((note.midi - minMidi) / midiSpan, 0, 1);
            const y = padTop + (1 - ratio) * usableHeight;

            const pastLeft = Math.max(padX - x, 0);
            let noteAlpha = pastLeft > 0 ? Math.max(1 - pastLeft / options.fade, 0.08) : 1;

            if (x > width - options.fade) {
                noteAlpha *= clamp((width - x) / options.fade, 0, 1);
            }

            const item = { note, x, y, alpha: noteAlpha };

            if (focusUids.has(note.uid)) {
                active.push(item);
            } else {
                inactive.push(item);
            }
        }

        const paintNote = (item, highlighted) => {
            const { note, x, y, alpha: noteAlpha } = item;
            const isSharp = SHARP_PCS.has(((note.midi % 12) + 12) % 12);

            ctx.save();
            ctx.globalAlpha = alpha * noteAlpha;
            ctx.fillStyle = highlighted
                ? '#daa520'
                : isSharp
                  ? '#b58900'
                  : '#3b82f6';

            if (highlighted) {
                ctx.shadowColor = 'rgba(218, 165, 32, 0.65)';
                ctx.shadowBlur = 16;
            }

            ctx.beginPath();
            ctx.roundRect(x, y, noteWidth, noteHeight, options.radius);
            ctx.fill();

            ctx.shadowBlur = 0;
            ctx.lineWidth = highlighted ? 2.5 : 1.4;
            ctx.strokeStyle = highlighted ? '#fff8cc' : '#0f172a';
            ctx.stroke();
            ctx.restore();
        };

        for (const item of inactive) paintNote(item, false);
        for (const item of active) paintNote(item, true);

        // soft left / right / top / bottom fade
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'destination-out';

        const leftFade = ctx.createLinearGradient(0, 0, options.fade, 0);
        leftFade.addColorStop(0, 'rgba(0,0,0,1)');
        leftFade.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = leftFade;
        ctx.fillRect(0, padTop - 2, options.fade, innerHeight + 4);

        const rightFade = ctx.createLinearGradient(width - 34, 0, width, 0);
        rightFade.addColorStop(0, 'rgba(0,0,0,0)');
        rightFade.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.fillStyle = rightFade;
        ctx.fillRect(width - 34, padTop - 2, 34, innerHeight + 4);

        const topFade = ctx.createLinearGradient(0, padTop - 2, 0, padTop + 22);
        topFade.addColorStop(0, 'rgba(0,0,0,1)');
        topFade.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = topFade;
        ctx.fillRect(0, padTop - 2, width, 24);

        const bottomFade = ctx.createLinearGradient(
            0,
            padTop + innerHeight - 22,
            0,
            padTop + innerHeight + 2
        );
        bottomFade.addColorStop(0, 'rgba(0,0,0,0)');
        bottomFade.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.fillStyle = bottomFade;
        ctx.fillRect(0, padTop + innerHeight - 22, width, 24);

        ctx.restore();
    }
}

/* ── tiny helpers shared by the timeline ────────────────────────────────── */

export function countPassed(offsets, localTime) {
    let count = 0;

    for (const offset of offsets) {
        if (localTime >= offset) count += 1;
        else break;
    }

    return count;
}
