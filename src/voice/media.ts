// Media device enumeration + stream acquisition for voice calls.
//
// Rule: mic/camera/screen are NEVER acquired except in direct response to an
// explicit user action — joining with audio/video, toggling the camera on, or
// starting a screen share. enumerateDevices() alone never triggers a
// permission prompt; labels stay empty until the user grants permission once.

import type { DevicePrefs } from './types';

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
      return new MediaError('not-found', 'No microphone or camera found on this device.');
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
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        echoCancellation: prefs.echoCancellation,
        noiseSuppression: prefs.noiseSuppression,
        autoGainControl: prefs.autoGainControl,
      },
      video: false,
    });
  } catch (err) {
    throw toMediaError(err);
  }
}

export type VideoQuality = 'low' | 'medium' | 'high';

const VIDEO_CONSTRAINTS: Record<VideoQuality, MediaTrackConstraints> = {
  low: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15 } },
  medium: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 } },
  high: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
};

/** Call this only from a user gesture (join with video / toggle camera on). */
export async function getCameraStream(
  deviceId: string | undefined,
  quality: VideoQuality = 'medium',
): Promise<MediaStream> {
  if (!hasMediaDevices()) throw new MediaError('not-supported', 'Camera capture is not supported in this browser.');
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), ...VIDEO_CONSTRAINTS[quality] },
    });
  } catch (err) {
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
