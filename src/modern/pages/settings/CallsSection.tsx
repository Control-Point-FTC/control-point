// Settings → Calls & sounds: notification/call sounds, what the camera does
// when you join, and your microphone/speaker/camera devices.
import { useState } from 'react';
import { Switch, ToggleGroup, ToggleGroupItem } from '../../../components/ui-kit';
import { soundsEnabled, setSoundsEnabled } from '../../../utils/sounds';
import { getCameraDefault, setCameraDefault, type CameraDefault } from '../../../components/SettingsModal';
import { DeviceSettingsSection } from '../../../components/voice/DeviceSettingsSection';
import { SettingsGroup, SettingsRow } from './SettingsPage';

export function CallsSection() {
  const [sounds, setSounds] = useState(() => soundsEnabled());
  const [camera, setCamera] = useState<CameraDefault>(() => getCameraDefault());
  return (
    <div>
      <SettingsGroup title="Sounds">
        <SettingsRow label="Notification & call sounds" description="A chime for notifications and a ringtone for incoming calls." htmlFor="settings-sounds">
          <Switch id="settings-sounds" checked={sounds} onCheckedChange={(v) => { setSounds(v); setSoundsEnabled(v); }} />
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup title="Joining calls">
        <SettingsRow label="Camera when you join" description="Your camera never turns on by itself unless you choose Always on.">
          <ToggleGroup type="single" value={camera} onValueChange={(v) => { if (v) { setCamera(v as CameraDefault); setCameraDefault(v as CameraDefault); } }} aria-label="Camera default">
            <ToggleGroupItem value="ask" className="px-3 max-sm:h-10">Ask</ToggleGroupItem>
            <ToggleGroupItem value="on" className="px-3 max-sm:h-10">Always on</ToggleGroupItem>
            <ToggleGroupItem value="off" className="px-3 max-sm:h-10">Always off</ToggleGroupItem>
          </ToggleGroup>
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup title="Devices" description="Microphone, speaker and camera for calls on this device.">
        {/* The device panel (meters, previews) is shared with calls and gets
            its own rebuild with Messages & calls in phase 6. */}
        <div className="p-4"><DeviceSettingsSection /></div>
      </SettingsGroup>
    </div>
  );
}
