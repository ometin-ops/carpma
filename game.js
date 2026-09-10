/**
 * Math Slicer — game.js (v2)
 * ─────────────────────────────────────────────────────────────────────────
 *  • Türkçe-güvenli (ASCII-only) Canvas metinleri
 *  • Daha büyük objeler (r ≥ 52px), okunabilir sayı badge'i
 *  • Azaltılmış yerçekimi, uzun havada asılı kalma (hang-time)
 *  • Daire-daire elastik çarpışma (overlap önleme)
 *  • 4 İşlem tipi: standart / kolay / zor (2-basamak) / özel tablo
 *  • 3 Hız seviyesi: yavaş / normal / hızlı
 */

(() => {
  'use strict';

  /* ================================================================
     ASSETS & FRUITS
     ================================================================ */
  const ASSETS = {
    bomb: 'wired-flat-468-bomb-in-reveal.webp',
    star: 'star.png',
  };

  const FRUIT_DEFS = [
    {
      name: 'pineapple',
      src: 'wired-flat-1843-pineapple.svg',
      color: '#facc15',
      splashColors: ['#facc15', '#fef08a', '#eab308']
    },
    {
      name: 'peach',
      src: 'doodle-color-576-peach.svg',
      color: '#fb923c',
      splashColors: ['#fb923c', '#fdba74', '#ea580c']
    },
    {
      name: 'strawberry',
      src: 'wired-flat-578-strawberry.svg',
      color: '#ef4444',
      splashColors: ['#ef4444', '#f87171', '#dc2626']
    },
    {
      name: 'apple',
      src: 'wired-flat-543-apple.svg',
      color: '#22c55e',
      splashColors: ['#22c55e', '#86efac', '#15803d', '#f24c00']
    },
    {
      name: 'banana',
      src: 'wired-flat-577-banana.svg',
      color: '#eeca66',
      splashColors: ['#fde047', '#facc15', '#fef08a', '#eab308']
    }
  ];

  const images = {};
  const fruitImages = [];

  function preloadAssets() {
    for (const [k, src] of Object.entries(ASSETS)) {
      const img = new Image();
      img.src = src;
      images[k] = img;
    }
    FRUIT_DEFS.forEach(def => {
      const img = new Image();
      img.src = def.src;
      fruitImages.push({
        ...def,
        image: img
      });
    });
  }

  // Real knife slice sound file
  const sliceSound = new Audio('freesound_community-knife-slice-41231.mp3');
  sliceSound.preload = 'auto';

  // Arka plan fon müziği (ninja.mp3)
  const bgMusic = new Audio('ninja.mp3');
  bgMusic.loop = true;
  bgMusic.volume = 0.25; // Meyve kesme seslerini bastırmaması için tatlı bir arka plan seviyesi
  bgMusic.preload = 'auto';

  function playSliceSound() {
    if (sound.muted) return;
    try {
      // Hızlı ardışık kesmelerde sesin takılmaması veya gecikmemesi için:
      const soundClone = sliceSound.cloneNode();
      soundClone.volume = 0.8;
      soundClone.play().catch(err => console.log("Ses çalma hatası:", err));
    } catch (err) {
      console.log("Ses çalma hatası:", err);
    }
  }

  /* ================================================================
     SOUND MANAGER (Web Audio API Synthesizer — SFX)
     ================================================================ */
  class SoundManager {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.sfxGain = null;
      this.muted = false;
      this.lastWhoosh = 0;

      // Noise buffer cache for whoosh, juicy slice & explosion
      this.noiseBuffer = null;
    }

    init() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          this.ctx = new AC();
          this.masterGain = this.ctx.createGain();
          this.masterGain.gain.setValueAtTime(this.muted ? 0 : 1, this.ctx.currentTime);
          this.masterGain.connect(this.ctx.destination);

          this.sfxGain = this.ctx.createGain();
          this.sfxGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
          this.sfxGain.connect(this.masterGain);

          this._createNoiseBuffer();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    _createNoiseBuffer() {
      if (!this.ctx) return;
      const bufferSize = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }

    toggle() {
      this.init();
      this.muted = !this.muted;
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setValueAtTime(this.muted ? 0 : 1, this.ctx.currentTime);
      }
      return !this.muted;
    }

    // ── SFX 1: Kesme / Kılıç Rüzgar Sesi (Whoosh / Slice) ───────
    playWhoosh() {
      if (this.muted || !this.ctx) return;
      const now = performance.now();
      if (now - this.lastWhoosh < 120) return;
      this.lastWhoosh = now;

      try {
        const t = this.ctx.currentTime;
        // A. Filtered white noise sweep
        if (this.noiseBuffer) {
          const noiseSrc = this.ctx.createBufferSource();
          noiseSrc.buffer = this.noiseBuffer;

          const filter = this.ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.Q.setValueAtTime(3.2, t);
          filter.frequency.setValueAtTime(1100, t);
          filter.frequency.exponentialRampToValueAtTime(260, t + 0.13);

          const noiseGain = this.ctx.createGain();
          noiseGain.gain.setValueAtTime(0.32, t);
          noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

          noiseSrc.connect(filter);
          filter.connect(noiseGain);
          noiseGain.connect(this.sfxGain);

          noiseSrc.start(t);
          noiseSrc.stop(t + 0.14);
        }

        // B. Subtle pitch whoosh
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, t);
        osc.frequency.exponentialRampToValueAtTime(130, t + 0.11);

        g.gain.setValueAtTime(0.16, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);

        osc.connect(g);
        g.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.12);
      } catch (err) {}
    }

    // Synthetic ding / chime removed — only custom knife slice audio is used
    playDing() {}

    playSlice() {
      playSliceSound();
    }

    // ── SFX 3: Yanlış Sayı (Tok Buzzer / Sawtooth) ──────────────
    playBuzzer() {
      if (this.muted || !this.ctx) return;
      try {
        const t = this.ctx.currentTime;
        // Dual detuned sawtooth oscillators for punchy harsh buzzer
        [150, 105].forEach((baseFreq) => {
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          const flt = this.ctx.createBiquadFilter();

          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(baseFreq, t);
          osc.frequency.linearRampToValueAtTime(baseFreq * 0.65, t + 0.28);

          flt.type = 'lowpass';
          flt.frequency.setValueAtTime(850, t);
          flt.frequency.linearRampToValueAtTime(220, t + 0.28);

          g.gain.setValueAtTime(0.38, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

          osc.connect(flt);
          flt.connect(g);
          g.connect(this.sfxGain);

          osc.start(t);
          osc.stop(t + 0.3);
        });
      } catch (err) {}
    }

    // ── SFX 4: Bomba Patlama (Explosion with rumble) ────────────
    playExplosion() {
      if (this.muted || !this.ctx) return;
      try {
        const t = this.ctx.currentTime;

        // 1. Lowpass filtered noise explosion
        if (this.noiseBuffer) {
          const noise = this.ctx.createBufferSource();
          noise.buffer = this.noiseBuffer;

          const flt = this.ctx.createBiquadFilter();
          flt.type = 'lowpass';
          flt.frequency.setValueAtTime(1100, t);
          flt.frequency.linearRampToValueAtTime(50, t + 0.55);

          const g = this.ctx.createGain();
          g.gain.setValueAtTime(0.75, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

          noise.connect(flt);
          flt.connect(g);
          g.connect(this.sfxGain);

          noise.start(t);
          noise.stop(t + 0.65);
        }

        // 2. Sub-bass boom impact
        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(135, t);
        subOsc.frequency.exponentialRampToValueAtTime(26, t + 0.52);

        subGain.gain.setValueAtTime(0.7, t);
        subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);

        subOsc.connect(subGain);
        subGain.connect(this.sfxGain);
        subOsc.start(t);
        subOsc.stop(t + 0.6);
      } catch (err) {}
    }

    // ── SFX 5: Cheer / Game Over Fanfare ────────────────────────
    playCheer() {
      if (this.muted || !this.ctx) return;
      try {
        const t = this.ctx.currentTime;
        const notes = [
          { f: 523.25, d: 0.12, off: 0.00 }, // C5
          { f: 659.25, d: 0.12, off: 0.12 }, // E5
          { f: 783.99, d: 0.12, off: 0.24 }, // G5
          { f: 1046.5, d: 0.40, off: 0.36 }  // C6
        ];
        notes.forEach(n => {
          const noteTime = t + n.off;
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(n.f, noteTime);

          g.gain.setValueAtTime(0.32, noteTime);
          g.gain.exponentialRampToValueAtTime(0.001, noteTime + n.d + 0.15);

          osc.connect(g);
          g.connect(this.sfxGain);
          osc.start(noteTime);
          osc.stop(noteTime + n.d + 0.18);
        });
      } catch (err) {}
    }

    // Background music disabled
    startBGM() {}
    stopBGM() {}
  }

  const sound = new SoundManager();

  /* ================================================================
     DOM REFERENCES
     ================================================================ */
  const canvas       = document.getElementById('gameCanvas');
  const ctx          = canvas.getContext('2d');
  const hud          = document.getElementById('hud');
  const scoreDisplay = document.getElementById('score-display') || document.getElementById('scoreText');
  const questionCard = document.getElementById('questionCard');
  const questionText = document.getElementById('questionText');
  const comboBadge   = document.getElementById('comboBadge');
  const soundTogBtn  = document.getElementById('soundToggleBtn');
  const soundIcon    = document.getElementById('soundIcon');
  const flashOverlay = document.getElementById('flash-overlay');
  const startModal   = document.getElementById('start-modal');
  const startPlayBtn = document.getElementById('startPlayBtn');
  const gameOverModal= document.getElementById('game-over-modal');
  const finalScoreEl = document.getElementById('finalScore');
  const finalCorrectEl=document.getElementById('finalCorrect');
  const finalMaxEl   = document.getElementById('finalMaxCombo');
  const highScoreEl  = document.getElementById('highScore');
  const restartBtn   = document.getElementById('restartBtn');
  const menuBtn      = document.getElementById('menuBtn');
  const heartEls     = [
    document.getElementById('heart-1'),
    document.getElementById('heart-2'),
    document.getElementById('heart-3'),
  ];
  const customRow    = document.getElementById('custom-row');
  const customChips  = document.getElementById('customChips');

  /* ================================================================
     GAME STATE
     ================================================================ */
  let W = window.innerWidth;
  let H = window.innerHeight;
  let state = 'menu';             // 'menu' | 'playing' | 'gameover'

  // Settings (set from UI before game starts)
  let gameMode    = 'product';    // 'product' | 'factor'
  let opType      = '1x1';        // '1x1' | '2x1' | '2x2' | 'mixed' | 'custom'
  let customNum   = 7;            // used when opType === 'custom'
  let speedMode   = 'normal';     // 'slow' | 'normal' | 'fast'

  // Per-game vars
  let score = 0, lives = 3, combo = 0, maxCombo = 0, correctCount = 0;
  let highScore = parseInt(localStorage.getItem('math_slicer_hs') || '0', 10);
  let curA = 3, curB = 4, targetAnswer = 12;
  let isWaveActive = false, nextWaveTimer = 0;
  let waveTimerId = null;

  // Entities
  let objects = [];     // SliceableObject[]
  let halves  = [];     // HalfPiece[]
  let parts   = [];     // Particle[]
  let ftexts  = [];     // FloatingText[]

  // Blade
  const blade = [];
  let cutting = false, lastPos = null;

  /* ================================================================
     CANVAS RESIZE
     ================================================================ */
  function resizeCanvas() {
    W = window.innerWidth;
    H = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    // Physical pixel buffer size
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    // Reset transform then scale for HiDPI
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Note: W and H always represent CSS (logical) pixels —
    // all game coordinates use CSS pixels for correct touch mapping.
  }
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', () => {
    // Short delay to let the browser finish rotating before we read dimensions
    setTimeout(resizeCanvas, 150);
  });
  resizeCanvas();

  /* ================================================================
     SPEED CONFIG
     ================================================================ */
  function speedCfg() {
    // returns { gravity, gravMin, peakMin, peakMax, nextWaveMs, driftMult, spinMult, distractors }
    switch (speedMode) {
      case 'slow':
      case 'yavas':
        return {
          gravity: 0.10,     // Düşük yerçekimi (havada uzun süre süzülme ve ağır çekim hissi)
          gravMin: 0.08,
          peakMin: 0.22,
          peakMax: 0.36,
          nextWaveMs: 2800,  // Dalgalar arası 2.8 saniye sakin okuma/düşünme molası
          driftMult: 0.35,   // Düşük yatay salınım (merkezde yumuşak yay çizme)
          spinMult: 0.025,   // Yavaş dönme (meyvedeki sayının rahatça okunabilmesi için)
          distractors: 2
        };
      case 'fast':
      case 'hizli':
        return {
          gravity: 0.30,
          gravMin: 0.25,
          peakMin: 0.15,
          peakMax: 0.28,
          nextWaveMs: 650,
          driftMult: 1.15,
          spinMult: 0.065,
          distractors: 4
        };
      default: // normal / orta
        return {
          gravity: 0.20,
          gravMin: 0.16,
          peakMin: 0.16,
          peakMax: 0.30,
          nextWaveMs: 1100,
          driftMult: 0.75,
          spinMult: 0.045,
          distractors: 3
        };
    }
  }

  /* ================================================================
     QUESTION GENERATOR
     ================================================================ */
  function generateQuestion() {
    // 1. Basamak türüne göre çarpanları belirle
    switch (opType) {
      case '1x1':
        curA = rng(1, 9);
        curB = rng(1, 9);
        break;

      case '2x1':
        curA = rng(10, 99);
        curB = rng(2, 9);
        if (Math.random() < 0.5) { const t = curA; curA = curB; curB = t; }
        break;

      case '2x2':
        curA = rng(10, 99);
        curB = rng(10, 99);
        break;

      case 'mixed': {
        const subTypes = ['1x1', '2x1', '2x2'];
        const chosen = subTypes[Math.floor(Math.random() * subTypes.length)];
        if (chosen === '1x1') {
          curA = rng(1, 9);
          curB = rng(1, 9);
        } else if (chosen === '2x1') {
          curA = rng(10, 99);
          curB = rng(2, 9);
          if (Math.random() < 0.5) { const t = curA; curA = curB; curB = t; }
        } else {
          curA = rng(10, 99);
          curB = rng(10, 99);
        }
        break;
      }

      case 'custom':
        curA = customNum;
        curB = rng(1, 12);
        if (Math.random() < 0.5) { const t = curA; curA = curB; curB = t; }
        break;

      default: // default to 1x1
        curA = rng(1, 9);
        curB = rng(1, 9);
        break;
    }

    const product = curA * curB;

    // 2. Oyun moduna göre hedef cevap ve gösterilecek metin
    if (gameMode === 'factor') {
      // Çarpanı Bul (Eksik Sayıyı Bulma) Modu: a × ? = c veya ? × b = c
      const hideFirst = Math.random() < 0.5;
      if (hideFirst) {
        targetAnswer = curA;
        questionText.textContent = `? \u00D7 ${curB} = ${product}`;
      } else {
        targetAnswer = curB;
        questionText.textContent = `${curA} \u00D7 ? = ${product}`;
      }
    } else {
      // Çarpımı Bul (Klasik) Modu: a × b = ?
      targetAnswer = product;
      questionText.textContent = `${curA} \u00D7 ${curB} = ?`;
    }

    questionCard.classList.remove('bump');
    void questionCard.offsetWidth;
    questionCard.classList.add('bump');
  }

  function rng(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  function generateDistractors(count) {
    const pool = new Set();

    if (gameMode === 'factor') {
      // Çarpanı bul modu: Çeldiriciler eksik çarpana yakın gerçekçi sayılardan üretilir
      const offsets = [-3, -2, -1, 1, 2, 3, 4, -4, 5, -5];
      offsets.sort(() => Math.random() - 0.5);
      for (const off of offsets) {
        const v = targetAnswer + off;
        if (v > 0 && v !== targetAnswer && !pool.has(v)) {
          pool.add(v);
          if (pool.size >= count) break;
        }
      }
      let attempts = 0;
      while (pool.size < count && attempts < 40) {
        attempts++;
        const delta = (Math.random() < 0.5 ? 1 : -1) * rng(1, 8);
        const v = targetAnswer + delta;
        if (v > 0 && v !== targetAnswer) pool.add(v);
      }
      let fill = 1;
      while (pool.size < count) {
        if (fill !== targetAnswer && !pool.has(fill)) pool.add(fill);
        fill++;
      }
      return [...pool].slice(0, count);
    } else {
      // Çarpımı bul modu: Çeldiriciler çarpım sonucuna yakın sayılardan üretilir
      const candidates = [
        (curA + 1) * curB,
        (curA - 1) * curB,
        curA * (curB + 1),
        curA * (curB - 1),
        targetAnswer + 1,
        targetAnswer - 1,
        targetAnswer + 2,
        targetAnswer - 2,
        targetAnswer + 5,
        targetAnswer - 5,
        targetAnswer + 10,
        targetAnswer - 10,
        curA + curB,
      ];
      candidates.sort(() => Math.random() - 0.5);
      for (const c of candidates) {
        if (c > 0 && c !== targetAnswer && !pool.has(c)) {
          pool.add(c);
          if (pool.size >= count) break;
        }
      }
      let attempts = 0;
      while (pool.size < count && attempts < 40) {
        attempts++;
        const maxDelta = Math.max(12, Math.floor(targetAnswer * 0.2));
        const delta = (Math.random() < 0.5 ? 1 : -1) * rng(1, maxDelta);
        const v = targetAnswer + delta;
        if (v > 0 && v !== targetAnswer) pool.add(v);
      }
      let fill = 2;
      while (pool.size < count) {
        if (fill !== targetAnswer && !pool.has(fill)) pool.add(fill);
        fill++;
      }
      return [...pool].slice(0, count);
    }
  }

  /* ================================================================
     SLICEABLE OBJECT (Fruits & Bombs)
     ================================================================ */
  class SliceableObject {
    constructor(isTarget, value, isBomb = false) {
      this.isTarget = isTarget;
      this.value    = value;
      this.isBomb   = isBomb;

      // Diameter ~100–110px → radius ~50–55px
      const minR = Math.min(W, H) * 0.07;
      this.radius = Math.max(50, Math.min(56, minR));

      this.x = 0; this.y = 0;
      this.vx = 0; this.vy = 0;
      this.rotation = Math.random() * Math.PI * 2;

      const cfg = speedCfg();
      const spinScale = cfg.spinMult || 0.045;
      this.spin     = (Math.random() - .5) * spinScale;
      this.sliced   = false;
      this.fell     = false;

      this.gravity = cfg.gravMin + Math.random() * (cfg.gravity - cfg.gravMin);

      // Image assignment
      if (isBomb) {
        this.image = images.bomb;
        this.fruit = null;
        this.splashColors = ['#f97316', '#1a1a1a', '#fde047'];
      } else {
        // Assign random fruit SVG (pineapple, peach, strawberry, apple, banana)
        const pick = fruitImages.length > 0
          ? fruitImages[Math.floor(Math.random() * fruitImages.length)]
          : null;
        this.fruit = pick;
        this.image = pick?.image || null;
        this.splashColors = pick?.splashColors || ['#facc15', '#fb923c', '#ef4444'];
      }
    }

    spawn(startX, peakY) {
      this.x = startX;
      this.y = H + this.radius + 10;

      const h  = this.y - peakY;
      this.vy  = -Math.sqrt(2 * this.gravity * h);

      // Always angle toward screen center so objects don't fly off edges.
      // Objects spawned left-of-center drift right; right-of-center drift left.
      const distFromCenter = W * 0.5 - startX;          // positive = left side, negative = right
      const dirSign        = Math.sign(distFromCenter) || 1;
      const cfg            = speedCfg();
      const drift          = cfg.driftMult || 0.75;
      // Clamp vx magnitude based on screen width so objects form a gentle arch
      const vxBase  = (W / 2 - startX) * 0.010 * drift;
      const vxJitter= dirSign * Math.random() * (W * 0.003) * drift;
      this.vx = vxBase + vxJitter;
    }

    update(dt = 1) {
      if (this.sliced) return;
      this.x  += this.vx * dt;
      this.y  += this.vy * dt;
      this.vy += this.gravity * dt;
      this.rotation += this.spin * dt;

      // ── Wall bounce: keep objects fully inside the screen ──
      if (this.x - this.radius < 0) {
        this.x  = this.radius;
        this.vx = Math.abs(this.vx) * 0.65;   // reflect toward right, soften
      } else if (this.x + this.radius > W) {
        this.x  = W - this.radius;
        this.vx = -Math.abs(this.vx) * 0.65;  // reflect toward left, soften
      }

      if (this.vy > 0 && this.y > H + this.radius + 60) {
        this.fell = true;
      }
    }

    draw(c) {
      if (this.sliced || this.fell) return;
      const r = this.radius;

      c.save();
      c.translate(this.x, this.y);

      // Rotate fruit
      c.rotate(this.rotation);

      // Draw fruit image at full size (at least 100px x 100px)
      const isBanana = this.fruit?.name === 'banana';
      const sizeMult = isBanana ? 2.4 : 2.15;
      const size = Math.max(104, r * sizeMult);
      if (this.image?.complete && this.image.naturalWidth > 0) {
        c.drawImage(this.image, -size / 2, -size / 2, size, size);
      } else {
        c.beginPath();
        c.arc(0, 0, r, 0, Math.PI * 2);
        c.fillStyle = this.isBomb ? '#222' : (this.fruit?.color || '#f59e0b');
        c.fill();
      }

      // Unrotate before drawing text so it stays readable and upright
      c.rotate(-this.rotation);

      if (!this.isBomb) {
        const label = this.value.toString();

        // Responsive font size: perfectly sized for fruit bodies without overflowing
        let fontSize = 34;
        if (label.length >= 3) {
          fontSize = 26;
        } else if (isBanana) {
          fontSize = 30;
        }

        const yOffset = isBanana ? 4 : 0;

        c.save();
        c.font = `900 ${fontSize}px 'Fredoka', sans-serif`;
        c.textAlign = "center";
        c.textBaseline = "middle";

        // Kalın beyaz dış çizgi (meyvenin üzerinde sayıyı parlatır ve ayırır)
        c.strokeStyle = "#FFFFFF";
        c.lineWidth = 7;
        c.lineJoin = "round";
        c.strokeText(label, 0, yOffset);

        // Koyu dolgu rengi
        c.fillStyle = "#1E293B";
        c.fillText(label, 0, yOffset);
        c.restore();
      }

      c.restore();
    }
  }

  /* ================================================================
     ELASTIC CIRCLE-CIRCLE COLLISION RESOLUTION
     ================================================================ */
  function resolveCollisions() {
    for (let i = 0; i < objects.length; i++) {
      const a = objects[i];
      if (a.sliced || a.fell) continue;
      for (let j = i + 1; j < objects.length; j++) {
        const b = objects[j];
        if (b.sliced || b.fell) continue;

        const dx   = b.x - a.x;
        const dy   = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minD = a.radius + b.radius;

        if (dist < minD && dist > 0.01) {
          // Normalised collision normal
          const nx = dx / dist;
          const ny = dy / dist;

          // Push them apart gently (half each) — soft damping prevents jittering
          const overlap = (minD - dist) * 0.25;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;

          // Exchange velocity along collision normal (soft elastic)
          const dvx = a.vx - b.vx;
          const dvy = a.vy - b.vy;
          const dot  = dvx * nx + dvy * ny;

          if (dot > 0) {
            const restitution = 0.45;
            const impulse = dot * restitution;
            a.vx -= impulse * nx;
            a.vy -= impulse * ny;
            b.vx += impulse * nx;
            b.vy += impulse * ny;
          }
        }
      }
    }
  }

  /* ================================================================
     HALF PIECE (Fruit Split Animation)
     ================================================================ */
  class HalfPiece {
    constructor(image, fruit, value, x, y, r, angle, side) {
      this.image   = image;
      this.fruit   = fruit;
      this.value   = value;
      this.x = x; this.y = y;
      this.radius  = r;
      this.angle   = angle;   // cut angle
      this.side    = side;    // -1 | +1

      const isSlow = speedMode === 'slow' || speedMode === 'yavas';
      const push = (isSlow ? 3.5 : 5.5) + Math.random() * (isSlow ? 2.5 : 4);
      const pa   = angle + Math.PI / 2;
      this.vx  = Math.cos(pa) * push * side + (Math.random() - .5) * (isSlow ? 1.2 : 2);
      this.vy  = Math.sin(pa) * push * side - (isSlow ? 1.8 : 2.8);
      this.grav   = isSlow ? 0.22 : 0.40;
      this.rot    = 0;
      this.spin   = ((isSlow ? 0.04 : 0.09) + Math.random() * (isSlow ? 0.05 : 0.11)) * side;
      this.alpha  = 1;
    }

    update(dt = 1) {
      this.x   += this.vx * dt;
      this.y   += this.vy * dt;
      this.vy  += this.grav * dt;
      this.rot += this.spin * dt;
      this.alpha -= 0.016 * dt;
    }

    draw(c) {
      if (this.alpha <= 0) return;
      c.save();
      c.globalAlpha = Math.max(0, this.alpha);
      c.translate(this.x, this.y);
      c.rotate(this.angle + this.rot);

      // Clip half of fruit
      c.beginPath();
      const r = this.radius * 1.5;
      if (this.side < 0) c.rect(-r, -r, r * 2, r);
      else                c.rect(-r,  0, r * 2, r);
      c.clip();

      const isBanana = this.fruit?.name === 'banana';
      const sizeMult = isBanana ? 2.4 : 2.15;
      const size = Math.max(104, this.radius * sizeMult);
      if (this.image?.complete && this.image.naturalWidth > 0) {
        c.drawImage(this.image, -size / 2, -size / 2, size, size);
      }

      c.restore();
    }
  }

  /* ================================================================
     PARTICLES (Juice Splashes, Smoke, Stars)
     ================================================================ */
  class Particle {
    constructor(x, y, color, type = 'spark') {
      this.x = x; this.y = y;
      this.color = color; this.type = type;
      this.r     = type === 'smoke' ? rng(10, 22) : (type === 'splash' ? rng(4, 9) : rng(4, 8));
      const spd  = type === 'splash' ? Math.random() * 8.5 + 2.5 : Math.random() * 9 + 2;
      const ang  = Math.random() * Math.PI * 2;
      this.vx    = Math.cos(ang) * spd;
      this.vy    = Math.sin(ang) * spd - (type === 'smoke' ? 2 : (type === 'splash' ? 1.5 : 0));
      this.grav  = type === 'smoke' ? -.04 : (type === 'splash' ? .32 : .28);
      this.alpha = 1;
      this.decay = type === 'splash' ? Math.random() * .035 + .022 : Math.random() * .03 + .022;
      this.spin  = (Math.random() - .5) * .25;
      this.rot   = 0;
    }
    update(dt = 1) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += this.grav * dt;
      this.rot += this.spin * dt;
      this.alpha -= this.decay * dt;
      if (this.type === 'smoke') this.r += 0.3 * dt;
      if (this.type === 'splash') this.r = Math.max(1, this.r * Math.pow(0.985, dt));
    }
    draw(c) {
      if (this.alpha <= 0) return;
      c.save();
      c.globalAlpha = Math.max(0, this.alpha);
      c.translate(this.x, this.y);
      if (this.type === 'star' && images.star?.complete) {
        c.rotate(this.rot);
        const s = this.r * 3.8;
        c.drawImage(images.star, -s/2, -s/2, s, s);
      } else if (this.type === 'splash') {
        // Juicy fruit droplet with highlight
        c.beginPath();
        c.arc(0, 0, this.r, 0, Math.PI * 2);
        c.fillStyle = this.color;
        c.shadowColor = this.color;
        c.shadowBlur = 5;
        c.fill();
        c.beginPath();
        c.arc(-this.r * 0.3, -this.r * 0.3, this.r * 0.35, 0, Math.PI * 2);
        c.fillStyle = 'rgba(255, 255, 255, 0.75)';
        c.fill();
      } else {
        c.beginPath();
        c.arc(0, 0, this.r, 0, Math.PI * 2);
        c.fillStyle = this.color;
        if (this.type === 'spark') { c.shadowColor = this.color; c.shadowBlur = 8; }
        c.fill();
      }
      c.restore();
    }
  }

  /* ================================================================
     FLOATING TEXT
     ================================================================ */
  class FloatingText {
    constructor(text, x, y, color = '#facc15', size = 34) {
      this.text = text; this.x = x; this.y = y;
      this.color = color; this.size = size;
      this.vy = -4; this.alpha = 1; this.scale = 1.35;
    }
    update(dt = 1) {
      this.y     += this.vy * dt;
      this.vy    *= Math.pow(0.93, dt);
      this.alpha -= 0.022 * dt;
      if (this.scale > 1) this.scale -= 0.04 * dt;
    }
    draw(c) {
      if (this.alpha <= 0) return;
      c.save();
      c.globalAlpha = Math.max(0, this.alpha);
      c.translate(this.x, this.y);
      c.scale(this.scale, this.scale);
      c.font         = `900 ${this.size}px "Baloo 2","Nunito",sans-serif`;
      c.textAlign    = 'center';
      c.textBaseline = 'middle';
      c.lineWidth    = 7;
      c.strokeStyle  = '#000';
      c.strokeText(this.text, 0, 0);
      c.fillStyle    = this.color;
      c.fillText(this.text, 0, 0);
      c.restore();
    }
  }

  /* ================================================================
     WAVE SPAWNER
     ================================================================ */
  function spawnWave() {
    if (state !== 'playing') return;
    objects = [];
    isWaveActive = true;

    const cfg = speedCfg();
    const numDistractors = cfg.distractors + (score >= 50 ? 1 : 0);
    const distractors    = generateDistractors(numDistractors);

    const spawnList = [
      { isTarget: true,  value: targetAnswer, isBomb: false },
      ...distractors.map(d => ({ isTarget: false, value: d, isBomb: false })),
    ];

    // Bomb: available after a few correct answers or advanced modes
    const bombChance = (opType === '2x2' || opType === 'mixed') ? .30 : (correctCount >= 3 ? .20 : 0);
    if (Math.random() < bombChance) {
      spawnList.push({ isTarget: false, value: 0, isBomb: true });
    }

    // Shuffle
    spawnList.sort(() => Math.random() - .5);

    const count = spawnList.length;

    // ── Safe spawn zone: 15 % … 85 % of screen width ──
    // This ensures objects start well inside the playfield even on narrow phones.
    const margin  = W * 0.15;
    const safeW   = W - margin * 2;           // usable width inside margins
    const slotW   = safeW / count;

    const positions = spawnList.map((_, i) => {
      const base   = margin + slotW * i + slotW * 0.5;
      const jitter = (Math.random() - 0.5) * slotW * 0.4;
      // Hard-clamp to radius so object never starts partially off-screen
      const r = Math.max(52, Math.min(W, H) * 0.072);
      return Math.max(r, Math.min(W - r, base + jitter));
    });

    spawnList.forEach((item, i) => {
      const obj   = new SliceableObject(item.isTarget, item.value, item.isBomb);
      obj.radius  = Math.max(52, Math.min(W, H) * 0.072); // consistent per wave
      const peakY = H * (cfg.peakMin + Math.random() * (cfg.peakMax - cfg.peakMin));
      obj.spawn(positions[i], peakY);
      objects.push(obj);
    });
  }

  /* ================================================================
     LINE-CIRCLE INTERSECTION (blade hit detection)
     ================================================================ */
  function lineHitsCircle(p1, p2, cx, cy, cr) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 0.001) {
      return (cx - p1.x) ** 2 + (cy - p1.y) ** 2 <= cr * cr;
    }
    const t  = Math.max(0, Math.min(1, ((cx - p1.x) * dx + (cy - p1.y) * dy) / lenSq));
    const nx = p1.x + t * dx - cx;
    const ny = p1.y + t * dy - cy;
    return nx * nx + ny * ny <= cr * cr;
  }

  /* ================================================================
     SLICE HANDLER
     ================================================================ */
  function handleSlice(obj, cutAngle) {
    if (!obj || obj.sliced) return;
    obj.sliced = true;

    try {
      // Two half-pieces
      halves.push(
        new HalfPiece(obj.image, obj.fruit, obj.isBomb ? null : obj.value, obj.x, obj.y, obj.radius, cutAngle, -1),
        new HalfPiece(obj.image, obj.fruit, obj.isBomb ? null : obj.value, obj.x, obj.y, obj.radius, cutAngle,  1),
      );
    } catch (err) {
      console.warn("HalfPiece creation error:", err);
    }

    if (obj.isBomb) {
      try { sound.playExplosion(); } catch (e) {}
      try { shakeScreen(true); } catch (e) {}
      loseLife();
      ftexts.push(new FloatingText('BOMBA!', obj.x, obj.y - 20, '#ef4444', 40));
      for (let i = 0; i < 30; i++) parts.push(new Particle(obj.x, obj.y, i % 2 ? '#f97316' : '#1a1a1a', 'smoke'));
      for (let i = 0; i < 18; i++) parts.push(new Particle(obj.x, obj.y, '#fde047', 'spark'));
      return;
    }

    // Fruit juice splash particles matching fruit colors
    const splashCols = obj.splashColors || ['#facc15', '#fb923c', '#ef4444', '#22c55e'];
    const splashCount = obj.isTarget ? 24 : 16;
    for (let i = 0; i < splashCount; i++) {
      parts.push(new Particle(obj.x, obj.y, splashCols[i % splashCols.length], 'splash'));
    }

    // Play real knife slice sound for every fruit sliced
    try { playSliceSound(); } catch (e) {}

    if (obj.isTarget) {
      combo++;
      if (combo > maxCombo) maxCombo = combo;
      correctCount++;

      const mult   = combo >= 4 ? 3 : combo >= 2 ? 2 : 1;
      const pts    = 10 * mult;
      score       += pts;
      scoreDisplay.textContent = score;

      if (combo >= 2) {
        comboBadge.textContent = `${combo}x KOMBO!`;
        comboBadge.classList.remove('hidden');
      }

      const lbl = mult > 1 ? `+${pts} ${combo}x KOMBO!` : `+${pts}`;
      ftexts.push(new FloatingText(lbl, obj.x, obj.y - 35, '#facc15', 36));
      for (let i = 0; i < 20; i++) parts.push(new Particle(obj.x, obj.y, '#facc15', 'star'));
      for (let i = 0; i < 14; i++) parts.push(new Particle(obj.x, obj.y, '#38bdf8', 'spark'));

      // Ekrandaki diğer meyvelerin hedef olma durumunu sıfırla (kaçırma hatasını engeller)
      for (const o of objects) {
        if (o !== obj) o.isTarget = false;
      }
      isWaveActive = false;

      // Yeni soruya geç ve yeni dalgayı fırlat
      if (waveTimerId) clearTimeout(waveTimerId);
      const isSlow = speedMode === 'slow' || speedMode === 'yavas';
      const sliceDelay = isSlow ? 1200 : (speedMode === 'fast' || speedMode === 'hizli' ? 650 : 800);
      waveTimerId = setTimeout(() => {
        try {
          if (state === 'playing') {
            generateQuestion();
            spawnWave();
          }
        } catch (err) {
          console.error("Yeni dalga başlatma hatası:", err);
        }
      }, sliceDelay);

    } else {
      // Wrong answer
      try { sound.playBuzzer(); } catch (e) {}
      try { shakeScreen(false); } catch (e) {}
      loseLife();
      combo = 0;
      comboBadge.classList.add('hidden');
      ftexts.push(new FloatingText('YANLIŞ!', obj.x, obj.y - 20, '#ef4444', 36));
      for (let i = 0; i < 16; i++) parts.push(new Particle(obj.x, obj.y, '#ef4444', 'spark'));
    }
  }

  /* ================================================================
     LIVES / HUD UPDATES
     ================================================================ */
  function loseLife() {
    if (lives <= 0) return;
    lives--;
    updateHUDLives();
    if (lives <= 0) triggerGameOver();
  }

  function updateHUDLives() {
    heartEls.forEach((el, i) => {
      if (!el) return;
      if (i < lives) {
        el.classList.add('active');
        el.classList.remove('lost');
        el.setAttribute('fill', '#FF4757');
      } else {
        el.classList.remove('active');
        el.classList.add('lost');
        el.setAttribute('fill', '#CBD5E1');
      }
    });
  }

  function shakeScreen(bomb = false) {
    flashOverlay.style.opacity = bomb ? '.75' : '.42';
    document.body.classList.remove('shake-screen');
    void document.body.offsetWidth;
    document.body.classList.add('shake-screen');
    setTimeout(() => {
      flashOverlay.style.opacity = '0';
      document.body.classList.remove('shake-screen');
    }, 360);
  }

  /* ================================================================
     GAME OVER
     ================================================================ */
  function triggerGameOver() {
    state = 'gameover';
    try { bgMusic.pause(); } catch (e) {}
    sound.playCheer();
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('math_slicer_hs', String(highScore));
    }

    finalScoreEl.textContent    = score;
    finalCorrectEl.textContent  = correctCount;
    finalMaxEl.textContent      = `${maxCombo}x`;
    highScoreEl.textContent     = highScore;

    const star1 = document.getElementById('star1');
    const star2 = document.getElementById('star2');
    const star3 = document.getElementById('star3');
    [star1, star2, star3].forEach(s => s.classList.remove('earned'));
    setTimeout(() => { if (score >= 30)  star1.classList.add('earned'); }, 450);
    setTimeout(() => { if (score >= 100) star2.classList.add('earned'); }, 900);
    setTimeout(() => { if (score >= 200) star3.classList.add('earned'); }, 1350);

    // Disable canvas input so gameover modal buttons are freely tappable
    setCanvasActive(false);
    gameOverModal.classList.remove('hidden');
  }

  /* ================================================================
     START GAME
     ================================================================ */
  function startGame() {
    lastTime = performance.now();
    sound.init();
    if (!sound.muted) {
      bgMusic.play().catch(err => console.log("Müzik başlatılamadı:", err));
    }
    if (waveTimerId) clearTimeout(waveTimerId);

    state        = 'playing';
    score        = 0;
    lives        = 3;
    combo        = 0;
    maxCombo     = 0;
    correctCount = 0;

    scoreDisplay.textContent = '0';
    comboBadge.classList.add('hidden');
    updateHUDLives();

    objects = []; halves = []; parts = []; ftexts = [];
    blade.length = 0;

    startModal.classList.add('hidden');
    gameOverModal.classList.add('hidden');
    hud.classList.remove('hidden');

    // Canvas becomes the primary input surface during gameplay
    setCanvasActive(true);

    generateQuestion();
    spawnWave();
  }

  /* ================================================================
     BLADE TRAIL
     ================================================================ */
  function pruneBlade() {
    const now = performance.now();
    while (blade.length > 0 && now - blade[0].t > 140) blade.shift();
  }

  function drawBlade() {
    if (blade.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < blade.length; i++) {
        const p1 = blade[i - 1], p2 = blade[i];
        const pct = i / blade.length;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        if (pass === 0) {
          // Neon cyan glow for vibrant contrast on bright pastel background
          ctx.lineWidth   = pct * 18;
          ctx.strokeStyle = `rgba(0, 210, 255, ${pct * 0.85})`;
          ctx.shadowColor = '#00d2ff'; ctx.shadowBlur = 18;
        } else {
          // Pure white razor core
          ctx.lineWidth   = pct * 5.5;
          ctx.strokeStyle = `rgba(255, 255, 255, ${pct * 0.98})`;
          ctx.shadowBlur  = 0;
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* ================================================================
     INPUT
     ================================================================ */
  /* ================================================================
     CANVAS STATE HELPER
     Toggle pointer-events so HTML modal buttons are always tappable.
     ================================================================ */
  function setCanvasActive(active) {
    if (active) {
      canvas.classList.remove('canvas-inactive');
    } else {
      canvas.classList.add('canvas-inactive');
    }
  }
  // Start with canvas inactive (menu is visible)
  setCanvasActive(false);

  /* ================================================================
     INPUT — COORDINATE HELPERS
     ================================================================ */
  /**
   * Convert a mouse/touch client position to CSS-pixel canvas coords.
   * We do NOT divide by devicePixelRatio here because W/H are already
   * in CSS pixels and canvas is scaled via ctx.scale(dpr,dpr).
   */
  function clientToCanvas(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    // rect.width / rect.height == CSS size of the canvas element (== W, H)
    // canvas.width / canvas.height == physical pixels (== W*dpr, H*dpr)
    // We want logical coordinates (same units as W, H).
    return {
      x: (clientX - rect.left) * (W / rect.width),
      y: (clientY - rect.top)  * (H / rect.height),
    };
  }

  function posFromMouse(e) {
    return clientToCanvas(e.clientX, e.clientY);
  }

  function posFromTouch(e) {
    // Use changedTouches as fallback for touchend
    const t = (e.touches && e.touches.length > 0)
      ? e.touches[0]
      : e.changedTouches[0];
    return clientToCanvas(t.clientX, t.clientY);
  }

  /* ================================================================
     INPUT — SLICE LOGIC (shared between mouse and touch)
     ================================================================ */
  function sliceStart(pos) {
    sound.init();
    cutting = true;
    lastPos = pos;
    blade.push({ x: pos.x, y: pos.y, t: performance.now() });
  }

  function sliceMove(pos) {
    blade.push({ x: pos.x, y: pos.y, t: performance.now() });

    if (lastPos && state === 'playing') {
      const dx = pos.x - lastPos.x;
      const dy = pos.y - lastPos.y;
      const dist = Math.hypot(dx, dy);

      // Play whoosh slice sound when user makes a swift swipe
      if (dist >= 14) {
        sound.playWhoosh();
      }

      if (dist >= 4) {
        const ang = Math.atan2(dy, dx);
        for (const obj of objects) {
          if (!obj.sliced && !obj.fell &&
              lineHitsCircle(lastPos, pos, obj.x, obj.y, obj.radius)) {
            handleSlice(obj, ang);
          }
        }
      }
    }
    lastPos = pos;
  }

  function sliceEnd(pos) {
    // Tap detection: very short swipe → treat as direct hit
    if (cutting && lastPos && blade.length <= 4 && state === 'playing') {
      const p = pos || lastPos;
      for (const obj of objects) {
        if (!obj.sliced && !obj.fell) {
          const d2 = (obj.x - p.x) ** 2 + (obj.y - p.y) ** 2;
          if (d2 <= (obj.radius * 1.15) ** 2) {
            handleSlice(obj, -Math.PI / 4);
            break;
          }
        }
      }
    }
    cutting = false;
    lastPos = null;
  }

  /* ================================================================
     INPUT — MOUSE (desktop)
     ================================================================ */
  canvas.addEventListener('mousedown', e => { sliceStart(posFromMouse(e)); });
  window.addEventListener('mousemove', e => {
    if (!cutting) return;
    sliceMove(posFromMouse(e));
  });
  window.addEventListener('mouseup', e => { sliceEnd(posFromMouse(e)); });

  /* ================================================================
     INPUT — TOUCH (mobile / tablet)
     Canvas-only listeners with conditional preventDefault:
       • state === 'playing'  → prevent scroll/zoom, do slicing
       • state !== 'playing'  → do NOT preventDefault, let touches
                                 bubble to HTML buttons naturally
     ================================================================ */
  canvas.addEventListener('touchstart', e => {
    // Only block default browser behavior during gameplay
    if (state === 'playing') {
      e.preventDefault();
      sliceStart(posFromTouch(e));
    }
    // In menu/gameover: do nothing — the canvas is pointer-events:none
    // so this handler won't even fire; HTML buttons receive the touch.
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    if (state === 'playing') {
      e.preventDefault();
      if (cutting) sliceMove(posFromTouch(e));
    }
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    if (state === 'playing') {
      e.preventDefault();
      sliceEnd(posFromTouch(e));
    }
  }, { passive: false });

  canvas.addEventListener('touchcancel', () => {
    cutting = false; lastPos = null;
  });

  /* ================================================================
     UI: SETTINGS PANEL BUTTONS
     ================================================================ */

  // Generic selector group (supports .sel-btn, .mode-capsule-btn, .speed-btn)
  function bindSelectors(group, callback) {
    document.querySelectorAll(`[data-group="${group}"]`).forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll(`[data-group="${group}"]`).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        callback(btn.dataset.val);
      });
    });
  }

  bindSelectors('gamemode', val => {
    gameMode = val;
  });

  bindSelectors('optype', val => {
    opType = val;
    if (val === 'custom') {
      customRow.classList.remove('hidden');
    } else {
      customRow.classList.add('hidden');
    }
  });

  bindSelectors('speed', val => { speedMode = val; });

  // Build custom number chips (2 – 12)
  for (let n = 2; n <= 12; n++) {
    const btn = document.createElement('button');
    btn.className  = 'chip-btn' + (n === 7 ? ' active' : '');
    btn.textContent = n;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      customNum = n;
    });
    customChips.appendChild(btn);
  }
  customNum = 7;

  /* ================================================================
     SOUND TOGGLE & AUDIO UNLOCK
     ================================================================ */
  function updateSoundIcon() {
    const soundOnPath = document.getElementById('soundOnPath');
    const soundOffPath = document.getElementById('soundOffPath');
    if (soundOnPath && soundOffPath) {
      if (sound.muted) {
        soundOnPath.classList.add('hidden');
        soundOffPath.classList.remove('hidden');
      } else {
        soundOnPath.classList.remove('hidden');
        soundOffPath.classList.add('hidden');
      }
    }
  }

  function toggleMute() {
    sound.toggle();
    updateSoundIcon();
    if (sound.muted) {
      bgMusic.pause();
    } else {
      if (state === 'playing') {
        bgMusic.play().catch(e => console.log("Müzik başlatılamadı:", e));
      }
    }
  }

  soundTogBtn.addEventListener('click', toggleMute);

  // Global one-time or ongoing touch/pointer unlock for iOS Safari & Android Chrome autoplay policies
  const unlockAudio = () => {
    sound.init();
    if (sliceSound) {
      try { sliceSound.load(); } catch (e) {}
    }
  };
  window.addEventListener('touchstart', unlockAudio, { passive: true });
  window.addEventListener('touchend', unlockAudio, { passive: true });
  window.addEventListener('mousedown', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      bgMusic.pause();
    } else if (state === 'playing' && !sound.muted) {
      bgMusic.play().catch(() => {});
    }
  });

  /* ================================================================
     BUTTON EVENTS
     ================================================================ */
  startPlayBtn.addEventListener('click', () => {
    sound.init();
    if (sliceSound) {
      try { sliceSound.load(); } catch (e) {}
    }
    bgMusic.currentTime = 0;
    startGame();
  });

  restartBtn.addEventListener('click', () => {
    sound.init();
    if (sliceSound) {
      try { sliceSound.load(); } catch (e) {}
    }
    bgMusic.currentTime = 0;
    startGame();
  });

  menuBtn.addEventListener('click', () => {
    try {
      bgMusic.pause();
      bgMusic.currentTime = 0;
    } catch (e) {}
    if (waveTimerId) clearTimeout(waveTimerId);
    gameOverModal.classList.add('hidden');
    hud.classList.add('hidden');
    startModal.classList.remove('hidden');
    setCanvasActive(false);  // deactivate canvas — menu buttons must be tappable
    state = 'menu';
  });

  /* ================================================================
     MAIN LOOP (Delta-Time 60 FPS Physics & Smooth Rendering)
     ================================================================ */
  let lastTime = performance.now();

  function gameLoop(currentTime) {
    requestAnimationFrame(gameLoop);

    try {
      if (!currentTime) currentTime = performance.now();
      // Delta time in seconds, clamped between 1ms and 50ms to prevent jumps on tab switch
      const dtSec = Math.min(Math.max((currentTime - lastTime) / 1000, 0.001), 0.05);
      lastTime = currentTime;

      // Normalised delta factor (1.0 at reference 60 FPS)
      const dt = dtSec * 60;

      ctx.clearRect(0, 0, W, H);

      if (state === 'playing') {
        if (isWaveActive) {
          // Elastic overlap resolution each frame
          resolveCollisions();

          let allDone = true, targetMissed = false;
          for (const o of objects) {
            if (!o.sliced && !o.fell) allDone = false;
            if (o.isTarget && o.fell && !o.sliced) {
              targetMissed = true;
              o.isTarget = false; // Tekrar tetiklenmesini engelle
            }
          }

          if (targetMissed) {
            try { sound.playBuzzer(); } catch (e) {}
            try { shakeScreen(false); } catch (e) {}
            loseLife();
            combo = 0;
            comboBadge.classList.add('hidden');
            ftexts.push(new FloatingText('KAÇIRDIN!', W * .5, H * .45, '#f59e0b', 42));
            isWaveActive = false;

            if (waveTimerId) clearTimeout(waveTimerId);
            const missDelay = speedCfg().nextWaveMs || 1000;
            waveTimerId = setTimeout(() => {
              try {
                if (state === 'playing') {
                  generateQuestion();
                  spawnWave();
                }
              } catch (e) {
                console.error("Target missed spawn error:", e);
              }
            }, missDelay);

          } else if (allDone && isWaveActive) {
            isWaveActive = false;
            if (waveTimerId) clearTimeout(waveTimerId);
            const doneDelay = Math.min(speedCfg().nextWaveMs || 1000, 1600);
            waveTimerId = setTimeout(() => {
              try {
                if (state === 'playing') {
                  generateQuestion();
                  spawnWave();
                }
              } catch (e) {
                console.error("All done spawn error:", e);
              }
            }, doneDelay);
          }
        }

        // Update & draw game objects
        for (const o of objects) {
          o.update(dt);
          o.draw(ctx);
        }
      }

      // Half pieces
      for (let i = halves.length - 1; i >= 0; i--) {
        const h = halves[i];
        h.update(dt);
        h.draw(ctx);
        if (h.alpha <= 0 || h.y > H + 120) halves.splice(i, 1);
      }

      // Particles
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.update(dt);
        p.draw(ctx);
        if (p.alpha <= 0) parts.splice(i, 1);
      }

      // Floating texts
      for (let i = ftexts.length - 1; i >= 0; i--) {
        const ft = ftexts[i];
        ft.update(dt);
        ft.draw(ctx);
        if (ft.alpha <= 0) ftexts.splice(i, 1);
      }

      // Blade trail
      pruneBlade();
      drawBlade();

    } catch (err) {
      console.error('gameLoop animation frame error:', err);
    }
  }

  /* ================================================================
     PWA SERVICE WORKER REGISTRATION & INSTALL PROMPT
     ================================================================ */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then(reg => console.log('[SW] Kayıt başarılı:', reg.scope))
        .catch(err => console.warn('[SW] Kayıt hatası:', err));
    });
  }

  let deferredPrompt = null;
  const installBtn = document.getElementById('installAppBtn');
  const iosInstallModal = document.getElementById('iosInstallModal');
  const closeIosInstallBtn = document.getElementById('closeIosInstallBtn');

  // Check if running as installed standalone PWA
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  // iOS Safari detection
  const isIos = () => {
    const ua = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua);
  };
  const isIosSafari = isIos() && !isStandalone;

  if (!isStandalone) {
    // Show button on iOS Safari since beforeinstallprompt is not supported on iOS
    if (isIosSafari && installBtn) {
      installBtn.classList.remove('hidden');
    }

    // Capture standard install prompt (Chrome / Android / Edge)
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (installBtn) {
        installBtn.classList.remove('hidden');
      }
    });
  }

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          installBtn.classList.add('hidden');
        }
        deferredPrompt = null;
      } else if (isIosSafari) {
        if (iosInstallModal) {
          iosInstallModal.classList.remove('hidden');
        }
      }
    });
  }

  window.addEventListener('appinstalled', () => {
    if (installBtn) installBtn.classList.add('hidden');
    deferredPrompt = null;
    console.log('[PWA] Uygulama başarıyla yüklendi!');
  });

  if (closeIosInstallBtn && iosInstallModal) {
    closeIosInstallBtn.addEventListener('click', () => {
      iosInstallModal.classList.add('hidden');
    });
  }

  /* ================================================================
     MOBİL KARŞILAMA EKRANI (SPLASH SCREEN)
     ================================================================ */
  function handleSplashScreen() {
    const splash = document.getElementById('splash-screen');
    if (splash) {
      setTimeout(() => {
        splash.classList.add('fade-out');
        setTimeout(() => {
          splash.remove();
        }, 800);
      }, 1800);
    }
  }

  if (document.readyState === 'complete') {
    handleSplashScreen();
  } else {
    window.addEventListener('load', handleSplashScreen);
  }

  preloadAssets();
  requestAnimationFrame(gameLoop);

})();
