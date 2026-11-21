
import { useData } from '../stores/useData'
const SoundFontSelector = () => {
    const soundFontList = useData((state) => state.soundFontList)
    const currentSoundFontId = useData((state) => state.currentSoundFontId)
    const setSoundFontId = useData((state) => state.setSoundFontId);
    const handleSelect = async (e) => {
        const nextId = e.target.value;
        setSoundFontId(nextId);
    };
    return (
        <div >
            <div className="Key">[사운드 선택]</div>
            <select onChange={handleSelect} value={currentSoundFontId}>
                {
                    soundFontList.map((soundFont) => (
                        <option key={soundFont.id} value={soundFont.id}>
                            {soundFont.fontName}
                        </option>
                    ))
                }
            </select>
        </div>
    )
}

export default SoundFontSelector
