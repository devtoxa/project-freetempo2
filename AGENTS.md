# AGENTS.md

이 문서는 **FreeTempo 저장소에서 작업하는 AI 에이전트와 새 개발자**를 위한 안내서입니다.
사용자용 설명은 [`README.md`](./README.md)를 먼저 읽고, 이 문서는 "어디를 어떻게 고쳐야 하는가"에 집중합니다.
README와 코드가 어긋나면 **항상 코드가 우선**입니다.

---

## 1. 한 문장 요약

FreeTempo는 **BPM 자동 진행 대신 사용자의 키 입력으로 한 음(노트 그룹)씩 전진하는** 브라우저용 피아노롤 · 초견 연습 앱입니다.
React 19가 UI, Zustand 5가 전역 상태, `Track.jsx`가 Canvas 렌더링과 Tone.js 재생을 동시에 담당합니다.

| 항목 | 값 |
| --- | --- |
| 패키지 이름 | `react-freetempo` (`package.json`) |
| 실행 환경 | Node 20.19+ / 22.12+, 최신 Chromium·Firefox·Safari |
| 배포 | GitHub Pages, `base: '/project-freetempo2/'` |
| 데모 | https://devtoxa.github.io/project-freetempo2/ |
| 테스트 러너 | **없음** (lint + 수동 QA) |

---

## 2. 자주 쓰는 명령

```bash
npm install          # 최초 1회
npm run dev          # predev: Basic Pitch 모델 복사 → Vite (기본 5173)
npm run build        # prebuild: 모델 복사 → dist/
npm run preview      # 빌드 결과 미리보기
npm run lint         # ESLint flat config
npm run deploy       # predeploy(build) → gh-pages -d dist
npm run copy-model   # public/model 수동 재생성
```

- 개발 서버 주소는 `http://localhost:5173/project-freetempo2/` 입니다. `base` 때문에 루트(`/`)가 아닙니다.
- `public/model/`은 `predev`·`prebuild`가 `node_modules/@spotify/basic-pitch/model`에서 복사하며 **git에 커밋하지 않습니다**.
- `npm run lint`는 현재 **알려진 오류 1건**이 있습니다: `src/components/Track.jsx`의 `react-hooks/set-state-in-effect`(MIDI 로딩 effect 안의 동기 `setState`). 새 오류를 추가하지 말고, 이 1건을 없애려면 재생 동작을 수동 검증하세요.

---

## 3. 파일 지도

```text
src/
├─ main.jsx / App.jsx          # React 루트, Freetempo 마운트
├─ App.css                     # 사실상 모든 스타일 (index.css는 비어 있음)
├─ components/
│  ├─ Freetempo.jsx            # 레이아웃: TopMenu + Track + QR
│  ├─ TopMenu.jsx              # 접이식 상단 패널
│  ├─ Info.jsx                 # 현재 곡 제목/아티스트/URL
│  ├─ MidiSelector.jsx         # 내장 곡 select + 로컬 .mid 업로드
│  ├─ AudioToMidiUploader.jsx  # 오디오 업로드 UI / 진행률 / 다운로드
│  ├─ SoundFontSelector.jsx    # 악기 select (class 없음, `.top-menu-panel select`로 접근)
│  ├─ TrackController.jsx      # 자동재생·처음으로·위치·볼륨
│  └─ Track.jsx                # ★ 렌더 루프 + 재생 엔진 + 입력 처리 (핵심)
├─ stores/useData.jsx          # ★ Zustand 스토어, midiList/soundFontList 데이터
├─ audio/
│  ├─ synthMap.js              # synth/fm/am → Tone Voice
│  └─ transcribeAudio.js       # 디코딩·22.05kHz 리샘플·Worker 연결
├─ workers/transcribe.worker.js# Basic Pitch 추론 + .mid 바이트 생성
└─ midi/*.mid                  # 클래식 53개 파일 (선택기에 등록된 곡은 50개)
```

- **`Track.jsx`가 이 앱의 심장입니다.** UI만 고칠 때도 이 파일의 rAF 루프, `seekVersion`, 자동재생 상태와 충돌하지 않는지 확인하세요.
- 컴포넌트는 함수형 + `export default`(선언형 `export default function` 또는 `const X = () => {}`), 스타일은 전역 `App.css` 클래스 방식입니다. CSS Module·Tailwind·TypeScript는 쓰지 않습니다.
- 코드 스타일: `src/`는 4칸 들여쓰기, 작은따옴표, 세미콜론, JSX 파일 확장자 `.jsx`. ESLint가 flat config(`eslint.config.js`)입니다.

---

## 4. 상태 저장소 계약 (`useData.jsx`)

| 키 | 의미 | 주의 |
| --- | --- | --- |
| `midiList` | `{ id, title, artist, url }[]` | `url`은 `/midi/<파일명>.mid` 형식 |
| `soundFontList` | `{ id, fontName, type, baseUrl?, urls? }[]` | `type`: `sampler` \| `synth` \| `fm` \| `am` |
| `currentMidiId` / `currentSoundFontId` | 선택된 id | 항상 `Number()`로 비교 |
| `currentStep` / `totalSteps` | 현재/전체 노트 그룹 수 | `currentStep`은 "다음에 재생할 그룹" 인덱스 |
| `isAutoPlay` / `autoPlaySessionId` | 자동재생 여부 / 재시작 토큰 | `startAutoPlay()`가 세션 id를 +1 |
| `seekVersion` | 시크 발생 토큰 | **`seekToStep()`에서만** 증가 |
| `volume` | −40 ~ 0 dB | `setVolume()`이 클램프 |
| `pixelsPerBeat` | 스토어에 없음 | `Track`이 `?? 80`으로 기본값 처리 |

- 곡 목록은 정적 배열입니다. 새 곡은 배열에 직접 추가합니다.
- `setMidiId()`는 자동재생·스텝을 초기화하지만, 곡 로딩 후 커서 초기화는 `Track`의 로딩 effect가 담당합니다.

---

## 5. 절대 깨면 안 되는 동작 규칙

### 5.1 노트 그룹화 (20ms)

```js
// Track.jsx
const THRESHOLD = 0.02; // 초
```

MIDI의 모든 트랙 노트를 시간순으로 합친 뒤, 그룹 첫 노트와 **0.02초 이내**면 같은 그룹으로 묶습니다.
화음이 한 번의 입력으로 함께 울리는 근거이므로 이 값을 바꾸면 체감이 크게 달라집니다.

### 5.2 강조 노트 앵커 = 화면 왼쪽 18%

- `FOCUS_ANCHOR_RATIO = 0.18`, `FOCUS_SMOOTHING_MS = 120`.
- 수동 진행 시 `displayCursorTime`을 지수 보간(`1 − e^(−dt/120ms)`)으로 이동시켜 노트가 부드럽게 흐릅니다.
- 시크·자동재생 시작처럼 즉시 이동해야 할 때만 스냅합니다. 일반 키 입력에 스냅을 넣지 마세요.

### 5.3 시크는 `seekVersion`으로만

슬라이더/처음으로는 `seekToStep()` → `seekVersion++` → `Track`의 `useLayoutEffect`가 커서를 스냅합니다.
`currentStep` 변경만으로 커서를 스냅하면 rAF 루프와 경합해 떨림이 생깁니다.
(예외: MIDI 로딩 시 초기화는 로딩 effect에서 직접 처리)

### 5.4 자동재생 스케줄링

```text
songTime = startSongTime + (Tone.now() − startAudioSec)
while (songTime >= group.time) → playGroup(group, when = now − lag)
```

- 프레임이 밀려도 박자가 누적해서 어긋나지 않도록 **지연 보정**을 유지하세요.
- 탭이 백그라운드로 가면 rAF가 멈추므로 `visibilitychange` 핸들러가 경과 시간을 반영해 복귀 위치를 계산합니다.
- 자동재생 중 키 입력은 즉시 `stopAutoPlay()` + 수동 모드로 전환됩니다.

### 5.5 오디오는 사용자 제스처 이후에만

- 첫 재생에서 `Tone.getContext().state !== 'running'`이면 `Tone.start()`를 호출합니다.
- Salamander(`type: 'sampler'`)는 원격 MP3를 쓰므로 첫 재생 전 `Tone.loaded()`를 기다립니다.
- 컴포넌트 마운트 시점에 `Tone.start()`를 호출하면 브라우저 정책에 막힙니다. **하지 마세요.**

### 5.6 입력 처리

- 키: `window`의 `keydown`, `e.repeat` 무시, `INPUT/SELECT/TEXTAREA` 포커스 시 무시.
- 포인터: `pointerdown`, `e.isPrimary`, 마우스는 좌클릭만. `click`을 추가로 달면 이중 진행됩니다.
- 휠: `passive: false` + `preventDefault`, 자동재생 중지 및 `releaseAll()` 후 **소리 없이** 이동.

### 5.7 음성 → MIDI 제약

| 항목 | 값 | 위치 |
| --- | --- | --- |
| 샘플레이트 | 22,050 Hz mono | `transcribeAudio.js` |
| 최대 길이 | 60초 | `MAX_AUDIO_SECONDS` |
| 최대 파일 | 40 MB | `AudioToMidiUploader.jsx` |
| 최소 음 길이 | 130 ms | `transcribeAudio.js` → Worker 인자 |
| 진폭 임계값 | 0.06 | `transcribe.worker.js` |
| 노트 병합 간격 | 60 ms | `transcribe.worker.js` |
| 생성 MIDI BPM | 120 | `transcribe.worker.js` |

- 추론은 반드시 **Web Worker**에서 실행합니다. 메인 스레드로 옮기면 캔버스 애니메이션이 멈춥니다.
- 모델 경로는 `${import.meta.env.BASE_URL}model/model.json`이며 `public/model`이 없으면 실패합니다.
- 첫 변환은 모델 다운로드 때문에 느립니다. UI 문구/진행률 단계(`0.02 → 0.05~0.9 → 0.92 → 0.96 → 1`)를 함부로 바꾸지 마세요.

---

## 6. 흔한 작업 레시피

### 곡 추가

1. `src/midi/`에 `.mid` 파일을 넣습니다.
2. `src/stores/useData.jsx`의 `midiList`에 항목을 추가합니다.

```js
{ id: 54, title: '곡 제목', artist: '작곡가', url: '/midi/<실제-파일명>.mid' }
```

3. `url`의 파일명은 **실제 파일명과 정확히 일치**해야 합니다. `Track.jsx`의 `resolveMidiURL()`이 `import.meta.glob('../midi/*.mid')` 맵에서 파일명으로 찾습니다.
4. `id`는 숫자·중복 금지. `title`/`artist`는 파일에서 자동 추출되지 않습니다.

### 악기 추가

1. `soundFontList`에 `{ id, fontName, type }` 추가.
2. 신스 계열이면 `src/audio/synthMap.js`에 `type → Tone Voice` 매핑 추가.
3. 샘플러면 `type: 'sampler'`, `baseUrl`, `urls`를 채우고 `Tone.loaded()` 경로를 확인.

### UI 문구/레이아웃

- 한국어 UI 문구는 UTF-8입니다. Windows PowerShell 5의 `Get-Content`가 깨져 보여도 파일 자체는 정상일 수 있으니 에디터/`read` 도구로 확인하세요.
- 상단 패널은 `.top-menu-panel` 하나의 flex 컨테이너입니다. 항목을 추가하면 좁은 화면 줄바꿈을 확인하세요.
- QR은 `src/qr.png`. 재생성은 `py-qr-code/main.py`(segno) 사용.

### 배포

- `vite.config.js`의 `base`, README의 데모 URL, `py-qr-code/main.py`의 URL은 같은 저장소 이름을 가리킵니다. 저장소 이름을 바꾸면 셋 다 수정하세요.
- `npm run deploy`는 `dist/`를 `gh-pages` 브랜치로 push합니다. 실행 전에 사용자에게 확인을 받으세요.

---

## 7. 검증 체크리스트

변경 후 최소한 다음을 확인합니다.

```bash
npm run lint     # 새 오류가 없는지 (기존 1건 제외)
npm run build    # 번들/모델 복사 성공
npm run preview  # 또는 npm run dev
```

수동 QA:

1. 첫 키 입력에 소리가 나고, 연타하면 그룹이 한 걸음씩 전진하는가.
2. 화음 그룹이 한 번에 울리고 강조되는가.
3. 곡 전환 후 로딩·커서·`totalSteps`가 초기화되는가.
4. 자동재생 시작/정지, 키 입력에 의한 즉시 해제가 정상인가.
5. 슬라이더 시크, 처음으로, 휠 스크럽(무음)이 서로 충돌하지 않는가.
6. 볼륨 −40~0 dB가 즉시 반영되는가.
7. 로컬 `.mid` 업로드와 오디오 → MIDI(짧은 mp3)가 동작하는가.
8. 모바일 폭에서 메뉴/QR/캔버스가 깨지지 않는가.

---

## 8. 알려진 함정

- **`base` 경로**: 개발/배포 모두 `/project-freetempo2/` 하위에서 동작합니다. 절대 `/`로 바꾸지 마세요.
- **`dist/`·`public/model/`**: 생성물입니다. 직접 수정하지 말고 스크립트로 재생성하세요.
- **`introduce/`**: `.gitignore`에 포함된 로컬 미디어/데모 작업 폴더입니다. 앱 빌드에 포함되지 않습니다.
- **README와 코드의 차이**: README는 "트랙별 악기 분리 미지원", "단일 악기 재생"을 명시합니다. MIDI 트랙별 악기 기능을 암묵적으로 추가하지 마세요.
- **곡 수**: `src/midi`에는 53개 파일이 있지만 `midiList`에 등록된 곡은 50개입니다. 문서에서 수를 셀 때 구분하세요.
- **테스트 없음**: 동작 변경은 수동 QA로 증명해야 합니다. rAF/오디오 관련 변경은 특히 자동재생·시크·백그라운드 복귀를 함께 확인하세요.
- **StrictMode**: 개발 모드에서 effect가 두 번 실행됩니다. 정리(cleanup) 누락 시 오디오가 중복 생성될 수 있습니다.

---

## 9. 소개 영상 (로컬)

`introduce/freetempo-intro.mp4`는 프로젝트 소개 + 실제 앱 시연 영상입니다(약 2분, 1920×1080, 30fps). `introduce/`는 git에 커밋되지 않습니다.

- 사운드는 **앱이 실제로 연주한 피아노 소리**를 Web Audio 그래프에서 직접 녹음합니다. 별도 배경음악은 넣지 않습니다.
- 재생성 순서:

```bash
npm run dev                    # 5173 포트, app 캡처에 필요
node introduce/capture-slides.mjs
node introduce/capture-app.mjs  # 영상 프레임 + app-audio.wav 생성
node introduce/build.mjs        # 세그먼트 인코딩 + 진행바/오디오 합성
```

- 캡처는 `introduce/cdp.mjs`의 의존성 없는 CDP 드라이버로 Edge headless를 제어합니다.
- `capture-app.mjs`는 `audio-capture.mjs`의 훅으로 Tone.js의 출력 노드를 탭해 WAV로 저장합니다. 앱 소스는 수정하지 않으며, 데모용 커서·캡션도 페이지에 주입만 합니다.
- 영상 제작 때문에 `vite.config.js`, `App.css` 등 앱 파일을 바꾸지 마세요.

---

## 10. 자산과 라이선스

- 내장 곡은 퍼블릭 도메인 클래식 MIDI, Salamander 피아노는 원격 샘플(Alexander Holm), Basic Pitch는 Spotify 오픈소스입니다.
- 저장소에 `LICENSE` 파일이 없습니다. 재배포·재사용을 전제로 한 변경이라면 라이선스 추가를 제안하세요.
