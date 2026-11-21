
import { create } from 'zustand';

const midiList = [
    {
        id: 1,
        title: 'reminiscence',
        artist: 'nam-gu-min',
        url: '/midi/reminiscence-nam-gu-min.mid',
    },
    {
        id: 2,
        title: 'second run',
        artist: 'nam-gu-min',
        url: '/midi/sekeondeu-leon-namgumin.mid',
    },
    {
        id: 3,
        title: 'shining light',
        artist: 'djmax respect v',
        url: '/midi/syaining-laiteu.mid',
    },
];

const soundFontList = [
    {
        id: 1,
        fontName: 'Salamander Piano',
        type: 'sampler',
        baseUrl: 'https://tonejs.github.io/audio/salamander/',
        urls: {
            A0: 'A0.mp3',
            C1: 'C1.mp3',
            'D#1': 'Ds1.mp3',
            'F#1': 'Fs1.mp3',
            A1: 'A1.mp3',
            C2: 'C2.mp3',
            'D#2': 'Ds2.mp3',
            'F#2': 'Fs2.mp3',
            A2: 'A2.mp3',
            C3: 'C3.mp3',
            'D#3': 'Ds3.mp3',
            'F#3': 'Fs3.mp3',
            A3: 'A3.mp3',
            C4: 'C4.mp3',
            'D#4': 'Ds4.mp3',
            'F#4': 'Fs4.mp3',
            A4: 'A4.mp3',
            C5: 'C5.mp3',
            'D#5': 'Ds5.mp3',
            'F#5': 'Fs5.mp3',
            A5: 'A5.mp3',
            C6: 'C6.mp3',
            'D#6': 'Ds6.mp3',
            'F#6': 'Fs6.mp3',
            A6: 'A6.mp3',
            C7: 'C7.mp3',
            'D#7': 'Ds7.mp3',
            'F#7': 'Fs7.mp3',
            A7: 'A7.mp3',
            C8: 'C8.mp3',
        },
    },
    { id: 2, fontName: 'Synth', type: 'synth' },
    { id: 3, fontName: 'Electric Piano', type: 'fm' },
    { id: 4, fontName: 'Soft Synth', type: 'am' },
];

export const useData = create((set) => ({
    midiList,
    soundFontList,

    currentSoundFontId: 1,
    currentMidiId: 1,

    isAutoPlay: false,
    autoPlaySessionId: 0,

    currentStep: 0,
    totalSteps: 0,
    seekVersion: 0,

    volume: -6,

    setSoundFontId: (id) => {
        set({
            currentSoundFontId: Number(id),
        });
    },

    setMidiId: (id) => {
        set({
            currentMidiId: Number(id),
            isAutoPlay: false,
            currentStep: 0,
            totalSteps: 0,
            autoPlaySessionId: 0,
            seekVersion: 0,
        });
    },

    addLocalMidi: ({ title, artist = 'Local File', url }) => {
        const newId = Date.now();

        set((state) => ({
            midiList: [
                ...state.midiList,
                { id: newId, title, artist, url },
            ],
            currentMidiId: newId,
            isAutoPlay: false,
            currentStep: 0,
            totalSteps: 0,
        }));
    },

    startAutoPlay: () => {
        set((state) => ({
            isAutoPlay: true,
            autoPlaySessionId: state.autoPlaySessionId + 1,
        }));
    },

    stopAutoPlay: () => {
        set({ isAutoPlay: false });
    },

    setCurrentStep: (step) => {
        set({
            currentStep: Math.max(0, Number(step) || 0),
        });
    },

    setTotalSteps: (total) => {
        set({
            totalSteps: Math.max(0, Number(total) || 0),
        });
    },

    setVolume: (value) => {
        const numeric = Number(value);

        set({
            volume: Number.isFinite(numeric)
                ? Math.max(-40, Math.min(0, numeric))
                : -6,
        });
    },

    seekToStep: (step) => {
        set((state) => ({
            currentStep: Math.max(0, Number(step) || 0),
            seekVersion: state.seekVersion + 1,
        }));
    },
}));
