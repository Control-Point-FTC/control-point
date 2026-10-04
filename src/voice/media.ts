// Media device enumeration + stream acquisition for voice calls.
//
// Rule: mic/camera/screen are NEVER acquired except in direct response to an
// explicit user action — joining with audio/video, toggling the camera on, or
// starting a screen share. enumerateDevices() alone never triggers a
// permission prompt; labels stay empty until the user grants permission once.

import type { DevicePrefs } from './types';
import { loadDevicePrefs } from './types';

export type MediaErrorCode = 'denied' | 'not-found' | 'not-supported' | 'in-use' | 'unknown';

export class MediaError extends Error {
  code: MediaErrorCode;
  constructor(code: MediaErrorCode, message: string) {
    super(message);
    this.name = 'MediaError';
    this.code = code;
  }
}

export interface DeviceLists {
  audioinputs: MediaDeviceInfo[];
  videoinputs: MediaDeviceInfo[];
  audiooutputs: MediaDeviceInfo[];
}

function hasMediaDevices(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

function toMediaError(err: any): MediaError {
  const name = err?.name as string | undefined;
  if (err instanceof MediaError) return err;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new MediaError('denied', 'Permission denied — allow microphone/camera access to join the call.');
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new MediaError(
        'not-found',
        'No microphone or camera found. If you have them, check your OS privacy settings (Windows: Settings → Privacy → Microphone / Camera) and make sure no other app is using them.',
      );
    case 'NotReadableError':
    case 'AbortError':
      return new MediaError('in-use', 'The device is already in use by another app.');
    default:
      return new MediaError('unknown', err?.message || 'Could not access media devices.');
  }
}

/** List devices. Labels are empty until the user has granted permission once — that's a browser rule, not a bug. */
export async function enumerateDevices(): Promise<DeviceLists> {
  if (!hasMediaDevices()) {
    return { audioinputs: [], videoinputs: [], audiooutputs: [] };
  }
  const all = await navigator.mediaDevices.enumerateDevices();
  return {
    audioinputs: all.filter((d) => d.kind === 'audioinput'),
    videoinputs: all.filter((d) => d.kind === 'videoinput'),
    audiooutputs: all.filter((d) => d.kind === 'audiooutput'),
  };
}

/** Call this only from a user gesture (join / toggle camera on). */
export async function getMicStream(deviceId: string | undefined, prefs: DevicePrefs): Promise<MediaStream> {
  if (!hasMediaDevices()) throw new MediaError('not-supported', 'Audio capture is not supported in this browser.');
  const audio: MediaTrackConstraints = {
    echoCancellation: prefs.echoCancellation,
    noiseSuppression: prefs.noiseSuppression,
    autoGainControl: prefs.autoGainControl,
  };
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { ...audio, deviceId: { exact: deviceId } } : audio,
      video: false,
    });
  } catch (err: any) {
    // The saved device may be gone (unplugged, or prefs synced from another
    // machine) — an exact deviceId then fails even though a mic exists.
    // Retry with the default device before giving up.
    if (deviceId && (err?.name === 'OverconstrainedError' || err?.name === 'NotFoundError')) {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio, video: false });
      } catch (retryErr) {
        throw toMediaError(retryErr);
      }
    }
    throw toMediaError(err);
  }
}

export type VideoQuality = 'low' | 'medium' | 'high';

const VIDEO_CONSTRAINTS: Record<VideoQuality, MediaTrackConstraints> = {
  low: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15 }, facingMode: 'user' },
  medium: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 }, facingMode: 'user' },
  high: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 }, facingMode: 'user' },
};

/** Call this only from a user gesture (join with video / toggle camera on). */
export async function getCameraStream(
  deviceId: string | undefined,
  quality: VideoQuality = 'medium',
): Promise<MediaStream> {
  if (!hasMediaDevices()) throw new MediaError('not-supported', 'Camera capture is not supported in this browser.');
  const video: MediaTrackConstraints = { ...VIDEO_CONSTRAINTS[quality] };
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: deviceId ? { ...video, deviceId: { exact: deviceId } } : video,
    });
  } catch (err: any) {
    // Same stale-device fallback as getMicStream: retry with the default
    // camera when the saved deviceId no longer resolves.
    if (deviceId && (err?.name === 'OverconstrainedError' || err?.name === 'NotFoundError')) {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: false, video });
      } catch (retryErr) {
        throw toMediaError(retryErr);
      }
    }
    throw toMediaError(err);
  }
}

/** Call this only from a user gesture (start screen share). */
export async function getScreenStream(): Promise<MediaStream> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getDisplayMedia !== 'function'
  ) {
    throw new MediaError('not-supported', 'Screen sharing is not supported in this browser.');
  }
  try {
    return await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (err: any) {
    if (err?.name === 'NotAllowedError') {
      throw new MediaError('denied', 'Screen share was cancelled.');
    }
    throw toMediaError(err);
  }
}

/** 'granted' | 'denied' | 'prompt' — query without triggering a prompt. */
export async function queryPermission(kind: 'microphone' | 'camera'): Promise<PermissionState | 'unknown'> {
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown';
    const res = await navigator.permissions.query({ name: kind as PermissionName });
    return res.state;
  } catch {
    return 'unknown';
  }
}

/**
 * Explicitly ask the browser for microphone AND camera access in one gesture.
 * Call this only from a user gesture (e.g. an "Enable devices" button). The
 * acquired tracks are stopped immediately — this is purely to trigger the
 * browser's permission prompt ahead of a call. Throws MediaError on denial.
 */
export async function requestDevicePermissions(): Promise<{ microphone: PermissionState | 'unknown'; camera: PermissionState | 'unknown' }> {
  if (!hasMediaDevices()) throw new MediaError('not-supported', 'Media capture is not supported in this browser.');
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  } catch (err) {
    // A combined request fails if EITHER device is unavailable, which used to
    // surface as "no microphone or camera found" even when one of them works.
    // Diagnose each device separately so the message names the real problem.
    // The probes use the same constraints as the real mic/camera paths — a
    // bare { audio: true } can fail on drivers that need the full constraint
    // set, which would report a working mic as missing.
    stopStream(stream);
    const prefs = loadDevicePrefs();
    const micErr = await probeDevice({
      audio: {
        echoCancellation: prefs.echoCancellation,
        noiseSuppression: prefs.noiseSuppression,
        autoGainControl: prefs.autoGainControl,
      },
      video: false,
    });
    const camErr = await probeDevice({
      audio: false,
      video: { ...VIDEO_CONSTRAINTS[prefs.cameraQuality ?? 'medium'] },
    });
    if (!micErr && !camErr) throw toMediaError(err); // transient — report the original
    if (micErr && camErr) throw toMediaError(micErr);
    throw new MediaError(
      'not-found',
      micErr
        ? 'Microphone is ready, but no camera was found. Check Windows Settings → Privacy → Camera, and make sure no other app is using it.'
        : 'Camera is ready, but no microphone was found. Check Windows Settings → Privacy → Microphone, and make sure no other app is using it.',
    );
  } finally {
    stopStream(stream);
  }
  const [microphone, camera] = await Promise.all([queryPermission('microphone'), queryPermission('camera')]);
  return { microphone, camera };
}

/** Try to acquire (then immediately release) a device set. Returns null on success, the MediaError on failure. */
async function probeDevice(constraints: MediaStreamConstraints): Promise<MediaError | null> {
  let s: MediaStream | null = null;
  try {
    s = await navigator.mediaDevices.getUserMedia(constraints);
    return null;
  } catch (err) {
    return toMediaError(err);
  } finally {
    stopStream(s);
  }
}

/**
 * Attach a `devicechange` listener (hot-plug of headsets etc.). Returns an
 * unsubscribe function. The callback should re-run enumerateDevices().
 */
export function onDeviceChange(cb: () => void): () => void {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.addEventListener !== 'function'
  ) {
    return () => {};
  }
  navigator.mediaDevices.addEventListener('devicechange', cb);
  return () => {
    try {
      navigator.mediaDevices.removeEventListener('devicechange', cb);
    } catch {
      /* ignore */
    }
  };
}

/** Stop every track in a stream and release the hardware. Safe on null/undefined. */
export function stopStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  }
}
