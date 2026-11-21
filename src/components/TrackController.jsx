
import { useData } from '../stores/useData';

const TrackController = () => {
    const isAutoPlay = useData((state) => state.isAutoPlay);
    const currentStep = useData((state) => state.currentStep);
    const totalSteps = useData((state) => state.totalSteps);

    const startAutoPlay = useData((state) => state.startAutoPlay);
    const stopAutoPlay = useData((state) => state.stopAutoPlay);
    const seekToStep = useData((state) => state.seekToStep);
    const volume = useData((state) => state.volume ?? -6);
    const setVolume = useData((state) => state.setVolume);

    const maxStep = Math.max(totalSteps - 1, 0);
    const safeStep = Math.min(currentStep, maxStep);

    return (
        <div className="track-controller">
            <div className="Key">[트랙 컨트롤러]</div>
            <button
                type="button"
                onClick={isAutoPlay ? stopAutoPlay : startAutoPlay}
                disabled={totalSteps === 0}
            >
                {isAutoPlay ? '정지' : '자동 재생'}
            </button>

            <button
                type="button"
                onClick={() => seekToStep(0)}
                disabled={totalSteps === 0}
            >
                처음으로
            </button>
            <div>
                <div className="Key">[위치]</div>
                <label className="track-controller-range">
                    <input
                        type="range"
                        min={0}
                        max={maxStep}
                        value={safeStep}
                        onChange={(e) => seekToStep(Number(e.target.value))}
                        disabled={totalSteps <= 1}
                    />

                    <span>
                        {totalSteps > 0
                            ? `${currentStep + 1} / ${totalSteps}`
                            : '0 / 0'}
                    </span>

                </label>
                <br/>
                <div >
                    <div className="Key">[볼륨]</div>
                    <label className="track-controller-volume">
                        <input
                            type="range"
                            min={-40}
                            max={0}
                            step={1}
                            value={volume}
                            onChange={(e) => setVolume(Number(e.target.value))}
                        />

                        <span>{volume} dB</span>
                    </label>
                </div>
            </div>




        </div>
    );
};

export default TrackController;
