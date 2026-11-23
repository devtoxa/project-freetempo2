
import { create } from 'zustand';

const midiList = [
    {
        id: 4,
        title: 'Abendruhe (KV ANH C 9.10)',
        artist: 'Wolfgang Amadeus Mozart',
        url: '/midi/abendruhe-kv-anh-c-9-10-wolfgang-amadeus-mozart.mid',
    },
    {
        id: 5,
        title: 'Ode to Joy',
        artist: 'Ludwig van Beethoven',
        url: '/midi/ode-to-joy-ludwig-van-beethoven.mid',
    },
    {
        id: 6,
        title: '28. Nun komm, der Heiden Heiland.',
        artist: 'Johann Sebastian Bach',
        url: '/midi/28-nun-komm-der-heiden-heiland-johann-sebastian-bach.mid',
    },
    {
        id: 7,
        title: 'Austria',
        artist: 'Joseph Haydn',
        url: '/midi/austria-joseph-haydn.mid',
    },
    {
        id: 8,
        title: 'Trois Nouvelles Etudes, No. 1 F Minor (B.130)',
        artist: 'Frederic Chopin',
        url: '/midi/trois-nouvelles-etudes-no-1-f-minor-b-130-frederic-chopin.mid',
    },
    {
        id: 9,
        title: 'Der Tod und das Mädchen (D.531 (Op. 7, No. 3))',
        artist: 'Franz Schubert',
        url: '/midi/der-tod-und-das-madchen-d-531-op-7-no-3-franz-schubert.mid',
    },
    {
        id: 10,
        title: 'Cancion de Cuna',
        artist: 'Johannes Brahms',
        url: '/midi/cancion-de-cuna-johannes-brahms.mid',
    },
    {
        id: 11,
        title: 'Kinderscenen - Von fremden Ländern und Menschen (O 15 N 1)',
        artist: 'Robert Schumann',
        url: '/midi/kinderscenen-von-fremden-landern-und-menschen-o-15-n-1-robert-schumann.mid',
    },
    {
        id: 12,
        title: 'Ich liebe dich (O 5)',
        artist: 'Edvard Grieg',
        url: '/midi/ich-liebe-dich-o-5-edvard-grieg.mid',
    },
    {
        id: 13,
        title: 'Fairest Isle',
        artist: 'Henry Purcell',
        url: '/midi/fairest-isle-henry-purcell.mid',
    },
    {
        id: 14,
        title: 'Sonata in C major',
        artist: 'Domenico Scarlatti',
        url: '/midi/sonata-in-c-major-domenico-scarlatti.mid',
    },
    {
        id: 15,
        title: 'Première Arabesque (L66 No.1)',
        artist: 'Claude Debussy',
        url: '/midi/premiere-arabesque-l66-no-1-claude-debussy.mid',
    },
    {
        id: 16,
        title: 'Gymnopédie No. 3',
        artist: 'Erik Satie',
        url: '/midi/gymnopedie-no-3-erik-satie.mid',
    },
    {
        id: 17,
        title: 'Second Ballade',
        artist: 'Franz Liszt',
        url: '/midi/second-ballade-franz-liszt.mid',
    },
    {
        id: 18,
        title: 'Napolitan Dance (Swan Lake)',
        artist: 'Pyotr Ilyich Tchaikovsky',
        url: '/midi/napolitan-dance-swan-lake-pyotr-ilyich-tchaikovsky.mid',
    },
    {
        id: 19,
        title: 'Als die alte Mutter (O 55)',
        artist: 'Antonin Dvorak',
        url: '/midi/als-die-alte-mutter-o-55-antonin-dvorak.mid',
    },
    {
        id: 20,
        title: 'Les matelots (O 2)',
        artist: 'Gabriel Faure',
        url: '/midi/les-matelots-o-2-gabriel-faure.mid',
    },
    {
        id: 21,
        title: 'Sonata in C major (fragment) (K6 deest)',
        artist: 'Wolfgang Amadeus Mozart',
        url: '/midi/sonata-in-c-major-fragment-k6-deest-wolfgang-amadeus-mozart.mid',
    },
    {
        id: 22,
        title: 'Sonata No. 1 (4th Movement: Prestissimo) (Op. 2, No. 1)',
        artist: 'Ludwig van Beethoven',
        url: '/midi/sonata-no-1-4th-movement-prestissimo-op-2-no-1-ludwig-van-beethoven.mid',
    },
    {
        id: 23,
        title: 'Matthäus Passion, Choral \'O Haupt voll Blut und Wunde\'',
        artist: 'Johann Sebastian Bach',
        url: '/midi/matthaus-passion-choral-o-haupt-voll-blut-und-wunde-johann-sebastian-bach.mid',
    },
    {
        id: 24,
        title: 'Tantum Ergo Sacramentum',
        artist: 'Joseph Haydn',
        url: '/midi/tantum-ergo-sacramentum-joseph-haydn.mid',
    },
    {
        id: 25,
        title: 'Prelude (Op. 45)',
        artist: 'Frederic Chopin',
        url: '/midi/prelude-op-45-frederic-chopin.mid',
    },
    {
        id: 26,
        title: 'An die Musik (D.547 (Op. 88, No. 4))',
        artist: 'Franz Schubert',
        url: '/midi/an-die-musik-d-547-op-88-no-4-franz-schubert.mid',
    },
    {
        id: 27,
        title: 'Preludio',
        artist: 'George Frideric Handel',
        url: '/midi/preludio-george-frideric-handel.mid',
    },
    {
        id: 28,
        title: '2. Intermezzo (Op. 118, No. 2)',
        artist: 'Johannes Brahms',
        url: '/midi/2-intermezzo-op-118-no-2-johannes-brahms.mid',
    },
    {
        id: 29,
        title: 'Ich grolle nicht (Op. 48, No. 7)',
        artist: 'Robert Schumann',
        url: '/midi/ich-grolle-nicht-op-48-no-7-robert-schumann.mid',
    },
    {
        id: 30,
        title: 'Troldtog (March of the Dwarfs) (Op. 54, No. 3)',
        artist: 'Edvard Grieg',
        url: '/midi/troldtog-march-of-the-dwarfs-op-54-no-3-edvard-grieg.mid',
    },
    {
        id: 31,
        title: 'What power art thou (King Arthur)',
        artist: 'Henry Purcell',
        url: '/midi/what-power-art-thou-king-arthur-henry-purcell.mid',
    },
    {
        id: 32,
        title: 'Sonata XI from the Essercizi per Gravicembalo (K 11)',
        artist: 'Domenico Scarlatti',
        url: '/midi/sonata-xi-from-the-essercizi-per-gravicembalo-k-11-domenico-scarlatti.mid',
    },
    {
        id: 33,
        title: 'Suite Bergamasque: Clair de Lune (L75)',
        artist: 'Claude Debussy',
        url: '/midi/suite-bergamasque-clair-de-lune-l75-claude-debussy.mid',
    },
    {
        id: 34,
        title: 'Gymnopédie No. 1',
        artist: 'Erik Satie',
        url: '/midi/gymnopedie-no-1-erik-satie.mid',
    },
    {
        id: 35,
        title: 'Old French Song (Op. 39, No. 16)',
        artist: 'Pyotr Ilyich Tchaikovsky',
        url: '/midi/old-french-song-op-39-no-16-pyotr-ilyich-tchaikovsky.mid',
    },
    {
        id: 36,
        title: 'Berceuse (Op. 56)',
        artist: 'Gabriel Faure',
        url: '/midi/berceuse-op-56-gabriel-faure.mid',
    },
    {
        id: 37,
        title: 'Symphony No. 25 - KV183 (1st Movement) (KV 183)',
        artist: 'Wolfgang Amadeus Mozart',
        url: '/midi/symphony-no-25-kv183-1st-movement-kv-183-wolfgang-amadeus-mozart.mid',
    },
    {
        id: 38,
        title: 'Sonata No. 1 (1st Movement: Allegro) (Op. 2, No. 1)',
        artist: 'Ludwig van Beethoven',
        url: '/midi/sonata-no-1-1st-movement-allegro-op-2-no-1-ludwig-van-beethoven.mid',
    },
    {
        id: 39,
        title: 'Aus meines Herzens Grunde (Chorale 1) (BWV 269)',
        artist: 'Johann Sebastian Bach',
        url: '/midi/aus-meines-herzens-grunde-chorale-1-bwv-269-johann-sebastian-bach.mid',
    },
    {
        id: 40,
        title: 'Sonate II, I - Allegro moderato (Hob. XVI:28)',
        artist: 'Joseph Haydn',
        url: '/midi/sonate-ii-i-allegro-moderato-hob-xvi-28-joseph-haydn.mid',
    },
    {
        id: 41,
        title: 'Ballade number 4 (O 52)',
        artist: 'Frederic Chopin',
        url: '/midi/ballade-number-4-o-52-frederic-chopin.mid',
    },
    {
        id: 42,
        title: 'Gretchen am Spinnrade (D.118 (Op. 2))',
        artist: 'Franz Schubert',
        url: '/midi/gretchen-am-spinnrade-d-118-op-2-franz-schubert.mid',
    },
    {
        id: 43,
        title: 'Ouvertüre',
        artist: 'George Frideric Handel',
        url: '/midi/ouverture-george-frideric-handel.mid',
    },
    {
        id: 44,
        title: 'Brahms Horn Trio (O 40)',
        artist: 'Johannes Brahms',
        url: '/midi/brahms-horn-trio-o-40-johannes-brahms.mid',
    },
    {
        id: 45,
        title: 'Kinderscenen - Traümerei (O 15 N 7)',
        artist: 'Robert Schumann',
        url: '/midi/kinderscenen-traumerei-o-15-n-7-robert-schumann.mid',
    },
    {
        id: 46,
        title: 'Ases Tod (O 46, No. 2)',
        artist: 'Edvard Grieg',
        url: '/midi/ases-tod-o-46-no-2-edvard-grieg.mid',
    },
    {
        id: 47,
        title: 'Gymnopédie No. 2',
        artist: 'Erik Satie',
        url: '/midi/gymnopedie-no-2-erik-satie.mid',
    },
    {
        id: 48,
        title: 'Final de la sixième sonate (Opus 65 n°6)',
        artist: 'Felix Mendelssohn',
        url: '/midi/final-de-la-sixieme-sonate-opus-65-n-6-felix-mendelssohn.mid',
    },
    {
        id: 49,
        title: 'The Seasons: February (O 37,2)',
        artist: 'Pyotr Ilyich Tchaikovsky',
        url: '/midi/the-seasons-february-o-37-2-pyotr-ilyich-tchaikovsky.mid',
    },
    {
        id: 50,
        title: 'Après un Rêve (Op. 7)',
        artist: 'Gabriel Faure',
        url: '/midi/apres-un-reve-op-7-gabriel-faure.mid',
    },
    {
        id: 51,
        title: 'Symphony No. 25 - KV183 (2nd Movement) (KV 183)',
        artist: 'Wolfgang Amadeus Mozart',
        url: '/midi/symphony-no-25-kv183-2nd-movement-kv-183-wolfgang-amadeus-mozart.mid',
    },
    {
        id: 52,
        title: 'Romanze - Opus 40 (Op. 40)',
        artist: 'Ludwig van Beethoven',
        url: '/midi/romanze-opus-40-op-40-ludwig-van-beethoven.mid',
    },
    {
        id: 53,
        title: 'Polonaise in F major (BWV Anh. 117a)',
        artist: 'Johann Sebastian Bach',
        url: '/midi/polonaise-in-f-major-bwv-anh-117a-johann-sebastian-bach.mid',
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
    currentMidiId: 4,

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
