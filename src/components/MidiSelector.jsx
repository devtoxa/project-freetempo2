
import { useState } from 'react';
import { useData } from '../stores/useData';

export default function MidiSelector() {
    const midiList = useData((state) => state.midiList);
    const currentMidiId = useData((state) => state.currentMidiId);
    const setMidiId = useData((state) => state.setMidiId);
    const [fileError, setFileError] = useState('');

    const handleSelect = (e) => {
        const id = Number(e.target.value);
        setMidiId(id);
    };

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];

        // 같은 파일을 다시 선택해도 change가 발생하도록 즉시 초기화
        e.target.value = '';

        if (!file) return;

        if (!/\.(mid|midi)$/i.test(file.name)) {
            setFileError('MIDI 파일(.mid, .midi)만 불러올 수 있습니다.');
            return;
        }

        setFileError('');

        const blobUrl = URL.createObjectURL(file);
        const title = file.name.replace(/\.(mid|midi)$/i, '');

        useData.getState().addLocalMidi({
            title,
            artist: 'Local File',
            url: blobUrl,
        });
    };

    return (
        <div className="MidiSelector">
            <div className="Key">[.mid 파일 로드]</div>
            <div className="Value">
                <input
                    type="file"
                    accept=".mid,.midi,audio/midi,audio/x-midi"
                    onChange={handleFileChange}
                />
                {fileError && (
                    <div className="midi-file-error">{fileError}</div>
                )}
            </div>

            <br />
            <div className="Key">[.mid 선택]</div>
            <select
                value={currentMidiId}
                onChange={handleSelect}
            >
                {midiList.map((midi) => (
                    <option key={midi.id} value={midi.id}>
                        {midi.title} - {midi.artist}
                    </option>
                ))}
            </select>
        </div>
    );
}
