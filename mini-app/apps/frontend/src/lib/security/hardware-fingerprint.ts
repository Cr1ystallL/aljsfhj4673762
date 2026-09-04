/**
 * Telegram Mini App Hardware Fingerprinting.
 *
 * Runs inside Telegram WebView (iOS WKWebView, Android WebView, Desktop CEF).
 * Generates an immutable, hardware-bound cryptographic fingerprint from
 * GPU parameters, Canvas 2D rasterization, AudioContext DSP buffer,
 * screen resolution, CPU concurrency and TMA platform attributes.
 *
 * Persists even if cookies, session storage, or local storage are cleared,
 * as the underlying hardware parameters remain unchanged on the physical device.
 */

export interface DeviceSpecs {
  gpuVendor: string;
  gpuRenderer: string;
  canvasHash: string;
  audioHash: string;
  screen: string;
  cores: number;
  touch: number;
  platform: string;
  timezone: string;
  language: string;
}

let cachedHardwareHash: string | null = null;
let cachedSpecs: DeviceSpecs | null = null;

function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

async function sha256(message: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    try {
      const msgBuffer = new TextEncoder().encode(message);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback below
    }
  }
  return fnv1a(message) + fnv1a(message.split('').reverse().join(''));
}

/**
 * 2D Canvas Fingerprinting
 */
function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no_canvas';

    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial', sans-serif";
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);

    ctx.fillStyle = '#069';
    ctx.fillText('MacvBet Security 🎰', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('MacvBet Security 🎰', 4, 17);

    return fnv1a(canvas.toDataURL());
  } catch {
    return 'canvas_err';
  }
}

/**
 * WebGL GPU Renderer & Vendor Detection
 */
function getWebGLFingerprint(): { vendor: string; renderer: string } {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl') ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) {
      return { vendor: 'no_webgl', renderer: 'no_webgl' };
    }

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) {
      const vendor = gl.getParameter(gl.VENDOR) || 'generic';
      const renderer = gl.getParameter(gl.RENDERER) || 'generic';
      return { vendor: String(vendor), renderer: String(renderer) };
    }

    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'unknown';
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'unknown';

    return { vendor: String(vendor), renderer: String(renderer) };
  } catch {
    return { vendor: 'webgl_err', renderer: 'webgl_err' };
  }
}

/**
 * AudioContext DSP Fingerprint
 */
async function getAudioFingerprint(): Promise<string> {
  try {
    const AudioCtx =
      window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
        .webkitOfflineAudioContext;
    if (!AudioCtx) return 'no_audio';

    const context = new AudioCtx(1, 44100, 44100);
    const oscillator = context.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(10000, context.currentTime);

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-50, context.currentTime);
    compressor.knee.setValueAtTime(40, context.currentTime);
    compressor.ratio.setValueAtTime(12, context.currentTime);
    compressor.attack.setValueAtTime(0, context.currentTime);
    compressor.release.setValueAtTime(0.25, context.currentTime);

    oscillator.connect(compressor);
    compressor.connect(context.destination);

    oscillator.start(0);
    const buffer = await context.startRendering();

    let sum = 0;
    const channelData = buffer.getChannelData(0);
    for (let i = 4500; i < 5000; i++) {
      sum += Math.abs(channelData[i]);
    }
    return sum.toFixed(6);
  } catch {
    return 'audio_err';
  }
}

/**
 * Get TMA Platform and specifications
 */
export async function getDeviceSpecs(): Promise<DeviceSpecs> {
  if (cachedSpecs) return cachedSpecs;

  const canvasHash = getCanvasFingerprint();
  const webgl = getWebGLFingerprint();
  const audioHash = await getAudioFingerprint();

  const tgPlatform =
    (window as unknown as { Telegram?: { WebApp?: { platform?: string } } })?.Telegram
      ?.WebApp?.platform || '';
  const platform = tgPlatform || navigator.platform || 'unknown';

  const screenStr = `${window.screen?.width || 0}x${window.screen?.height || 0}x${
    window.screen?.colorDepth || 0
  }@${window.devicePixelRatio || 1}`;
  const cores = navigator.hardwareConcurrency || 0;
  const touch = navigator.maxTouchPoints || 0;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const language = navigator.language || '';

  cachedSpecs = {
    gpuVendor: webgl.vendor,
    gpuRenderer: webgl.renderer,
    canvasHash,
    audioHash,
    screen: screenStr,
    cores,
    touch,
    platform,
    timezone,
    language,
  };

  return cachedSpecs;
}

/**
 * Returns deterministic 64-char hardwareHash
 */
export async function getHardwareHash(): Promise<string> {
  if (cachedHardwareHash) return cachedHardwareHash;

  try {
    const stored = localStorage.getItem('macvbet_hw_hash');
    if (stored && stored.length >= 16) {
      cachedHardwareHash = stored;
      void getDeviceSpecs();
      return cachedHardwareHash;
    }
  } catch {}

  const specs = await getDeviceSpecs();
  const rawString = [
    specs.gpuVendor,
    specs.gpuRenderer,
    specs.canvasHash,
    specs.audioHash,
    specs.screen,
    specs.cores,
    specs.touch,
    specs.platform,
    specs.timezone,
  ].join('|');

  const hash = await sha256(rawString);
  cachedHardwareHash = hash;

  try {
    localStorage.setItem('macvbet_hw_hash', hash);
    localStorage.setItem('macvbet_device_specs', JSON.stringify(specs));
  } catch {}

  return hash;
}
