export let audioCtx: AudioContext | null = null;
let isMuted = false;

export const initAudio = () => {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
};

export const toggleMute = () => {
  isMuted = !isMuted;
  return isMuted;
};

export const getIsMuted = () => isMuted;

const playTone = (freq: number, type: OscillatorType, duration: number, startTimeOffset: number = 0, volume: number = 0.1) => {
  if (isMuted || !audioCtx) return;
  
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime + startTimeOffset);
    
    gain.gain.setValueAtTime(volume, audioCtx.currentTime + startTimeOffset);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + startTimeOffset + duration);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(audioCtx.currentTime + startTimeOffset);
    osc.stop(audioCtx.currentTime + startTimeOffset + duration);
  } catch (e) {
    console.error("Audio play error", e);
  }
};

export const playCorrect = () => {
  playTone(523.25, 'sine', 0.1, 0, 0.1); // C5
  playTone(659.25, 'sine', 0.1, 0.1, 0.1); // E5
  playTone(783.99, 'sine', 0.2, 0.2, 0.1); // G5
  playTone(1046.50, 'sine', 0.4, 0.3, 0.15); // C6
};

export const playIncorrect = () => {
  playTone(150, 'sawtooth', 0.3, 0, 0.1);
  playTone(100, 'sawtooth', 0.4, 0.2, 0.15);
};

export const playTimeout = () => {
  playTone(300, 'triangle', 0.2, 0, 0.1);
  playTone(250, 'triangle', 0.2, 0.2, 0.1);
  playTone(200, 'triangle', 0.4, 0.4, 0.1);
};

export const playClick = () => {
  playTone(800, 'sine', 0.05, 0, 0.05);
};

export const playGameOver = () => {
  playTone(523.25, 'square', 0.2, 0, 0.05);
  playTone(523.25, 'square', 0.2, 0.2, 0.05);
  playTone(523.25, 'square', 0.2, 0.4, 0.05);
  playTone(659.25, 'square', 0.6, 0.6, 0.08);
};
