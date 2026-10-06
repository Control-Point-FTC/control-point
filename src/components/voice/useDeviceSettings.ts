// Shared device settings (the Classic panel and the Modern Settings rows):
// browser permission state and the explicit "enable" request, the mic test
// (meter only, never played back), the speaker test tone, and the camera
// preview. Hardware is acquired only from a button press and released on
// stop or unmount. Choices persist through the voice context (cp-voice-prefs).
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useVoice,
  getMicStream,
  getCameraStream,
  queryPermission,
  requestDevicePermissions,
  stopStream,
  MediaError,
} from '../../voice';

export type PermState = 'granted' | 'denied' | 'prompt' | 'unknown';

export function useDeviceSettings() {
  const { devices, selectedDevices, setDevice, devicePrefs, setDevicePrefs, self } = useVoice();
  const [micPerm, setMicPerm] = useState<PermState>('unknown');
  const [camPerm, setCamPerm] = useState<PermState>('unknown');
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [testingMic, setTestingMic] = useState(false);
  const [testLevel, setTestLevel] = useState(0);
  const [previewingCam, setPreviewingCam] = useState(false);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const testRef = useRef<{ stream: MediaStream | null; raf: number; ctx: AudioContext | null; analyser: AnalyserNode | null; gain: GainNode | null }>({
    stream: null,
    raf: 0,
    ctx: null,
    analyser: null,
    gain: null,
  });

  // False once the panel is gone: a mic or camera that finishes starting
  // after that is stopped straight away instead of staying on.
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const refreshPerms = useCallback(() => {
    void queryPermission('microphone').then(setMicPerm);
    void queryPermission('camera').then(setCamPerm);
  }, []);

  useEffect(() => {
    refreshPerms();
  }, [refreshPerms]);

  const askPermissions = useCallback(async () => {
    // Explicit user gesture — asks the browser for mic + camera in one prompt.
    setRequesting(true);
    setRequestError('');
    try {
      const { microphone, camera } = await requestDevicePermissions();
      setMicPerm(microphone);
      setCamPerm(camera);
    } catch (err) {
      setRequestError(
        err instanceof MediaError
          ? err.message
          : 'Could not request device access. Check your browser site settings.',
      );
    } finally {
      setRequesting(false);
    }
  }, []);

  const stopMicTest = useCallback(() => {
    const t = testRef.current;
    cancelAnimationFrame(t.raf);
    stopStream(t.stream);
    try {
      t.ctx?.close();
    } catch {
      /* ignore */
    }
    t.stream = null;
    t.ctx = null;
    t.analyser = null;
    t.gain = null;
    setTestingMic(false);
    setTestLevel(0);
  }, []);

  const startMicTest = useCallback(async () => {
    // Explicit user gesture — acquiring the mic here is allowed.
    try {
      const stream = await getMicStream(selectedDevices.micId, devicePrefs);
      if (!alive.current) { stopStream(stream); return; }
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new AC();
      const src = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = devicePrefs.micVolume ?? 1;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(gain);
      gain.connect(analyser); // analysis only — never connected to destination
      testRef.current = { stream, raf: 0, ctx, analyser, gain };
      const buf = new Float32Array(analyser.fftSize);
      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        setTestLevel((prev) => (Math.abs(prev - rms) > 0.02 ? rms : prev));
        testRef.current.raf = requestAnimationFrame(tick);
      };
      tick();
      setTestingMic(true);
    } catch {
      /* getMicStream throws MediaError with a friendly message */
    }
  }, [selectedDevices.micId, devicePrefs]);

  // Live-update the mic test gain when the input volume slider moves mid-test.
  useEffect(() => {
    const g = testRef.current.gain;
    if (g && testingMic) {
      g.gain.setTargetAtTime(devicePrefs.micVolume ?? 1, g.context.currentTime, 0.02);
    }
  }, [devicePrefs.micVolume, testingMic]);

  const startCamPreview = useCallback(async () => {
    try {
      const stream = await getCameraStream(selectedDevices.cameraId, devicePrefs.cameraQuality ?? 'medium');
      if (!alive.current) { stopStream(stream); return; }
      setPreviewStream(stream);
      setPreviewingCam(true);
    } catch {
      /* friendly error already surfaced by MediaError throwers upstream */
    }
  }, [selectedDevices.cameraId, devicePrefs.cameraQuality]);

  const stopCamPreview = useCallback(() => {
    stopStream(previewStream);
    setPreviewStream(null);
    setPreviewingCam(false);
  }, [previewStream]);

  // Release everything if the section unmounts mid-test/preview.
  useEffect(
    () => () => {
      const t = testRef.current;
      cancelAnimationFrame(t.raf);
      stopStream(t.stream);
      try {
        t.ctx?.close();
      } catch {
        /* ignore */
      }
      stopStream(previewStream);
    },
    [previewStream],
  );

  const playTestSound = useCallback(() => {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.15 * (devicePrefs.speakerVolume ?? 1);
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
      osc.onended = () => {
        try {
          ctx.close();
        } catch {
          /* ignore */
        }
      };
    } catch {
      /* WebAudio unavailable */
    }
  }, [devicePrefs.speakerVolume]);

  const micUnsupported = devices.audioinputs.length === 0;
  const speakerUnsupported = devices.audiooutputs.length === 0;

  return {
    devices, selectedDevices, setDevice, devicePrefs, setDevicePrefs, self,
    micPerm, camPerm, requesting, requestError, askPermissions,
    testingMic, testLevel, startMicTest, stopMicTest,
    previewingCam, previewStream, startCamPreview, stopCamPreview,
    playTestSound, micUnsupported, speakerUnsupported,
  };
}
