/* =====================================================
   KB 네컷 — app.js
   KB Kookmin Bank Photo Booth for KB Bootcamp 7th cohort
   ===================================================== */

'use strict';

// ========== STATE ==========
const state = {
  frameType: null, // 'A' or 'B'
  photos: [], // array of HTMLCanvasElement
  stream: null,
  isCapturing: false,
  resultCanvas: null,
  stickers: {}, // 로드된 스티커 이미지 캐시
  frameColor: 'yellow', // 'yellow' | 'blue'
};

// ========== FRAME THEMES ==========
const FRAME_THEMES = {
  // KB 정석 — 진한 KB 시그니처 옐로우
  yellow: {
    bar: '#FFBC00',
    bg: '#FFBC00',
    accent: '#FFBC00',
    text: '#1A1A2E',
    textSub: 'rgba(26,26,46,0.72)',
    textFaint: 'rgba(26,26,46,0.50)',
    watermark: 'rgba(26,26,46,0.40)',
    bottomMsg: "IT's your life 7기 화이팅!!",
    bottomSub: '부트캠프와 함께하는 특별한 순간',
  },
  // 파스텔 감성 — 부드러운 크림옐로우
  blue: {
    bar: '#FEF9C3',
    bg: '#FEF9C3',
    accent: '#FEF9C3',
    text: '#2B2B2B',
    textSub: 'rgba(43,43,43,0.65)',
    textFaint: 'rgba(43,43,43,0.45)',
    watermark: 'rgba(43,43,43,0.35)',
    bottomMsg: "IT's your life 7기",
    bottomSub: "console.log('인생 확인중')",
  },
};

// ========== STICKER PRELOAD ==========
const STICKER_FILES = {
  롤로라무: '롤로라무.png',
  롤로라무2: '롤로라무2.png',
  루나키키: '루나키키.png',
  루나키키2: '루나키키 2.png',
  멜랑콜리: '멜랑콜리.png',
  멜랑콜리2: '멜랑콜리2.png',
  심쿵비비: '심쿵비비.png',
  심쿵비비2: '심쿵비비 2.png',
  심쿵비비3: '심쿵비비 3.png',
  심쿵비비4: '심쿵비비 4.png',
  포스아거: '포스아거.png',
  포스아거1: '포스아거 1.png',
};

function preloadStickers() {
  const promises = Object.entries(STICKER_FILES).map(
    ([key, file]) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          state.stickers[key] = img;
          resolve();
        };
        img.onerror = () => resolve();
        img.src = 'stickers/' + encodeURIComponent(file);
      }),
  );
  return Promise.all(promises);
}

// Guide messages per shot
const GUIDE_MESSAGES = [
  '얼굴과 상반신이 잘 보이도록\n위치를 맞춰주세요',
  '밝은 곳에서 촬영하면\n더 예쁘게 나와요',
  '다양한 포즈로\n개성을 표현해보세요',
  '마지막 컷! 최고의 표정으로\n마무리하세요',
];

// ========== NAVIGATION ==========
function showScreen(id) {
  document
    .querySelectorAll('.screen')
    .forEach((s) => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
}

function goToMain() {
  stopCamera();
  showScreen('screen-main');
}

function goToFrameSelect() {
  showScreen('screen-frame');
}

function goBackFromCamera() {
  stopCamera();
  resetCameraUI();
  showScreen('screen-frame');
}

function selectFrame(type) {
  state.frameType = type;
  state.photos = [];
  resetCameraUI();
  showScreen('screen-camera');
  initCamera();
}

// 카메라 UI 상태를 초기값으로 되돌림 (버튼, 라벨, 카운터)
function resetCameraUI() {
  state.isCapturing = false;
  const shutterBtn = document.getElementById('shutter-btn');
  if (shutterBtn) shutterBtn.classList.remove('disabled');
  const shutterLabel = document.getElementById('shutter-label');
  if (shutterLabel) shutterLabel.textContent = '촬영 시작';
  const numEl = document.getElementById('counter-num');
  if (numEl) numEl.textContent = '0 / 4';
  const cd = document.getElementById('countdown-display');
  if (cd) {
    cd.classList.add('hidden');
    cd.style.display = 'none';
    cd.dataset.confirmation = '';
  }
}

function showHowto() {
  document.getElementById('modal-howto').classList.remove('hidden');
}

function closeHowto() {
  document.getElementById('modal-howto').classList.add('hidden');
}

function closeHowtoOutside(event) {
  if (event.target === document.getElementById('modal-howto')) {
    closeHowto();
  }
}

// ========== FLOATING STARS ==========
function initFloatingStars() {
  const container = document.getElementById('floating-stars');
  if (!container) return;

  const symbols = ['★', '✦', '⭐', '✨', '★', '✦'];
  const count = 15;

  for (let i = 0; i < count; i++) {
    const span = document.createElement('span');
    span.classList.add('floating-star');
    span.textContent = symbols[i % symbols.length];

    const x = Math.random() * 95;
    const y = Math.random() * 92;
    const dur = (4 + Math.random() * 5).toFixed(2);
    const delay = (Math.random() * 4).toFixed(2);
    const size = (12 + Math.random() * 18).toFixed(1);

    span.style.setProperty('--x', `${x}%`);
    span.style.setProperty('--y', `${y}%`);
    span.style.setProperty('--dur', `${dur}s`);
    span.style.setProperty('--delay', `-${delay}s`);
    span.style.setProperty('--size', `${size}px`);

    container.appendChild(span);
  }
}

// ========== CAMERA ==========
async function initCamera() {
  // 카메라 뷰 비율을 사진 출력 비율에 맞춤 (찍히는 영역 = 보이는 영역)
  const wrapper = document.getElementById('camera-video-wrapper');
  if (wrapper) wrapper.dataset.frame = state.frameType;

  updateCounter();
  showGuide();

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user',
      },
      audio: false,
    });

    const video = document.getElementById('camera-video');
    video.srcObject = state.stream;
    await video.play();
  } catch (e) {
    console.error('Camera error:', e);
    alert(
      '카메라 접근 권한이 필요합니다.\n브라우저에서 카메라 권한을 허용해주세요.',
    );
    goToFrameSelect();
  }
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
  }
  const video = document.getElementById('camera-video');
  if (video) {
    video.srcObject = null;
  }
}

function showGuide() {
  const overlay = document.getElementById('guide-overlay');
  if (overlay) overlay.classList.remove('hidden');

  // Update guide message based on current shot number
  const guideText = document.getElementById('guide-text');
  if (guideText) {
    const idx = Math.min(state.photos.length, GUIDE_MESSAGES.length - 1);
    guideText.innerHTML = GUIDE_MESSAGES[idx].replace('\n', '<br/>');
  }
}

function hideGuide() {
  const overlay = document.getElementById('guide-overlay');
  if (overlay) overlay.classList.add('hidden');
}

// ========== SHOOTING FLOW ==========
async function onShutter() {
  if (state.isCapturing) return;
  state.isCapturing = true;

  const shutterBtn = document.getElementById('shutter-btn');
  const shutterLabel = document.getElementById('shutter-label');
  shutterBtn.classList.add('disabled');
  if (shutterLabel) shutterLabel.textContent = '촬영 중...';

  hideGuide();

  // Auto-shoot all 4 photos in sequence
  for (let i = 0; i < 4; i++) {
    // Update counter to show which shot is about to be taken
    const numEl = document.getElementById('counter-num');
    if (numEl) numEl.textContent = `${i + 1} / 4`;

    await doCountdown(5);
    await doFlash();
    captureFrame();

    // Brief between-shot confirmation (except after last shot)
    if (i < 3) {
      await showShotConfirmation(i + 1);
      await sleep(400);
    }
  }

  state.isCapturing = false;
  setTimeout(() => generateAndShowResult(), 400);
}

async function showShotConfirmation(shotNum) {
  const cd = document.getElementById('countdown-display');
  if (!cd) return;
  cd.style.display = 'flex';
  cd.classList.remove('hidden');
  cd.dataset.confirmation = 'true';
  cd.textContent = `${shotNum} ✓`;
  await sleep(600);
  cd.classList.add('hidden');
  cd.style.display = 'none';
  cd.dataset.confirmation = '';
}

async function doCountdown(from) {
  const el = document.getElementById('countdown-display');
  if (!el) return;

  el.classList.remove('hidden');
  el.style.display = 'flex';

  for (let i = from; i >= 1; i--) {
    el.textContent = i;
    el.classList.add('pop');
    await sleep(300);
    el.classList.remove('pop');
    await sleep(700);
  }

  el.classList.add('hidden');
  el.style.display = 'none';
}

async function doFlash() {
  const flash = document.getElementById('camera-flash');
  if (!flash) return;

  flash.style.transition = 'none';
  flash.style.opacity = '1';
  await sleep(120);
  flash.style.transition = 'opacity 0.35s ease';
  flash.style.opacity = '0';
  await sleep(350);
  flash.style.transition = '';
}

function captureFrame() {
  const video = document.getElementById('camera-video');
  if (!video || !video.videoWidth) return;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;

  const ctx = canvas.getContext('2d');
  // Mirror the capture (selfie style)
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0);

  state.photos.push(canvas);
}

function updateCounter() {
  const nameEl = document.getElementById('counter-name');
  const numEl = document.getElementById('counter-num');
  if (nameEl) {
    nameEl.textContent =
      state.frameType === 'A' ? '세로네컷 A형' : '정방네컷 B형';
  }
  if (numEl) {
    numEl.textContent = `${state.photos.length} / 4`;
  }
}

// ========== RESULT GENERATION ==========
function generateAndShowResult() {
  stopCamera();
  buildResultCanvas();
  showScreen('screen-result');
}

function buildResultCanvas() {
  const theme = FRAME_THEMES[state.frameColor] || FRAME_THEMES.yellow;
  const canvas =
    state.frameType === 'A'
      ? renderFrameA(state.photos, theme)
      : renderFrameB(state.photos, theme);

  state.resultCanvas = canvas;
  canvas.dataset.frame = state.frameType; // CSS에서 타입별 크기 조절용

  const preview = document.getElementById('result-preview');
  if (preview) {
    preview.innerHTML = '';
    preview.appendChild(canvas);
  }
}

function changeFrameColor(color) {
  state.frameColor = color;
  document.querySelectorAll('.color-dot').forEach((el) => {
    el.classList.toggle('active', el.dataset.color === color);
  });
  buildResultCanvas();
}

// ---------- Frame A: 인생네컷 세로 스트립 (4컷 세로 배열) ----------
function renderFrameA(photos, theme = FRAME_THEMES.yellow) {
  const W = 480; // 좁고 긴 스트립
  const PAD = 16; // 좌우 프레임 두께
  const TOP = 58; // 상단 타이틀 영역
  const BOT = 120; // 하단 메시지 영역
  const GAP = 8; // 사진 간 간격
  const PHOTO_W = W - PAD * 2; // 448px
  const PHOTO_H = Math.round((PHOTO_W * 3) / 4); // 336px — 4:3 비율
  const H = TOP + PHOTO_H * 4 + GAP * 3 + BOT; // ≈1562px (약 1:3.25 비율)

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // 전체 배경
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);

  // 좌우 프레임 강조선 (얇게)
  ctx.fillStyle = theme.accent;
  ctx.fillRect(0, 0, PAD, H);
  ctx.fillRect(W - PAD, 0, PAD, H);

  // 상단 바
  ctx.fillStyle = theme.bar;
  ctx.fillRect(0, 0, W, TOP);

  drawKBBadgeOnCanvas(ctx, 14, 14, 26);

  ctx.fillStyle = theme.text;
  ctx.font = 'bold 18px "Noto Sans KR", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('KB 네컷', W / 2, TOP / 2 + 7);

  ctx.font = '10px "Noto Sans KR", Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = theme.textSub;
  ctx.fillText('부트캠프 7기', W - 14, TOP / 2 + 5);

  for (let i = 0; i < 4; i++) {
    const x = PAD;
    const y = TOP + i * (PHOTO_H + GAP);

    if (photos[i]) {
      ctx.save();
      roundedRect(ctx, x, y, PHOTO_W, PHOTO_H, 5);
      ctx.clip();

      // 4:3으로 센터 크롭
      const srcAR = photos[i].width / photos[i].height;
      const dstAR = PHOTO_W / PHOTO_H;
      let sx = 0,
        sy = 0,
        sw = photos[i].width,
        sh = photos[i].height;
      if (srcAR > dstAR) {
        sw = sh * dstAR;
        sx = (photos[i].width - sw) / 2;
      } else {
        sh = sw / dstAR;
        sy = (photos[i].height - sh) / 2;
      }
      ctx.drawImage(photos[i], sx, sy, sw, sh, x, y, PHOTO_W, PHOTO_H);
      ctx.restore();

      drawPhotoDecorations(ctx, x, y, PHOTO_W, PHOTO_H, i);
    } else {
      ctx.fillStyle = '#F5F5F5';
      roundedRect(ctx, x, y, PHOTO_W, PHOTO_H, 5);
      ctx.fill();
      ctx.fillStyle = '#CCCCCC';
      ctx.font = '24px serif';
      ctx.textAlign = 'center';
      ctx.fillText('📷', x + PHOTO_W / 2, y + PHOTO_H / 2 + 8);
    }
  }

  // 프레임 캐릭터 장식 (사진 루프 끝난 뒤, 클립 해제 후 그림)
  drawFrameCharacters(ctx, 'A', W, H, PAD, PHOTO_H, GAP, TOP);

  const botY = TOP + PHOTO_H * 4 + GAP * 3;
  ctx.fillStyle = theme.bar;
  ctx.fillRect(0, botY, W, BOT);

  drawBottomStars(ctx, W, botY, BOT);

  ctx.fillStyle = theme.text;
  ctx.font = 'bold 20px "Noto Sans KR", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(theme.bottomMsg, W / 2, botY + 46);

  ctx.font = '15px "Noto Sans KR", Arial, sans-serif';
  ctx.fillStyle = theme.textSub;
  ctx.fillText(theme.bottomSub, W / 2, botY + 68);

  const dateStr = formatDate(new Date());
  ctx.font = '10px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = theme.textFaint;
  ctx.fillText(dateStr, W / 2, botY + 88);

  ctx.font = 'bold 10px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = theme.watermark;
  ctx.fillText('KB Kookmin Bank', W - 12, botY + BOT - 10);

  return canvas;
}

// ---------- Frame B: 인생네컷 스타일 — 균일한 두꺼운 프레임, 세로 직사각형 사진 ----------
function renderFrameB(photos, theme = FRAME_THEMES.yellow) {
  const W = 600;
  const SIDE = 14; // 좌우 프레임 두께 (얇게)
  const TOP = 64; // 상단 프레임 (KB 네컷 타이틀 영역)
  const BOT = 80; // 하단 프레임 (메시지 + 날짜 영역)
  const GAP = 6; // 사진 사이 간격
  const PHOTO_W = Math.floor((W - SIDE * 2 - GAP) / 2); // 283px (가로)
  const PHOTO_H = Math.round((PHOTO_W * 4) / 3); // 377px (세로) — 3:4 세로형
  const H = TOP + PHOTO_H * 2 + GAP + BOT; // ~946px

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ① 전체 배경 = 프레임 색상 (균일하게 꽉 채움)
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);

  // ② KB 배지 + 타이틀 (상단 프레임 안)
  drawKBBadgeOnCanvas(ctx, 18, 18, 30);

  ctx.fillStyle = theme.text;
  ctx.font = 'bold 22px "Noto Sans KR", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('KB 네컷', W / 2, TOP / 2 + 9);

  ctx.font = '11px "Noto Sans KR", Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = theme.textSub;
  ctx.fillText('부트캠프 7기', W - 18, TOP / 2 + 5);

  // ③ 2×2 사진 배치 (세로 직사각형 3:4)
  const positions = [
    [SIDE, TOP],
    [SIDE + PHOTO_W + GAP, TOP],
    [SIDE, TOP + PHOTO_H + GAP],
    [SIDE + PHOTO_W + GAP, TOP + PHOTO_H + GAP],
  ];

  for (let i = 0; i < 4; i++) {
    const [x, y] = positions[i];

    if (photos[i]) {
      ctx.save();
      roundedRect(ctx, x, y, PHOTO_W, PHOTO_H, 4);
      ctx.clip();

      // 3:4 비율로 센터 크롭
      const srcW = photos[i].width;
      const srcH = photos[i].height;
      const dstAR = PHOTO_W / PHOTO_H; // < 1 (세로형)
      const srcAR = srcW / srcH;
      let sx, sy, sw, sh;
      if (srcAR > dstAR) {
        // 원본이 더 가로 → 좌우 잘라냄
        sh = srcH;
        sw = srcH * dstAR;
        sx = (srcW - sw) / 2;
        sy = 0;
      } else {
        // 원본이 더 세로 → 위아래 잘라냄
        sw = srcW;
        sh = srcW / dstAR;
        sx = 0;
        sy = (srcH - sh) / 2;
      }
      ctx.drawImage(photos[i], sx, sy, sw, sh, x, y, PHOTO_W, PHOTO_H);
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      roundedRect(ctx, x, y, PHOTO_W, PHOTO_H, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.font = '28px serif';
      ctx.textAlign = 'center';
      ctx.fillText('📷', x + PHOTO_W / 2, y + PHOTO_H / 2 + 10);
    }
  }

  // ④ 캐릭터 장식 (사진 루프 끝난 뒤, 프레임 경계에 걸치도록)
  drawFrameCharacters(ctx, 'B', W, H, SIDE, PHOTO_H, GAP, TOP);

  // ⑤ 하단 프레임 텍스트
  const botY = TOP + PHOTO_H * 2 + GAP;

  ctx.fillStyle = theme.text;
  ctx.font = 'bold 14px "Noto Sans KR", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(theme.bottomMsg, W / 2, botY + 26);

  ctx.font = '11px "Noto Sans KR", Arial, sans-serif';
  ctx.fillStyle = theme.textSub;
  ctx.fillText(theme.bottomSub, W / 2, botY + 45);

  const dateStr = formatDate(new Date());
  ctx.font = '10px Arial, sans-serif';
  ctx.fillStyle = theme.textFaint;
  ctx.fillText(dateStr, W / 2, botY + 62);

  ctx.font = 'bold 9px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = theme.watermark;
  ctx.fillText('KB Kookmin Bank', W - 12, botY + BOT - 8);

  return canvas;
}

// ========== FRAME CHARACTER DECORATIONS ==========
// 사진 루프가 끝난 뒤 클립 해제 상태에서 호출 — 프레임 가장자리에 캐릭터 배치
// x, y 값을 수정하면 위치를 바꿀 수 있습니다
// B형: pw=사진가로, ph=사진세로 / A형: pw 미사용, ph=사진세로
function drawFrameCharacters(ctx, frameType, W, H, PAD, ph, GAP, TOP) {
  const s = state.stickers;

  if (frameType === 'B') {
    // B형: 사진 2×2, 각 249×332 (3:4 세로형)
    // 두 행 사이 중간 y 기준점
    const midY = TOP + ph + GAP / 2;

    // 왼쪽 가장자리 — 두 행 사이 (캔버스 바깥으로 약간 튀어나옴)
    if (s.롤로라무) ctx.drawImage(s.롤로라무, -28, midY - 80, 120, 120);
    // 오른쪽 가장자리
    if (s.심쿵비비) ctx.drawImage(s.심쿵비비, W - 92, midY - 20, 115, 115);
    // 상단 바 왼쪽
    if (s.루나키키2) ctx.drawImage(s.루나키키2, PAD + 5, TOP - 35, 75, 75);
    // 하단 바 오른쪽
    if (s.포스아거1) ctx.drawImage(s.포스아거1, W - 100, H - 130, 90, 90);
  } else {
    // A형 (600×~1490, 사진 4장 560×315 세로 배열)
    const midH = H / 2; // 캔버스 세로 중간

    // 왼쪽 중간
    if (s.멜랑콜리) ctx.drawImage(s.멜랑콜리, -25, midH - 110, 120, 120);
    // 오른쪽 중간 (아래로 약간 내림)
    if (s.심쿵비비3) ctx.drawImage(s.심쿵비비3, W - 95, midH + 30, 115, 115);
    // 상단 바 왼쪽
    if (s.루나키키) ctx.drawImage(s.루나키키, PAD + 5, TOP - 30, 70, 70);
    // 하단 바 오른쪽
    if (s.롤로라무2) ctx.drawImage(s.롤로라무2, W - 95, H - 130, 85, 85);
  }
}

// ========== CANVAS HELPERS ==========

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawKBBadgeOnCanvas(ctx, x, y, h) {
  const w = h * 1.7;
  ctx.fillStyle = '#1A1A2E';
  roundedRect(ctx, x, y, w, h, 6);
  ctx.fill();

  ctx.fillStyle = '#FFC200';
  ctx.font = `bold ${Math.round(h * 0.55)}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('KB', x + w / 2, y + h * 0.7);
}

function drawPhotoDecorations(ctx, px, py, pw, ph, index) {
  const symbols = ['★', '✦', '⭐', '✦'];
  const corners = [
    [px + 10, py + 18],
    [px + pw - 10, py + 18],
    [px + pw - 10, py + ph - 10],
    [px + 10, py + ph - 10],
  ];

  ctx.font = '14px serif';
  ctx.fillStyle = 'rgba(255,194,0,0.88)';
  ctx.textAlign = 'center';

  // Primary star (index-based corner)
  const c1 = corners[index % 4];
  ctx.fillText(symbols[index % symbols.length], c1[0], c1[1]);

  // Secondary star on opposite corner
  const c2 = corners[(index + 2) % 4];
  ctx.fillStyle = 'rgba(255,194,0,0.65)';
  ctx.font = '11px serif';
  ctx.fillText('✦', c2[0], c2[1]);
}

function drawBottomStars(ctx, W, botY, BOT) {
  const starPositions = [
    [22, botY + 22],
    [38, botY + BOT - 22],
    [W - 22, botY + 22],
    [W - 38, botY + BOT - 22],
    [W / 4, botY + 14],
    [(W * 3) / 4, botY + BOT - 14],
  ];

  ctx.font = '16px serif';
  ctx.fillStyle = 'rgba(26,26,46,0.2)';
  ctx.textAlign = 'center';

  for (const [x, y] of starPositions) {
    ctx.fillText('★', x, y);
  }
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

// ========== DOWNLOAD ==========
function downloadResult() {
  if (!state.resultCanvas) return;

  const link = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  link.download = `KB네컷_부트캠프7기_${date}.png`;
  link.href = state.resultCanvas.toDataURL('image/png');
  link.click();
}

// ========== RETRY ==========
function retryPhoto() {
  state.photos = [];
  state.resultCanvas = null;
  resetCameraUI();
  showScreen('screen-camera');
  initCamera();
}

// ========== UTILS ==========
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ========== KEYBOARD SHORTCUT ==========
document.addEventListener('keydown', (e) => {
  const cameraActive = document
    .getElementById('screen-camera')
    .classList.contains('active');
  if (cameraActive && (e.code === 'Space' || e.code === 'Enter')) {
    e.preventDefault();
    onShutter();
  }
  if (e.code === 'Escape') {
    closeHowto();
  }
});

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
  preloadStickers();
  initFloatingStars();

  // Attach shutter button listener
  const shutterBtn = document.getElementById('shutter-btn');
  if (shutterBtn) {
    shutterBtn.addEventListener('click', onShutter);
  }

  // Prevent accidental back navigation while on camera screen
  window.addEventListener('popstate', (e) => {
    const cameraActive = document
      .getElementById('screen-camera')
      ?.classList.contains('active');
    if (cameraActive) {
      goBackFromCamera();
    }
  });
});
