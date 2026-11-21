import { useState } from 'react';
import Info from './Info';
import MidiSelector from './MidiSelector';
import SoundFontSelector from './SoundFontSelector';
import TrackController from './TrackController';

export default function TopMenu({ defaultOpen = false }) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <header className="top-menu-anchor" aria-label="상단 컨트롤 메뉴">
            <button
                type="button"
                className="top-menu-toggle"
                aria-expanded={isOpen}
                onClick={() => setIsOpen((prev) => !prev)}
            >
                {isOpen ? '메뉴 닫기 ✕' : '메뉴 ☰'}
            </button>

            {isOpen && (
                <div className="top-menu-panel">
                    <Info />
                    <div className="top-menu-selectors">
                        <MidiSelector />
                        <SoundFontSelector />
                    </div>
                    <TrackController />
                </div>
            )}
        </header>
    );
}