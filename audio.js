"use strict";

/* ============================================================
   HYPHAE — audio engine
   Procedural sound effects + a generative lo-fi soundtrack,
   synthesized live with the Web Audio API. No asset files, no
   network, no dependencies — fits the rest of the project.
   ============================================================ */

const Sound = (function () {
  let ctx = null;
  let master, sfxGain, musicGain, musicFilter;
  let melodyDelay, melodyWet;
  let noiseBuf = null;
  let crackleSrc = null;
  let schedTimer = null;
  let musicRunning = false;

  // --- preferences (kept separate from the game save so a wipe
  //     never silences the player unexpectedly) ---
  let sfxOn = true, musicOn = false, masterVol = 0.6;
  try {
    const p = JSON.parse(localStorage.getItem("hyphae_audio") || "null");
    if (p) {
      sfxOn = p.sfx !== undefined ? p.sfx : true;
      musicOn = p.music !== undefined ? p.music : false;
      masterVol = p.vol !== undefined ? p.vol : 0.6;
    }
  } catch (e) { /* ignore */ }

  function savePrefs() {
    try {
      localStorage.setItem("hyphae_audio",
        JSON.stringify({ sfx: sfxOn, music: musicOn, vol: masterVol }));
    } catch (e) { /* ignore */ }
  }

  /* ---------- graph setup (lazy, on first gesture) ---------- */
  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = masterVol;
    master.connect(ctx.destination);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.9;
    sfxGain.connect(master);

    musicFilter = ctx.createBiquadFilter(); // warm, dampened lo-fi tone
    musicFilter.type = "lowpass";
    musicFilter.frequency.value = 2000;
    musicFilter.Q.value = 0.4;
    musicFilter.connect(master);

    musicGain = ctx.createGain();
    musicGain.gain.value = 0.0;
    musicGain.connect(musicFilter);

    // tape-echo for the melody
    melodyDelay = ctx.createDelay(1.0);
    melodyDelay.delayTime.value = (60 / BPM) * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.33;
    melodyWet = ctx.createGain(); melodyWet.gain.value = 0.5;
    melodyDelay.connect(fb); fb.connect(melodyDelay);
    melodyDelay.connect(melodyWet); melodyWet.connect(musicGain);

    // shared noise buffer for hats / snare
    const n = ctx.sampleRate * 1.0;
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) nd[i] = Math.random() * 2 - 1;

    return ctx;
  }

  function unlock() {
    ensure();
    if (ctx && ctx.state === "suspended") ctx.resume();
  }

  /* ============================================================
     LO-FI SOUNDTRACK — generative, lookahead-scheduled
     ============================================================ */
  const BPM = 74;
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // i – VI – III – VII in A minor (Am7 · Fmaj7 · Cmaj7 · G7),
  // a classic warm lo-fi loop. bass = low root, notes = mid voicing.
  const CHORDS = [
    { bass: 45, notes: [57, 60, 64, 67] }, // Am7
    { bass: 41, notes: [53, 57, 60, 64] }, // Fmaj7
    { bass: 48, notes: [60, 64, 67, 71] }, // Cmaj7
    { bass: 43, notes: [55, 59, 62, 65] }  // G7
  ];
  // A-minor pentatonic, two octaves, for the drifting melody
  const PENT = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79];
  let melodyIdx = 4;

  let current16 = 0, bar = 0, nextStepTime = 0;

  function startMusic() {
    ensure();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    if (!musicRunning) {
      musicRunning = true;
      current16 = 0; bar = 0;
      nextStepTime = ctx.currentTime + 0.15;
      schedTimer = setInterval(scheduler, 25);
      startCrackle();
    }
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setValueAtTime(Math.max(0.0001, musicGain.gain.value), ctx.currentTime);
    musicGain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.6);
  }

  function stopMusic() {
    if (!ctx || !musicRunning) return;
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
    musicGain.gain.linearRampToValueAtTime(0.0, ctx.currentTime + 0.7);
    clearInterval(schedTimer); schedTimer = null;
    if (crackleSrc) { try { crackleSrc.stop(ctx.currentTime + 0.8); } catch (e) {} crackleSrc = null; }
    musicRunning = false;
  }

  function scheduler() {
    if (!ctx) return;
    const secPer16 = (60 / BPM) / 4;
    while (nextStepTime < ctx.currentTime + 0.12) {
      scheduleStep(current16, nextStepTime, secPer16);
      nextStepTime += secPer16;
      if (++current16 >= 16) { current16 = 0; bar++; }
    }
  }

  function scheduleStep(step, t, secPer16) {
    const chord = CHORDS[bar % CHORDS.length];
    const secPerBeat = 60 / BPM;
    const barDur = secPerBeat * 4;

    if (step === 0) {
      padChord(chord, t, barDur);
      bassNote(chord.bass, t, barDur * 0.96);
      scheduleMelody(chord, t);
    }
    if (step === 8) bassNote(chord.bass + 7, t, secPerBeat * 1.4, 0.7);

    // lo-fi drum pattern
    if (step === 0 || step === 10) kick(t);
    else if (step === 6 && Math.random() < 0.45) kick(t);
    if (step === 4 || step === 12) snare(t);
    if (step % 2 === 0) {
      const offbeat = step % 4 === 2;            // swung offbeat 8ths
      const swing = offbeat ? secPer16 * 0.32 : 0;
      hat(t + swing, offbeat && Math.random() < 0.25);
    }
  }

  function padChord(chord, t, dur) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.6);
    g.gain.setValueAtTime(0.16, t + dur - 0.5);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    g.connect(musicGain);
    for (const m of chord.notes) {
      const o1 = ctx.createOscillator();
      o1.type = "triangle"; o1.frequency.value = mtof(m); o1.detune.value = -5;
      const o2 = ctx.createOscillator();
      o2.type = "sine"; o2.frequency.value = mtof(m); o2.detune.value = 6;
      const vg = ctx.createGain(); vg.gain.value = 1 / chord.notes.length;
      o1.connect(vg); o2.connect(vg); vg.connect(g);
      o1.start(t); o2.start(t);
      o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
    }
  }

  function bassNote(midi, t, dur, vol) {
    const o = ctx.createOscillator();
    o.type = "sine"; o.frequency.value = mtof(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3 * (vol || 1), t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function scheduleMelody(chord, t) {
    if (Math.random() < 0.4) return; // breathe — rest some bars
    const secPerBeat = 60 / BPM;
    const slots = [0, 1, 1.5, 2, 3, 3.5];
    for (const b of slots) {
      if (Math.random() < 0.5) continue;
      let idx = melodyIdx + (Math.floor(Math.random() * 3) - 1);
      idx = Math.max(0, Math.min(PENT.length - 1, idx));
      melodyIdx = idx;
      pluck(PENT[idx], t + b * secPerBeat, 0.7 + Math.random() * 0.3);
    }
  }

  function pluck(midi, t, vel) {
    const o = ctx.createOscillator();
    o.type = "triangle"; o.frequency.value = mtof(midi);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 2600;
    const g = ctx.createGain();
    const peak = 0.12 * (vel || 1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0004, t + 0.5);
    o.connect(f); f.connect(g);
    g.connect(musicGain); g.connect(melodyDelay);
    o.start(t); o.stop(t + 0.55);
  }

  function kick(t) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(125, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + 0.24);
  }

  function hat(t, open) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 7500;
    const g = ctx.createGain();
    const dur = open ? 0.12 : 0.03;
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(musicGain);
    src.start(t); src.stop(t + dur + 0.02);
  }

  function snare(t) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1900; f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(f); f.connect(g); g.connect(musicGain);
    src.start(t); src.stop(t + 0.2);
  }

  // soft vinyl crackle + hiss bed
  function startCrackle() {
    const len = Math.floor(ctx.sampleRate * 2.2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.5 : 0) // pops
           + (Math.random() * 2 - 1) * 0.006;                             // hiss
    }
    crackleSrc = ctx.createBufferSource();
    crackleSrc.buffer = buf; crackleSrc.loop = true;
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.value = 0.5;
    crackleSrc.connect(f); f.connect(g); g.connect(musicGain);
    crackleSrc.start();
  }

  /* ============================================================
     SOUND EFFECTS
     ============================================================ */
  function blip(freq, t, type, dur, peak, cutoff) {
    const o = ctx.createOscillator();
    o.type = type || "triangle"; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak || 0.2, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0003, t + (dur || 0.18));
    const f = ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = cutoff || 3000;
    o.connect(f); f.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + (dur || 0.18) + 0.02);
  }

  function digest() {
    if (!sfxOn) return; ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(360 + Math.random() * 80, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0003, t + 0.16);
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 950;
    o.connect(f); f.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + 0.18);
  }

  function buy() {
    if (!sfxOn) return; ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    blip(523.25, t, "triangle", 0.16, 0.18, 2600);
    blip(783.99, t + 0.07, "triangle", 0.2, 0.18, 2800);
  }

  function upgrade() {
    if (!sfxOn) return; ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    blip(659.25, t, "sine", 0.14, 0.16, 3200);
    blip(880.0, t + 0.06, "sine", 0.14, 0.16, 3400);
    blip(1318.5, t + 0.12, "sine", 0.2, 0.14, 3600);
  }

  function unlockChime() {
    if (!sfxOn) return; ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    blip(587.33, t, "triangle", 0.22, 0.14, 2600);
    blip(987.77, t + 0.12, "triangle", 0.3, 0.14, 2800);
  }

  function click() {
    if (!sfxOn) return; ensure(); if (!ctx) return;
    blip(330, ctx.currentTime, "square", 0.05, 0.06, 1200);
  }

  // big shimmering swell for a Fruiting (prestige) event
  function fruit() {
    if (!sfxOn) return; ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    // warm rising chord
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "triangle"; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.4 + i * 0.05);
      g.gain.exponentialRampToValueAtTime(0.0003, t + 2.4);
      o.connect(g); g.connect(sfxGain);
      o.start(t); o.stop(t + 2.5);
    });
    // bell cascade
    const bells = [1046.5, 1318.5, 1567.98, 2093.0, 1567.98, 1318.5];
    bells.forEach((f, i) => blip(f, t + 0.25 + i * 0.14, "sine", 0.5, 0.1, 5000));
    // airy noise sweep
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(6000, t + 1.8);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(0.08, t + 0.6);
    ng.gain.exponentialRampToValueAtTime(0.0003, t + 2.2);
    src.connect(bp); bp.connect(ng); ng.connect(sfxGain);
    src.start(t); src.stop(t + 2.3);
  }

  /* ---------- controls ---------- */
  function setSfx(on) { sfxOn = !!on; savePrefs(); if (sfxOn) { unlock(); click(); } }
  function setMusic(on) {
    musicOn = !!on; savePrefs();
    if (musicOn) startMusic(); else stopMusic();
  }
  function toggleSfx() { setSfx(!sfxOn); return sfxOn; }
  function toggleMusic() { setMusic(!musicOn); return musicOn; }
  function setVolume(v) {
    masterVol = Math.max(0, Math.min(1, v)); savePrefs();
    if (master) master.gain.setTargetAtTime(masterVol, ctx.currentTime, 0.05);
  }

  // Called from a real user gesture: start whatever was enabled.
  function primeFromGesture() {
    unlock();
    if (musicOn) startMusic();
  }

  function getState() { return { sfx: sfxOn, music: musicOn, vol: masterVol }; }

  return {
    unlock, primeFromGesture, getState,
    setSfx, setMusic, toggleSfx, toggleMusic, setVolume,
    digest, buy, upgrade, unlockChime, click, fruit
  };
})();
