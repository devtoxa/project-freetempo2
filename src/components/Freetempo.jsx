import qrCode from '../qr.png';
import TopMenu from './TopMenu';
import Track from './Track';

export default function Freetempo() {
    return (
        <div className="freetempo-root">
            <TopMenu />
            <Track />
            <img src={qrCode} alt="QR code" className="qr-code" />
        </div>
    );
}