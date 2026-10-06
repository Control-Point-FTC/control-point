// Modern device settings (phase 10d) for Settings → Calls & sounds, over the
// shared useDeviceSettings (same permission request, mic test, test tone and
// camera preview; hardware only while a test or preview is running). Built
// from the Settings page's groups and rows with kit Selects, Sliders and
// Switches; the mic meter is a segmented bar.
import { AnimatePresence, motion } from 'motion/react';
import { Camera, Mic, Play, ShieldCheck, Square, Volume2 } from 'lucide-react';
import { cn } from '../../../components/cn';
import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Slider, Switch } from '../../../components/ui-kit';
import { StreamVideo } from '../../../components/voice/shared';
import { useDeviceSettings, type PermState } from '../../../components/voice/useDeviceSettings';
import type { VideoQuality } from '../../../voice';
import { SettingsGroup, SettingsRow } from './SettingsPage';

// Radix Select can't hold an empty value; this stands for "the system default".
const DEFAULT = '__default';

function Perm({ label, state }: { label: string; state: PermState }) {
  const tone = state === 'granted' ? 'border-success/40 text-success' : state === 'denied' ? 'border-destructive/40 text-destructive' : 'border-amber-500/40 text-amber-500';
  const text = state === 'granted' ? 'Allowed' : state === 'denied' ? 'Blocked' : state === 'prompt' ? 'Not asked yet' : 'Unknown';
  return <span className="inline-flex items-center gap-1.5 text-sm">{label}<Badge variant="outline" className={tone}>{text}</Badge></span>;
}

/** 20 segments that light up with the level (0–~0.5 RMS covers normal speech). */
function Meter({ level }: { level: number }) {
  const lit = Math.min(20, Math.round(level * 60));
  return (
    <div className="flex h-3 flex-1 gap-0.5" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={20} aria-valuenow={lit}>
      {Array.from({ length: 20 }, (_, i) => (
        <span key={i} className={cn('flex-1 rounded-sm transition-colors duration-75', i < lit ? (i > 15 ? 'bg-destructive' : i > 11 ? 'bg-amber-500' : 'bg-success') : 'bg-muted')} />
      ))}
    </div>
  );
}

function DevicePicker({ id, value, onChange, devices, label, fallback, disabled }: {
  id: string; value?: string; onChange: (v: string | undefined) => void; devices: MediaDeviceInfo[]; label: string; fallback: string; disabled?: boolean;
}) {
  return (
    <Select value={value || DEFAULT} onValueChange={(v) => onChange(v === DEFAULT ? undefined : v)} disabled={disabled}>
      <SelectTrigger id={id} className="w-full sm:w-64 max-sm:h-11"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={DEFAULT}>{fallback}</SelectItem>
        {devices.map((d) => <SelectItem key={d.deviceId} value={d.deviceId}>{d.label || `${label} ${d.deviceId.slice(0, 6)}`}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function DeviceSettings() {
  const d = useDeviceSettings();
  const micVol = Math.round((d.devicePrefs.micVolume ?? 1) * 100);
  const spkVol = Math.round((d.devicePrefs.speakerVolume ?? 1) * 100);
  return (
    <>
      <SettingsGroup title="Browser permissions" description="Calls need microphone and camera access. If you skipped or blocked the prompt, ask again here.">
        <SettingsRow label="Access" description={d.micPerm === 'denied' || d.camPerm === 'denied' ? 'Blocked access must be allowed again in your browser’s site settings.' : undefined}>
          <div className="flex flex-wrap items-center gap-3">
            <Perm label="Microphone" state={d.micPerm} />
            <Perm label="Camera" state={d.camPerm} />
            <Button onClick={() => void d.askPermissions()} disabled={d.requesting} className="max-sm:h-11"><ShieldCheck /> {d.requesting ? 'Asking…' : 'Enable microphone & camera'}</Button>
          </div>
        </SettingsRow>
        {d.requestError && <p role="alert" className="px-4 pb-3 text-sm text-destructive">{d.requestError}</p>}
      </SettingsGroup>

      <SettingsGroup title="Microphone">
        <SettingsRow label="Input device" htmlFor="dev-mic" description={d.micUnsupported ? 'No input devices found.' : undefined}>
          <DevicePicker id="dev-mic" value={d.selectedDevices.micId} onChange={(v) => d.setDevice('mic', v)} devices={d.devices.audioinputs} label="Microphone" fallback="Default microphone" />
        </SettingsRow>
        <SettingsRow label="Test" description={d.testingMic ? 'Speak; the meter shows your live input. Nothing is played back.' : d.self.micLevel > 0 ? 'Live level while you’re in a call.' : 'Check your level before a call.'} stack>
          <div className="flex items-center gap-3">
            <Button variant={d.testingMic ? 'destructive' : 'outline'} onClick={() => (d.testingMic ? d.stopMicTest() : void d.startMicTest())} className="shrink-0 max-sm:h-11">
              {d.testingMic ? <><Square /> Stop test</> : <><Mic /> Test microphone</>}
            </Button>
            <Meter level={d.testingMic ? d.testLevel : d.self.micLevel} />
          </div>
        </SettingsRow>
        <SettingsRow label={`Input volume · ${micVol}%`} description="100% is unchanged; go past it to boost a quiet mic (up to 2×)." stack>
          <Slider aria-label="Input volume" min={0} max={200} step={1} value={[micVol]} onValueChange={([n]) => d.setDevicePrefs({ micVolume: n / 100 })} />
        </SettingsRow>
        {([
          ['noiseSuppression', 'Noise suppression', 'Filter background noise.'],
          ['echoCancellation', 'Echo cancellation', 'Stop your speakers feeding back into the mic.'],
          ['autoGainControl', 'Automatic gain control', 'Even out quiet and loud speech.'],
        ] as const).map(([key, label, desc]) => (
          <SettingsRow key={key} label={label} description={desc} htmlFor={`dev-${key}`}>
            <Switch id={`dev-${key}`} checked={!!d.devicePrefs[key]} onCheckedChange={(v) => d.setDevicePrefs({ [key]: v })} />
          </SettingsRow>
        ))}
        <p className="px-4 py-3 text-sm text-muted-foreground">Mic processing applies the next time you join or switch input.</p>
      </SettingsGroup>

      <SettingsGroup title="Speaker">
        <SettingsRow label="Output device" htmlFor="dev-spk" description={d.speakerUnsupported ? 'This browser can’t pick an output, so the system default is used.' : undefined}>
          <DevicePicker id="dev-spk" value={d.selectedDevices.speakerId} onChange={(v) => d.setDevice('speaker', v)} devices={d.devices.audiooutputs} label="Output" fallback="Default output" disabled={d.speakerUnsupported} />
        </SettingsRow>
        <SettingsRow label={`Output volume · ${spkVol}%`} stack>
          <div className="flex items-center gap-3">
            <Volume2 className="size-4 shrink-0 text-muted-foreground" />
            <Slider aria-label="Output volume" min={0} max={100} step={1} value={[spkVol]} onValueChange={([n]) => d.setDevicePrefs({ speakerVolume: n / 100 })} />
            <Button variant="outline" onClick={d.playTestSound} className="shrink-0 max-sm:h-11"><Play /> Test sound</Button>
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Camera">
        <SettingsRow label="Camera" htmlFor="dev-cam" description={d.devices.videoinputs.length === 0 ? 'No cameras found.' : undefined}>
          <DevicePicker id="dev-cam" value={d.selectedDevices.cameraId} onChange={(v) => d.setDevice('camera', v)} devices={d.devices.videoinputs} label="Camera" fallback="Default camera" />
        </SettingsRow>
        <SettingsRow label="Capture quality" htmlFor="dev-quality">
          <Select value={d.devicePrefs.cameraQuality ?? 'medium'} onValueChange={(v) => d.setDevicePrefs({ cameraQuality: v as VideoQuality })}>
            <SelectTrigger id="dev-quality" className="w-full sm:w-48 max-sm:h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low (480p)</SelectItem>
              <SelectItem value="medium">Medium (720p)</SelectItem>
              <SelectItem value="high">High (1080p)</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow label="Preview" description="The camera is only on while the preview is open." stack>
          <Button variant={d.previewingCam ? 'destructive' : 'outline'} onClick={() => (d.previewingCam ? d.stopCamPreview() : void d.startCamPreview())} className="w-fit max-sm:h-11">
            {d.previewingCam ? <><Square /> Stop preview</> : <><Camera /> Preview camera</>}
          </Button>
          <AnimatePresence>
            {d.previewingCam && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-3 overflow-hidden">
                <div className="aspect-video max-w-md overflow-hidden rounded-xl border border-border bg-black">
                  <StreamVideo stream={d.previewStream} muted label="Camera preview" className="h-full w-full" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </SettingsRow>
      </SettingsGroup>
      <p className="-mt-4 mb-8 text-sm text-muted-foreground">These settings are stored on this device only. No audio or video is ever recorded.</p>
    </>
  );
}
