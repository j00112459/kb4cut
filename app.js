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
  frameColor: 'yellow', // 'yellow' | 'blue' | 'black' | 'white'
  characterPlacements: [], // [{key, x, y, w, h}] — 커스텀 캐릭터 배치
  selectedCharIdx: -1, // 현재 선택된 캐릭터 인덱스
  qrUrl: null, // 업로드된 S3 URL
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
  // 블랙
  black: {
    bar: '#1A1A2E',
    bg: '#1A1A2E',
    accent: '#1A1A2E',
    text: '#FFFFFF',
    textSub: 'rgba(255,255,255,0.75)',
    textFaint: 'rgba(255,255,255,0.50)',
    watermark: 'rgba(255,255,255,0.35)',
    bottomMsg: "IT's your life 7기",
    bottomSub: '완주기원',
  },
  // 화이트
  white: {
    bar: '#FFFFFF',
    bg: '#FFFFFF',
    accent: '#FFFFFF',
    text: '#1A1A2E',
    textSub: 'rgba(26,26,46,0.65)',
    textFaint: 'rgba(26,26,46,0.45)',
    watermark: 'rgba(26,26,46,0.35)',
    bottomMsg: "IT's your life 7기",
    bottomSub: '부트캠프와 함께하는 특별한 순간',
  },
};

// ========== STICKER PRELOAD ==========
const STICKER_FILES = {
  왕관: '왕관.png',
  곰돌이서있음: '곰돌이서있음.png',
  앉아있는곰돌이: '앉아있는곰돌이-Photoroom.png',
  곰돌이하트: '곰돌이하트.png',
  따봉브로콜리: '따봉브로콜리.png',
  //점프브로콜리: '점프브로콜리.png',
  따봉악어: '따봉악어-Photoroom.png',
  //쌍따봉악어: '쌍따봉악어.png',
  따봉토끼: '따봉토끼.png',
  알파카뽀뽀: '알파카뽀뽀.png',
  주댕치: '주댕치.png',
  정면주댕치: '정면주댕치.png',
  부트캠프픽셀로고누끼: '부트캠프픽셀로고누끼.png',
  KB픽셀풍선모양누끼: 'KB픽셀풍선모양누끼.png',
  물고있는커비: '물고있는커비.png',
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
  // 커스텀 화면으로 이동 (기본 캐릭터 배치 초기화)
  initDefaultCharacterPlacements();
  showCustomizeScreen();
}

function buildResultCanvas() {
  const theme = FRAME_THEMES[state.frameColor] || FRAME_THEMES.yellow;
  const canvas =
    state.frameType === 'A'
      ? renderFrameA(state.photos, theme)
      : renderFrameB(state.photos, theme);

  // state.characterPlacements에 있는 캐릭터를 프레임 위에 그림
  const ctx = canvas.getContext('2d');
  for (const p of state.characterPlacements) {
    const img = state.stickers[p.key];
    if (img) drawSticker(ctx, img, p);
  }

  state.resultCanvas = canvas;
  canvas.dataset.frame = state.frameType;

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
  const onCustom = document
    .getElementById('screen-custom')
    ?.classList.contains('active');
  if (onCustom) {
    customBaseCanvas = null; // 베이스 캔버스 캐시 무효화
    redrawCustomCanvas();
  } else {
    buildResultCanvas();
  }
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
  state.characterPlacements = [];
  state.selectedCharIdx = -1;
  customBaseCanvas = null;
  resetCameraUI();
  showScreen('screen-camera');
  initCamera();
}

// ========== CUSTOMIZE SCREEN ==========

let customBaseCanvas = null; // 베이스 프레임 캐시 (색상 바뀔 때 무효화)
let dragState = { active: false, idx: -1, offsetX: 0, offsetY: 0 };
let resizeState = {
  active: false,
  handle: null,
  startX: 0,
  startY: 0,
  origP: null,
};
let longPressTimer = null;

// 핀치 줌 / 팬 상태
let viewScale = 1;
let viewTransX = 0;
let viewTransY = 0;
let pointerCache = []; // [{id, x, y}] 활성 포인터
let prevPinchDist = -1;
let isPanMode = false;
let panStart = { x: 0, y: 0, tx: 0, ty: 0 };

// 기본 캐릭터 배치 없음 — 커스텀 페이지에서 직접 추가
function initDefaultCharacterPlacements() {
  state.characterPlacements = [];
}

function showCustomizeScreen() {
  showScreen('screen-custom');
  customBaseCanvas = null;
  state.selectedCharIdx = -1;
  viewScale = 1;
  viewTransX = 0;
  viewTransY = 0;
  pointerCache = [];
  prevPinchDist = -1;
  // 스티커 로드 완료 후 팔레트 생성 (새 파일 추가 시에도 반영)
  preloadStickers().then(() => {
    initCustomCanvas();
    populateCharPalette();
    syncColorDots();
  });
}

function backFromCustom() {
  state.characterPlacements = [];
  state.selectedCharIdx = -1;
  customBaseCanvas = null;
  retryPhoto();
}

function finalizeCustomization() {
  buildResultCanvas();
  showScreen('screen-result');
  syncColorDots();
  uploadAndShowQR();
}

async function uploadAndShowQR() {
  if (!state.resultCanvas) return;

  state.qrUrl = null;
  const modal = document.getElementById('qr-modal');
  const status = document.getElementById('qr-modal-status');
  const qrWrap = document.getElementById('qr-modal-code');

  qrWrap.innerHTML = '';
  status.textContent = 'QR 생성 중...';
  modal.classList.remove('hidden');

  try {
    const dataUrl = state.resultCanvas.toDataURL('image/png');
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl }),
    });
    if (!res.ok) throw new Error('upload failed');

    const { url } = await res.json();
    state.qrUrl = url;
    status.textContent = 'QR 생성 완료!';
    new QRCode(qrWrap, { text: url, width: 180, height: 180 });
  } catch (err) {
    status.textContent = '업로드 실패 — 저장하기 버튼으로 저장해주세요';
    console.error(err);
  }
}

function showQRModal() {
  const modal = document.getElementById('qr-modal');
  const status = document.getElementById('qr-modal-status');
  const qrWrap = document.getElementById('qr-modal-code');

  modal.classList.remove('hidden');

  if (state.qrUrl) {
    // 이미 완료된 경우 QR 다시 그리기
    status.textContent = 'QR 생성 완료!';
    if (!qrWrap.hasChildNodes()) {
      new QRCode(qrWrap, { text: state.qrUrl, width: 180, height: 180 });
    }
  } else {
    status.textContent = 'QR 생성 중...';
  }
}

function closeQRModal(e) {
  if (e && e.target !== document.getElementById('qr-modal')) return;
  document.getElementById('qr-modal').classList.add('hidden');
}

// ── 커스텀 캔버스 초기화 ──
function initCustomCanvas() {
  const wrap = document.getElementById('custom-preview-wrap');
  if (!wrap) return;

  let canvas = document.getElementById('custom-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'custom-canvas';
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'grab';
    wrap.prepend(canvas);
    setupCustomCanvasEvents(canvas);
  }

  // 프레임 타입별 캔버스 크기 설정
  if (state.frameType === 'A') {
    const W = 480,
      PAD = 16,
      TOP = 58,
      GAP = 8,
      BOT = 120;
    const PHOTO_H = Math.round(((W - PAD * 2) * 3) / 4);
    canvas.width = W;
    canvas.height = TOP + PHOTO_H * 4 + GAP * 3 + BOT;
  } else {
    const W = 600,
      SIDE = 14,
      TOP = 64,
      GAP = 6,
      BOT = 80;
    const PHOTO_W = Math.floor((W - SIDE * 2 - GAP) / 2);
    const PHOTO_H = Math.round((PHOTO_W * 4) / 3);
    canvas.width = W;
    canvas.height = TOP + PHOTO_H * 2 + GAP + BOT;
  }
  canvas.dataset.frame = state.frameType;

  redrawCustomCanvas();
}

// ── 커스텀 캔버스 리드로우 ──
function redrawCustomCanvas() {
  const canvas = document.getElementById('custom-canvas');
  if (!canvas) return;
  const theme = FRAME_THEMES[state.frameColor] || FRAME_THEMES.yellow;

  // 베이스 프레임 캐시 (드래그 중 매번 새로 렌더링 방지)
  if (!customBaseCanvas) {
    customBaseCanvas =
      state.frameType === 'A'
        ? renderFrameA(state.photos, theme)
        : renderFrameB(state.photos, theme);
  }

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(customBaseCanvas, 0, 0);

  // 배치된 캐릭터 그리기
  for (let i = 0; i < state.characterPlacements.length; i++) {
    const p = state.characterPlacements[i];
    const img = state.stickers[p.key];
    if (!img) continue;
    ctx.save();
    if (i === state.selectedCharIdx) {
      ctx.strokeStyle = '#FFBC00';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(p.x - 3, p.y - 3, p.w + 6, p.h + 6);
      ctx.setLineDash([]);
    }
    drawSticker(ctx, img, p);
    ctx.restore();
  }

  // 선택된 캐릭터에 리사이즈 핸들 표시
  if (state.selectedCharIdx >= 0) {
    const p = state.characterPlacements[state.selectedCharIdx];
    if (p) drawResizeHandles(ctx, p);
  }

  updateDeleteBtn();
}

function drawResizeHandles(ctx, p) {
  const HS = 14; // 핸들 크기 (canvas px)
  const corners = getHandlePositions(p);
  for (const h of corners) {
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#FFBC00';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.rect(h.x - HS / 2, h.y - HS / 2, HS, HS);
    ctx.fill();
    ctx.stroke();
  }
}

function getHandlePositions(p) {
  return [
    { id: 'tl', x: p.x, y: p.y },
    { id: 'tr', x: p.x + p.w, y: p.y },
    { id: 'bl', x: p.x, y: p.y + p.h },
    { id: 'br', x: p.x + p.w, y: p.y + p.h },
  ];
}

function hitTestHandle(cx, cy) {
  if (state.selectedCharIdx < 0) return null;
  const p = state.characterPlacements[state.selectedCharIdx];
  if (!p) return null;
  const HIT = 18; // 터치 고려한 hit area
  for (const h of getHandlePositions(p)) {
    if (Math.abs(cx - h.x) <= HIT && Math.abs(cy - h.y) <= HIT) return h.id;
  }
  return null;
}

// ── 포인터 이벤트 설정 ──
function setupCustomCanvasEvents(canvas) {
  canvas.addEventListener('pointerdown', onCustomPointerDown, {
    passive: false,
  });
  canvas.addEventListener('pointermove', onCustomPointerMove, {
    passive: false,
  });
  canvas.addEventListener('pointerup', onCustomPointerUp);
  canvas.addEventListener('pointercancel', onCustomPointerUp);
  canvas.addEventListener('wheel', onCustomWheel, { passive: false });
}

function onCustomWheel(e) {
  e.preventDefault();
  const delta = e.deltaY < 0 ? 1.1 : 0.9;
  viewScale = Math.min(4, Math.max(1, viewScale * delta));
  applyViewTransform();
}

function canvasCoords(e) {
  const canvas = document.getElementById('custom-canvas');
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
  };
}

function hitTest(cx, cy) {
  for (let i = state.characterPlacements.length - 1; i >= 0; i--) {
    const p = state.characterPlacements[i];
    if (cx >= p.x && cx <= p.x + p.w && cy >= p.y && cy <= p.y + p.h) return i;
  }
  return -1;
}

function onCustomPointerDown(e) {
  e.preventDefault();

  // 포인터 캐시 업데이트
  pointerCache = pointerCache.filter((p) => p.id !== e.pointerId);
  pointerCache.push({ id: e.pointerId, x: e.clientX, y: e.clientY });

  // 2손가락 → 핀치 줌 모드
  if (pointerCache.length >= 2) {
    dragState.active = false;
    resizeState.active = false;
    isPanMode = false;
    clearTimeout(longPressTimer);
    prevPinchDist = getPinchDist();
    return;
  }

  // 1손가락: 기존 드래그/리사이즈 로직
  const { x, y } = canvasCoords(e);

  // 1순위: 핸들 hit test (선택된 캐릭터의 모서리)
  const handle = hitTestHandle(x, y);
  if (handle) {
    const orig = { ...state.characterPlacements[state.selectedCharIdx] };
    resizeState = { active: true, handle, startX: x, startY: y, origP: orig };
    try {
      e.target.setPointerCapture(e.pointerId);
    } catch (_) {}
    return;
  }

  // 2순위: 캐릭터 본체 드래그
  const idx = hitTest(x, y);
  if (idx >= 0) {
    dragState = {
      active: true,
      idx,
      offsetX: x - state.characterPlacements[idx].x,
      offsetY: y - state.characterPlacements[idx].y,
    };
    state.selectedCharIdx = idx;
    try {
      e.target.setPointerCapture(e.pointerId);
    } catch (_) {}
    longPressTimer = setTimeout(() => removeSelectedCharacter(), 700);
    isPanMode = false;
  } else {
    // 3순위: 빈 공간 → 팬 모드
    state.selectedCharIdx = -1;
    isPanMode = true;
    panStart = { x: e.clientX, y: e.clientY, tx: viewTransX, ty: viewTransY };
    try {
      e.target.setPointerCapture(e.pointerId);
    } catch (_) {}
  }
  redrawCustomCanvas();
}

function onCustomPointerMove(e) {
  e.preventDefault();

  // 포인터 캐시 업데이트
  const pi = pointerCache.findIndex((p) => p.id === e.pointerId);
  if (pi >= 0)
    pointerCache[pi] = { id: e.pointerId, x: e.clientX, y: e.clientY };

  // 2손가락 → 핀치 줌
  if (pointerCache.length >= 2) {
    const dist = getPinchDist();
    if (prevPinchDist > 0) {
      const ratio = dist / prevPinchDist;
      viewScale = Math.min(4, Math.max(1, viewScale * ratio));
      applyViewTransform();
    }
    prevPinchDist = dist;
    return;
  }

  clearTimeout(longPressTimer);

  // 팬 모드 (빈 공간 드래그)
  if (isPanMode) {
    viewTransX = panStart.tx + (e.clientX - panStart.x);
    viewTransY = panStart.ty + (e.clientY - panStart.y);
    applyViewTransform();
    return;
  }

  const { x, y } = canvasCoords(e);

  // 리사이즈 모드
  if (resizeState.active) {
    const p = state.characterPlacements[state.selectedCharIdx];
    const o = resizeState.origP;
    const dx = x - resizeState.startX;
    const dy = y - resizeState.startY;
    const MIN = 30;
    switch (resizeState.handle) {
      case 'br':
        p.w = Math.max(MIN, o.w + dx);
        p.h = Math.max(MIN, o.h + dy);
        break;
      case 'bl':
        p.x = Math.min(o.x + o.w - MIN, o.x + dx);
        p.w = Math.max(MIN, o.w - dx);
        p.h = Math.max(MIN, o.h + dy);
        break;
      case 'tr':
        p.y = Math.min(o.y + o.h - MIN, o.y + dy);
        p.w = Math.max(MIN, o.w + dx);
        p.h = Math.max(MIN, o.h - dy);
        break;
      case 'tl':
        p.x = Math.min(o.x + o.w - MIN, o.x + dx);
        p.y = Math.min(o.y + o.h - MIN, o.y + dy);
        p.w = Math.max(MIN, o.w - dx);
        p.h = Math.max(MIN, o.h - dy);
        break;
    }
    redrawCustomCanvas();
    return;
  }

  // 드래그 이동 모드
  if (!dragState.active) return;
  const p = state.characterPlacements[dragState.idx];
  p.x = Math.round(x - dragState.offsetX);
  p.y = Math.round(y - dragState.offsetY);
  redrawCustomCanvas();
}

function onCustomPointerUp(e) {
  clearTimeout(longPressTimer);
  dragState.active = false;
  resizeState.active = false;
  isPanMode = false;
  prevPinchDist = -1;
  if (e) pointerCache = pointerCache.filter((p) => p.id !== e.pointerId);
}

// ── 캐릭터 추가 / 삭제 ──
function addCharacterToCanvas(key) {
  const canvas = document.getElementById('custom-canvas');
  if (!canvas) return;
  const size = Math.round(canvas.width * 0.18);
  state.characterPlacements.push({
    key,
    x: Math.round(canvas.width / 2 - size / 2),
    y: Math.round(canvas.height / 2 - size / 2),
    w: size,
    h: size,
    flipX: false,
  });
  state.selectedCharIdx = state.characterPlacements.length - 1;
  redrawCustomCanvas();
}

function drawSticker(ctx, img, p) {
  if (p.flipX) {
    ctx.save();
    ctx.translate(p.x + p.w, p.y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, p.w, p.h);
    ctx.restore();
  } else {
    ctx.drawImage(img, p.x, p.y, p.w, p.h);
  }
}

function flipSelectedCharacter() {
  if (state.selectedCharIdx < 0) return;
  const p = state.characterPlacements[state.selectedCharIdx];
  p.flipX = !p.flipX;
  redrawCustomCanvas();
}

function removeSelectedCharacter() {
  if (state.selectedCharIdx < 0) return;
  state.characterPlacements.splice(state.selectedCharIdx, 1);
  state.selectedCharIdx = -1;
  redrawCustomCanvas();
}

function updateDeleteBtn() {
  const del = document.getElementById('char-delete-btn');
  const flip = document.getElementById('char-flip-btn');
  const selected = state.selectedCharIdx >= 0;
  if (del) del.classList.toggle('hidden', !selected);
  if (flip) flip.classList.toggle('hidden', !selected);
}

// ── 팔레트 생성 ──
function populateCharPalette() {
  const palette = document.getElementById('char-palette');
  if (!palette) return;
  palette.innerHTML = '';
  for (const key of Object.keys(STICKER_FILES)) {
    const img = state.stickers[key];
    const btn = document.createElement('button');
    btn.className = 'char-thumb';
    btn.title = key;

    if (img) {
      // 로드 성공 → 썸네일 캔버스
      btn.onclick = () => addCharacterToCanvas(key);
      const tc = document.createElement('canvas');
      tc.width = tc.height = 60;
      tc.getContext('2d').drawImage(img, 0, 0, 60, 60);
      btn.appendChild(tc);
    } else {
      // 로드 실패 → 파일명 없음 표시 (클릭 비활성)
      btn.disabled = true;
      btn.style.opacity = '0.35';
      btn.style.fontSize = '9px';
      btn.textContent = '파일없음';
    }
    palette.appendChild(btn);
  }
}

// ── 핀치 줌 헬퍼 ──
function getPinchDist() {
  if (pointerCache.length < 2) return 0;
  const dx = pointerCache[0].x - pointerCache[1].x;
  const dy = pointerCache[0].y - pointerCache[1].y;
  return Math.sqrt(dx * dx + dy * dy);
}

function applyViewTransform() {
  const canvas = document.getElementById('custom-canvas');
  if (!canvas) return;
  canvas.style.transformOrigin = '50% 0';
  canvas.style.transform = `translate(${viewTransX}px, ${viewTransY}px) scale(${viewScale})`;
}

// 모든 색상 버튼 동기화 (커스텀 + 결과 화면)
function syncColorDots() {
  document.querySelectorAll('.color-dot').forEach((el) => {
    el.classList.toggle('active', el.dataset.color === state.frameColor);
  });
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
