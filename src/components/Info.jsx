import { useData } from '../stores/useData'

const Info = () => {
    const midiList = useData((state) => state.midiList);
    const currentMidiId = useData((state) => state.currentMidiId)
    const currentMidi = midiList.find((item) => item.id === currentMidiId)
    return (
        <div className="Info">
            <div className="Key">[제목]  <span className="Value">{currentMidi.title}</span></div>
            <div className="Key">[아티스트] <span className="Value">{currentMidi.artist}</span></div>
            <div className="Key">[URL] <span className="Value">{currentMidi.url}</span></div>
        </div>
    )
}
export default Info
