// DeviceSettingsSection — microphone / speaker / camera preferences,
// embedded in the main Settings overlay (no separate modal).
// Reads and writes the persisted prefs through the voice context
// (cp-voice-prefs, same store the engine reads at join time).
// Mic test, camera preview, and the permission request button acquire
// hardware only from explicit button clicks and release it immediately.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Mic, ShieldCheck, TriangleAlert, Video, Volume2 } from 'lucide-react';
import { cn } from '../ui';
import {
  useVoice,
  getMicStream,
  getCameraStream,
  queryPermission,
  requestDevicePermissions,
  stopStream,
  MediaError,
  type VideoQuality,
} from '../../voice';
import { MicLevelMeter, StreamVideo } from './shared';

function SubSection({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-accent" aria-hidden="true" />
        <h3 className="text-sm font-bold text-text-base">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-semibold text-text-muted uppercase tracking-wider">
      {children}
    </label>
  );
}

const selectCls =
  'w-full bg-primary border border-text-base/10 rounded-xl px-3 py-2 text-sm text-text-base focus:outline-none focus:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent';

function Toggle({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
    >
      <span>
        <span className="block text-sm font-semibold text-text-base">{label}</span>
        {desc && <span className="block text-xs text-text-muted">{desc}</span>}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'relative w-10 h-6 rounded-full transition-colors flex-shrink-0',
          checked ? 'bg-accent' : 'bg-text-base/15',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all',
            checked ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  );
}

function permBadge(state: 'granted' | 'denied' | 'prompt' | 'unknown') {
  return (
    <span
      className={cn(
        'font-semibold',
        state === 'granted' ? 'text-emerald-400' : state === 'denied' ? 'text-rose-400' : 'text-amber-300',
      )}
    >
      {state}
    </span>
  );
}

export function DeviceSettingsSection() {
  const { devices, selectedDevices, setDevice, devicePrefs, setDevicePrefs, self } = useVoice();
  const [micPerm, setMicPerm] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');
  const [camPerm, setCamPerm] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [testingMic, setTestingMic] = useState(false);
  const [testLevel, setTestLevel] = useState(0);
  const [previewingCam, setPreviewingCam] = useState(false);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const testRef = useRef<{ stream: MediaStream | null; raf: number; ctx: AudioContext | null; analyser: AnalyserNode | null }>({
    stream: null,
    raf: 0,
    ctx: null,
    analyser: null,
  });

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
    setTestingMic(false);
    setTestLevel(0);
  }, []);

  const startMicTest = useCallback(async () => {
    // Explicit user gesture — acquiring the mic here is allowed.
    try {
      const stream = await getMicStream(selectedDevices.micId, devicePrefs);
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new AC();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser); // analysis only — never connected to destination
      testRef.current = { stream, raf: 0, ctx, analyser };
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

  const startCamPreview = useCallback(async () => {
    try {
      const stream = await getCameraStream(selectedDevices.cameraId, devicePrefs.cameraQuality ?? 'medium');
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

  return (
    <div className="space-y-6">
      {/* ------------------------------------------- browser permissions */}
      <SubSection icon={ShieldCheck} title="Browser permissions">
        <p className="text-xs text-text-muted">
          Calls need microphone and camera access from your browser. If you skipped the prompt or blocked it,
          request it again here — then allow it in the browser prompt.
        </p>
        <div className="flex items-center gap-4 text-xs text-text-muted">
          <span>
            Microphone: {permBadge(micPerm)}
            {micPerm === 'denied' && ' — allow it in your browser site settings.'}
          </span>
          <span>
            Camera: {permBadge(camPerm)}
            {camPerm === 'denied' && ' — allow it in your browser site settings.'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void askPermissions()}
          disabled={requesting}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-accent text-accent-ink hover:brightness-105 transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ShieldCheck className="w-4 h-4" aria-hidden="true" />
          {requesting ? 'Requesting…' : 'Enable microphone & camera'}
        </button>
        {requestError && <p className="text-xs text-rose-400">{requestError}</p>}
      </SubSection>

      {/* ------------------------------------------------ microphone */}
      <SubSection icon={Mic} title="Microphone">
        <div className="space-y-1.5">
          <Label htmlFor="voice-mic-select">Input device</Label>
          <select
            id="voice-mic-select"
            className={selectCls}
            value={selectedDevices.micId ?? ''}
            onChange={(e) => setDevice('mic', e.target.value || undefined)}
            aria-describedby="voice-mic-perm"
          >
            <option value="">Default microphone</option>
            {devices.audioinputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
              </option>
            ))}
          </select>
          {micUnsupported && <p id="voice-mic-perm" className="text-xs text-text-muted">No input devices found.</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Mic test</Label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={testingMic ? stopMicTest : startMicTest}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                testingMic ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30' : 'bg-text-base/[0.08] text-text-base hover:bg-text-base/[0.12]',
              )}
            >
              {testingMic ? 'Stop test' : 'Test microphone'}
            </button>
            <MicLevelMeter level={testingMic ? testLevel : self.micLevel} className="flex-1" />
          </div>
          <p className="text-xs text-text-muted">
            {testingMic ? 'Speak — the meter shows your live input.' : self.micLevel > 0 ? 'Live level while you are in a call.' : 'The meter moves with your live input.'}
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="voice-mic-volume">Input volume</Label>
            <span className="text-xs font-semibold text-text-muted tabular-nums">
              {Math.round((devicePrefs.micVolume ?? 1) * 100)}%
            </span>
          </div>
          <input
            id="voice-mic-volume"
            type="range"
            min={0}
            max={200}
            value={Math.round((devicePrefs.micVolume ?? 1) * 100)}
            onChange={(e) => setDevicePrefs({ micVolume: Number(e.target.value) / 100 })}
            className="w-full accent-[#FFC700]"
            aria-valuetext={`${Math.round((devicePrefs.micVolume ?? 1) * 100)} percent`}
          />
          <p className="text-xs text-text-muted">100% is unity — push past it to boost a quiet mic, up to 2x.</p>
        </div>

        <div className="divide-y divide-text-base/[0.06]">
          <Toggle
            label="Noise suppression"
            desc="Filter background noise (Krisp-style)"
            checked={devicePrefs.noiseSuppression}
            onChange={(v) => setDevicePrefs({ noiseSuppression: v })}
          />
          <Toggle
            label="Echo cancellation"
            desc="Prevent your speakers feeding back into the mic"
            checked={devicePrefs.echoCancellation}
            onChange={(v) => setDevicePrefs({ echoCancellation: v })}
          />
          <Toggle
            label="Automatic gain control"
            desc="Even out quiet and loud speech"
            checked={devicePrefs.autoGainControl}
            onChange={(v) => setDevicePrefs({ autoGainControl: v })}
          />
        </div>
        <p className="text-xs text-text-muted">Mic processing applies the next time you join or switch input.</p>
      </SubSection>

      {/* ---------------------------------------------------- speaker */}
      <SubSection icon={Volume2} title="Speaker">
        <div className="space-y-1.5">
          <Label htmlFor="voice-speaker-select">Output device</Label>
          <select
            id="voice-speaker-select"
            className={selectCls}
            value={selectedDevices.speakerId ?? ''}
            onChange={(e) => setDevice('speaker', e.target.value || undefined)}
            disabled={speakerUnsupported}
          >
            <option value="">Default output</option>
            {devices.audiooutputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Output ${d.deviceId.slice(0, 6)}`}
              </option>
            ))}
          </select>
          {speakerUnsupported && (
            <p className="text-xs text-text-muted">
              Output device selection is not supported in this browser — the system default is used.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="voice-speaker-volume">Output volume</Label>
            <span className="text-xs font-semibold text-text-muted tabular-nums">
              {Math.round((devicePrefs.speakerVolume ?? 1) * 100)}%
            </span>
          </div>
          <input
            id="voice-speaker-volume"
            type="range"
            min={0}
            max={100}
            value={Math.round((devicePrefs.speakerVolume ?? 1) * 100)}
            onChange={(e) => setDevicePrefs({ speakerVolume: Number(e.target.value) / 100 })}
            className="w-full accent-[#FFC700]"
            aria-valuetext={`${Math.round((devicePrefs.speakerVolume ?? 1) * 100)} percent`}
          />
        </div>
        <button
          type="button"
          onClick={playTestSound}
          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-text-base/[0.08] text-text-base hover:bg-text-base/[0.12] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Play test sound
        </button>
      </SubSection>

      {/* ----------------------------------------------------- camera */}
      <SubSection icon={Camera} title="Camera">
        <div className="space-y-1.5">
          <Label htmlFor="voice-cam-select">Camera</Label>
          <select
            id="voice-cam-select"
            className={selectCls}
            value={selectedDevices.cameraId ?? ''}
            onChange={(e) => setDevice('camera', e.target.value || undefined)}
          >
            <option value="">Default camera</option>
            {devices.videoinputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
              </option>
            ))}
          </select>
          {devices.videoinputs.length === 0 && <p className="text-xs text-text-muted">No cameras found.</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="voice-cam-quality">Capture quality</Label>
          <select
            id="voice-cam-quality"
            className={selectCls}
            value={devicePrefs.cameraQuality ?? 'medium'}
            onChange={(e) => setDevicePrefs({ cameraQuality: e.target.value as VideoQuality })}
          >
            <option value="low">Low (480p)</option>
            <option value="medium">Medium (720p)</option>
            <option value="high">High (1080p)</option>
          </select>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={previewingCam ? stopCamPreview : startCamPreview}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                previewingCam ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30' : 'bg-text-base/[0.08] text-text-base hover:bg-text-base/[0.12]',
              )}
            >
              {previewingCam ? 'Stop preview' : 'Preview camera'}
            </button>
          </div>
          {previewingCam && (
            <div className="rounded-xl overflow-hidden bg-primary border border-text-base/10 aspect-video">
              <StreamVideo stream={previewStream} muted label="Camera preview" className="w-full h-full" />
            </div>
          )}
          {!previewingCam && (
            <p className="text-xs text-text-muted flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5" aria-hidden="true" />
              Preview acquires the camera only while open.
            </p>
          )}
        </div>
      </SubSection>

      <p className="text-xs text-text-muted flex items-start gap-1.5">
        <TriangleAlert className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-400" aria-hidden="true" />
        Settings are stored on this device only. No audio or video is ever recorded.
      </p>
    </div>
  );
}

export default DeviceSettingsSection;
