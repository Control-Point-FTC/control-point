// Voice engine public API: types, REST client, media helpers, the WebRTC
// engine, and the React context. Call UI imports from here; nothing else in
// the app needs to reach into the individual modules.

export * from './types';
export { voiceApi, type ModerationAction, type JoinResult, type StartCallResult } from './api';
export {
  enumerateDevices,
  getMicStream,
  getCameraStream,
  getScreenStream,
  queryPermission,
  onDeviceChange,
  stopStream,
  MediaError,
  type MediaErrorCode,
  type DeviceLists,
  type VideoQuality,
} from './media';
export { VoiceEngine, type VoiceSignaling, type VoiceEngineEvents, type VoiceEngineOptions } from './webrtc';
export {
  VoiceProvider,
  useVoice,
  type VoiceContextValue,
  type VoiceProviderProps,
  type SelfState,
  type SelectedDevices,
  type SetDeviceKind,
  type VoiceStatePatch,
} from './VoiceContext';
