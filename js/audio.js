/* ===== Audio Manager ===== */
const AudioManager = (() => {
  let audioCtx = null;
  let bgm = null;
  let retroTimer = null;
  let bgmVolume = 0.5;   // 0~1
  let sfxVolume = 0.5;    // 0~1
  let bgmGainNode = null;
  let sfxGainNode = null;

  function init() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    bgmGainNode = audioCtx.createGain();
    bgmGainNode.gain.value = bgmVolume;
    bgmGainNode.connect(audioCtx.destination);
    sfxGainNode = audioCtx.createGain();
    sfxGainNode.gain.value = sfxVolume;
    sfxGainNode.connect(audioCtx.destination);
  }

  function setBgmVolume(v) {
    bgmVolume = v;
    if (bgm) bgm.volume = v * 0.25; // bgm.mp3 base is loud
    if (bgmGainNode) bgmGainNode.gain.value = v;
  }

  function setSfxVolume(v) {
    sfxVolume = v;
    if (sfxGainNode) sfxGainNode.gain.value = v;
  }

  // --- BGM (screen recording audio) ---
  function startBGM() {
    init();
    if (bgm) return;

    bgm = new Audio('assets/bgm.mp3');
    bgm.loop = true;
    bgm.volume = bgmVolume * 0.25;
    bgm.play().catch(() => {});

    startRetroMusic();
  }

  function stopBGM() {
    if (bgm) {
      bgm.pause();
      bgm.currentTime = 0;
      bgm = null;
    }
    stopRetroMusic();
  }

  // --- Retro chiptune melody (procedural, loops) ---
  // Upbeat 8-bit melody — square wave lead + pulse bass
  const BPM = 170;
  const NOTE_SEC = 60 / BPM / 2;

  // Note frequencies (major scale = bright & happy)
  const N = {
    C4:261.6, D4:293.7, E4:329.6, F4:349.2, Fs4:370.0, G4:392.0, A4:440.0, B4:493.9,
    C5:523.3, D5:587.3, E5:659.3, F5:698.5, Fs5:740.0, G5:784.0, A5:880.0, B5:987.8,
    C6:1046.5,
    C3:130.8, D3:146.8, E3:164.8, F3:174.6, G3:196.0, A3:220.0, B3:246.9,
    C2:65.4, D2:73.4, E2:82.4, F2:87.3, G2:98.0, A2:110.0,
    R:0,
  };

  // Bright bouncy melody — major key, lots of movement
  const melody = [
    // Phrase 1: cheerful ascending
    N.C5, N.R,  N.E5, N.R,  N.G5, N.R,  N.A5, N.G5,
    N.E5, N.R,  N.G5, N.R,  N.C6, N.R,  N.R,  N.R,
    // Phrase 2: playful bounce
    N.A5, N.G5, N.E5, N.R,  N.D5, N.E5, N.G5, N.R,
    N.A5, N.R,  N.G5, N.E5, N.D5, N.R,  N.C5, N.R,
    // Phrase 3: happy skip up
    N.E5, N.R,  N.G5, N.A5, N.G5, N.E5, N.D5, N.R,
    N.C5, N.D5, N.E5, N.R,  N.G5, N.R,  N.R,  N.R,
    // Phrase 4: resolution bounce
    N.A5, N.R,  N.G5, N.R,  N.E5, N.D5, N.C5, N.R,
    N.D5, N.E5, N.G5, N.R,  N.C6, N.R,  N.R,  N.R,
  ];

  // Bouncy bass — root notes pumping
  const bass = [
    N.C3, N.R,  N.C3, N.G3, N.C3, N.R,  N.G3, N.R,
    N.A2, N.R,  N.A2, N.E3, N.A2, N.R,  N.E3, N.R,
    N.F2, N.R,  N.F2, N.C3, N.F2, N.R,  N.C3, N.R,
    N.G2, N.R,  N.G2, N.D3, N.G2, N.R,  N.D3, N.R,
    N.C3, N.R,  N.C3, N.G3, N.C3, N.R,  N.G3, N.R,
    N.A2, N.R,  N.A2, N.E3, N.A2, N.R,  N.E3, N.R,
    N.F2, N.R,  N.F2, N.C3, N.G2, N.R,  N.G2, N.R,
    N.G2, N.R,  N.G2, N.D3, N.C3, N.R,  N.R,  N.R,
  ];

  let retroStep = 0;

  function playRetroNote(freq, type, vol, duration) {
    if (!freq || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime + duration * 0.7);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + duration * 0.95);
    osc.connect(gain);
    gain.connect(bgmGainNode || audioCtx.destination);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + duration);
  }

  function retroTick() {
    const i = retroStep % melody.length;
    playRetroNote(melody[i], 'square', 0.006, NOTE_SEC * 0.8);
    playRetroNote(bass[i], 'square', 0.004, NOTE_SEC * 0.6);
    retroStep++;
  }

  function startRetroMusic() {
    if (retroTimer) return;
    retroStep = 0;
    retroTick();
    retroTimer = setInterval(retroTick, NOTE_SEC * 1000);
  }

  function stopRetroMusic() {
    if (retroTimer) {
      clearInterval(retroTimer);
      retroTimer = null;
    }
    retroStep = 0;
  }

  // --- Hit SFX: Noxian Guillotine style (synthesized) ---
  function playHitSound() {
    init();

    // Layer 1: Deep impact thud
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(80, audioCtx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.15);
    gain1.gain.setValueAtTime(0.6, audioCtx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
    osc1.connect(gain1);
    gain1.connect(sfxGainNode || audioCtx.destination);
    osc1.start(audioCtx.currentTime);
    osc1.stop(audioCtx.currentTime + 0.2);

    // Layer 2: Metal slash (noise burst + filter)
    const bufferSize = audioCtx.sampleRate * 0.08;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = noiseBuffer;

    const bandpass = audioCtx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(3000, audioCtx.currentTime);
    bandpass.Q.value = 1.5;

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.35, audioCtx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);

    noise.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(sfxGainNode || audioCtx.destination);
    noise.start(audioCtx.currentTime);

    // Layer 3: Blade whoosh (descending tone)
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.06);
    gain2.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
    osc2.connect(gain2);
    gain2.connect(sfxGainNode || audioCtx.destination);
    osc2.start(audioCtx.currentTime);
    osc2.stop(audioCtx.currentTime + 0.08);

    // Layer 4: Sub-bass boom (Darius ult weight)
    const osc3 = audioCtx.createOscillator();
    const gain3 = audioCtx.createGain();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(50, audioCtx.currentTime);
    osc3.frequency.exponentialRampToValueAtTime(20, audioCtx.currentTime + 0.25);
    gain3.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gain3.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc3.connect(gain3);
    gain3.connect(sfxGainNode || audioCtx.destination);
    osc3.start(audioCtx.currentTime);
    osc3.stop(audioCtx.currentTime + 0.3);
  }

  // --- Miss SFX ---
  function playMissSound() {
    init();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(sfxGainNode || audioCtx.destination);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.12);
  }

  // --- Countdown beep ---
  function playCountdownBeep(isFinal) {
    init();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = isFinal ? 880 : 440;
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(sfxGainNode || audioCtx.destination);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.15);
  }

  return { init, startBGM, stopBGM, playHitSound, playMissSound, playCountdownBeep, setBgmVolume, setSfxVolume };
})();
