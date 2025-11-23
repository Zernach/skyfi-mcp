import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Mic, RefreshCw, Square, X } from 'react-feather';
import { Button } from '../button/Button';
import { Spinner } from '../spinner/Spinner';
import { WavRecorder, WavStreamPlayer } from '../../lib/wavtools';
import { WavRenderer } from '../../utils/wav_renderer';
import {
  RealtimeClient,
  type SessionConfig,
} from '../../lib/realtime/RealtimeClient';
import { instructions } from '../../constants/prompts';
import type { IMapCoords, MapMarkerDetails } from '../mbox/MBox';
import { COLORS } from '../../constants/colors';
import { TOOL_DEFINITIONS, executeTool, type ToolExecutionContext } from '../../lib/tools/registry';
import './RealtimeVoiceModal.scss';

const CONVERSATION_STARTERS = [
  '✈️ Fly to Florianópolis',
  '🌧️ When was the last rain in Los Angeles?',
  "☀️ What's the weather like in Buenos Aires?",
];

const PROD_BASE_URL = 'https://api.landscapesupply.app';
const VOICE_RELAY_ENDPOINT = `${PROD_BASE_URL}/api/skyfi/relay`;
const DEFAULT_REALTIME_MODEL = 'gpt-realtime-2025-08-28';
const RELAY_SESSION_EXPIRY_BUFFER_MS = 5_000;

type SkyFiRelaySession = {
  clientSecret: string;
  expiresAt: number | null;
  model: string;
  websocketUrl: string;
  session: Record<string, unknown>;
};

type VoiceSessionStatus =
  | 'idle'
  | 'authorizing'
  | 'connecting'
  | 'running'
  | 'error';

interface RealtimeLogEntry {
  time: string;
  source: 'client' | 'server';
  event: { type?: string;[key: string]: unknown };
}

interface RealtimeVoiceModalProps {
  onMarkerUpdate: (update: Partial<MapMarkerDetails>) => void;
  onMapPositionChange: (coords: IMapCoords | null) => void;
  onResetContext: () => void;
  isLargeScreen: boolean;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function normalizeExpirationTimestamp(raw: unknown): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      return null;
    }
    return raw > 1e12 ? Math.floor(raw) : Math.floor(raw * 1000);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed.length) {
      return null;
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric > 1e12 ? Math.floor(numeric) : Math.floor(numeric * 1000);
    }
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
    return null;
  }
  return null;
}

function hasExpirationElapsed(
  expiresAt: number | null,
  bufferMs: number = 0
): boolean {
  if (expiresAt === null) {
    return false;
  }
  return Date.now() >= expiresAt - bufferMs;
}

export function RealtimeVoiceModal({
  onMarkerUpdate,
  onMapPositionChange,
  onResetContext,
  isLargeScreen,
}: RealtimeVoiceModalProps) {
  const [voiceStatus, setVoiceStatus] = useState<VoiceSessionStatus>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeLogEntry[]>([]);
  const [conversationItems, setConversationItems] = useState<any[]>([]);
  const [expandedEventIndex, setExpandedEventIndex] = useState<number | null>(
    null
  );
  const [hasPressedStart, setHasPressedStart] = useState(false);
  const [showStarters, setShowStarters] = useState(true);
  const voiceStatusRef = useRef<VoiceSessionStatus>('idle');
  const clientRef = useRef<RealtimeClient | null>(null);
  const recorderRef = useRef<WavRecorder | null>(null);
  const playerRef = useRef<WavStreamPlayer | null>(null);
  const animationRef = useRef<number>();
  const inputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const handlerRefs = useRef<
    Array<{ event: string; handler: (event: any) => void }>
  >([]);

  const updateVoiceStatus = useCallback((status: VoiceSessionStatus) => {
    voiceStatusRef.current = status;
    setVoiceStatus(status);
  }, []);

  const voiceStatusLabel = useMemo(() => {
    if (!hasPressedStart) {
      return;
    }
    switch (voiceStatus) {
      case 'idle':
        return 'Idle';
      case 'authorizing':
        return 'Authorizing microphone';
      case 'connecting':
        return 'Connecting to Voice Assistant';
      case 'running':
        return 'Live';
      case 'error':
        return 'Needs attention';
      default:
        return voiceStatus;
    }
  }, [voiceStatus]);

  const isSessionActive =
    voiceStatus === 'running' ||
    voiceStatus === 'connecting' ||
    voiceStatus === 'authorizing';

  const clearVisualization = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = undefined;
    }
  }, []);

  const renderWaveform = useCallback(
    (canvas: HTMLCanvasElement, values: Float32Array, color: string) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) {
        return;
      }
      if (canvas.width !== width) {
        canvas.width = width;
      }
      if (canvas.height !== height) {
        canvas.height = height;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      WavRenderer.drawBars(canvas, ctx, values, color, 24, 2, 2, true);
    },
    []
  );

  const startVisualization = useCallback(() => {
    clearVisualization();
    const draw = () => {
      if (voiceStatusRef.current !== 'running') {
        animationRef.current = undefined;
        return;
      }
      try {
        const inputCanvas = inputCanvasRef.current;
        if (inputCanvas && recorderRef.current) {
          const frequencies = recorderRef.current.getFrequencies('voice');
          renderWaveform(inputCanvas, frequencies.values, COLORS.electricBlue);
        }
      } catch (err) {
        if (!recorderRef.current) {
          animationRef.current = undefined;
          return;
        }
      }
      try {
        const outputCanvas = outputCanvasRef.current;
        if (outputCanvas && playerRef.current) {
          const frequencies = playerRef.current.getFrequencies('voice');
          renderWaveform(outputCanvas, frequencies.values, COLORS.successGreen);
        }
      } catch (err) {
        if (!playerRef.current) {
          animationRef.current = undefined;
          return;
        }
      }
      animationRef.current = requestAnimationFrame(draw);
    };
    animationRef.current = requestAnimationFrame(draw);
  }, [clearVisualization, renderWaveform]);

  const clearEventHandlers = useCallback(() => {
    if (!clientRef.current) {
      handlerRefs.current = [];
      return;
    }
    for (const { event, handler } of handlerRefs.current) {
      try {
        clientRef.current.off(event, handler);
      } catch (err) {
        console.warn(`Failed detaching event "${event}"`, err);
      }
    }
    handlerRefs.current = [];
  }, []);

  const teardownVoiceSession = useCallback(
    async ({ resetStatus } = { resetStatus: true }) => {
      clearVisualization();
      clearEventHandlers();
      if (clientRef.current) {
        try {
          clientRef.current.disconnect();
        } catch (err) {
          console.warn('Failed to disconnect realtime client', err);
        }
        clientRef.current = null;
      }
      if (playerRef.current?.context) {
        try {
          await playerRef.current.context.close();
        } catch (err) {
          console.warn('Failed to close audio output context', err);
        }
      }
      playerRef.current = null;
      if (recorderRef.current) {
        try {
          await recorderRef.current.quit();
        } catch (err) {
          console.warn('Failed to stop recorder', err);
        }
        recorderRef.current = null;
      }
      if (resetStatus) {
        setVoiceError(null);
        updateVoiceStatus('idle');
      }
    },
    [clearEventHandlers, clearVisualization, updateVoiceStatus]
  );

  const configureClientTools = useCallback(
    (client: RealtimeClient) => {
      client.clearTools();

      // Create shared execution context for all tools
      const toolContext: ToolExecutionContext = {
        onMarkerUpdate,
        onMapPositionChange,
      };

      // Register all tools from the unified registry
      TOOL_DEFINITIONS.forEach((toolDef) => {
        client.addTool(toolDef, async (args: Record<string, any>) => {
          return executeTool(toolDef.name, args, toolContext);
        });
      });
    },
    [onMarkerUpdate, onMapPositionChange]
  );

  const fetchRelaySession = useCallback(
    async (sessionConfig: Partial<SessionConfig>) => {
      const response = await fetch(VOICE_RELAY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: DEFAULT_REALTIME_MODEL,
          sessionConfig,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Relay request failed (${response.status}): ${errorText}`.trim()
        );
      }
      const session = (await response.json()) as SkyFiRelaySession & {
        expiresAt: unknown;
      };
      const normalizedSession: SkyFiRelaySession = {
        ...session,
        expiresAt: normalizeExpirationTimestamp(session.expiresAt),
      };
      return normalizedSession;
    },
    []
  );

  const stopVoiceSession = useCallback(async () => {
    await teardownVoiceSession();
  }, [teardownVoiceSession]);

  const startVoiceSession = useCallback(async () => {
    if (
      voiceStatusRef.current === 'running' ||
      voiceStatusRef.current === 'connecting' ||
      voiceStatusRef.current === 'authorizing'
    ) {
      return;
    }
    setHasPressedStart(true);
    setVoiceError(null);
    updateVoiceStatus('authorizing');

    const recorder = new WavRecorder({ sampleRate: 24_000 });
    recorderRef.current = recorder;
    try {
      await recorder.begin();
    } catch (err) {
      await teardownVoiceSession({ resetStatus: false });
      setVoiceError(
        err instanceof Error
          ? err.message
          : 'Microphone permission denied. Please allow microphone access.'
      );
      updateVoiceStatus('error');
      return;
    }

    const player = new WavStreamPlayer({ sampleRate: 24_000 });
    playerRef.current = player;
    try {
      await player.connect();
    } catch (err) {
      await teardownVoiceSession({ resetStatus: false });
      setVoiceError(
        err instanceof Error
          ? err.message
          : 'Unable to prepare audio output. Please try again.'
      );
      updateVoiceStatus('error');
      return;
    }

    const sessionConfig: Partial<SessionConfig> = {
      modalities: ['text', 'audio'],
      instructions,
      voice: 'verse',
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
      input_audio_transcription: { model: 'whisper-1' },
      turn_detection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 200,
      },
    };

    let relaySession: SkyFiRelaySession;
    try {
      let candidate: SkyFiRelaySession | null = null;
      const maxAttempts = 2;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const session = await fetchRelaySession(sessionConfig);
        const expired = hasExpirationElapsed(
          session.expiresAt,
          RELAY_SESSION_EXPIRY_BUFFER_MS
        );
        if (!expired) {
          candidate = session;
          break;
        }
      }
      if (!candidate) {
        throw new Error('Voice relay session expired before it could be used.');
      }
      relaySession = candidate;
    } catch (err) {
      await teardownVoiceSession({ resetStatus: false });
      console.error('Failed to authorize voice session', err);
      setVoiceError(
        'Unable to authorize voice session. Please try again later.'
      );
      updateVoiceStatus('error');
      return;
    }

    const clientSecret =
      typeof relaySession.clientSecret === 'string'
        ? relaySession.clientSecret.trim()
        : '';
    const websocketUrl =
      typeof relaySession.websocketUrl === 'string'
        ? relaySession.websocketUrl.trim()
        : '';
    const targetModel =
      typeof relaySession.model === 'string' && relaySession.model.trim().length
        ? relaySession.model.trim()
        : DEFAULT_REALTIME_MODEL;

    if (!clientSecret || !websocketUrl) {
      await teardownVoiceSession({ resetStatus: false });
      console.error('Voice relay returned an invalid session payload');
      setVoiceError(
        'Voice relay returned an invalid session. Please try again later.'
      );
      updateVoiceStatus('error');
      return;
    }

    const client = new RealtimeClient({
      url: websocketUrl,
      apiKey: clientSecret,
      model: targetModel,
    });
    configureClientTools(client);
    clientRef.current = client;

    const registerHandler = (
      eventName: string,
      handler: (event: any) => void
    ) => {
      client.on(eventName, handler);
      handlerRefs.current.push({ event: eventName, handler });
    };

    const audioPlaybackOffsets = new Map<string, number>();

    registerHandler('realtime.event', (event: RealtimeLogEntry) => {
      setRealtimeEvents((prev) => {
        const next = prev.concat(event);
        return next.length > 200 ? next.slice(next.length - 200) : next;
      });
    });

    registerHandler('conversation.updated', ({ item, delta }) => {
      setConversationItems(client.conversation.getItems());
      if (
        !item ||
        item.role !== 'assistant' ||
        !delta ||
        !('audio' in delta) ||
        !(delta.audio instanceof Int16Array) ||
        delta.audio.length === 0
      ) {
        return;
      }
      try {
        player.add16BitPCM(delta.audio, item.id);
        const playedSamples = audioPlaybackOffsets.get(item.id) ?? 0;
        audioPlaybackOffsets.set(item.id, playedSamples + delta.audio.length);
      } catch (err) {
        console.warn('Failed to stream assistant audio delta', err);
      }
    });

    registerHandler('conversation.item.completed', ({ item }) => {
      if (
        !item ||
        item.role !== 'assistant' ||
        !item.formatted ||
        !(item.formatted.audio instanceof Int16Array) ||
        item.formatted.audio.length === 0
      ) {
        return;
      }
      const playedSamples = audioPlaybackOffsets.get(item.id) ?? 0;
      if (playedSamples >= item.formatted.audio.length) {
        return;
      }
      try {
        const remaining = item.formatted.audio.slice(playedSamples);
        if (remaining.length > 0) {
          player.add16BitPCM(remaining, item.id);
          audioPlaybackOffsets.set(item.id, playedSamples + remaining.length);
        }
      } catch (err) {
        console.warn('Failed to stream remaining assistant audio', err);
      }
    });

    registerHandler('conversation.interrupted', () => {
      Promise.resolve(player.interrupt()).catch((err: unknown) =>
        console.warn('Failed to interrupt playback', err)
      );
    });

    client.updateSession(sessionConfig);

    updateVoiceStatus('connecting');
    try {
      await client.connect();
      await client.waitForSessionCreated();
    } catch (err) {
      await teardownVoiceSession({ resetStatus: false });
      setVoiceError(
        err instanceof Error
          ? err.message
          : 'Failed to connect to the voice relay.'
      );
      updateVoiceStatus('error');
      return;
    }

    setConversationItems(client.conversation.getItems());
    setRealtimeEvents([]);

    try {
      await recorder.record((chunk) => {
        if (!clientRef.current?.isConnected()) {
          return;
        }
        try {
          const mono = new Int16Array(chunk.mono);
          clientRef.current.appendInputAudio(mono);
        } catch (err) {
          console.warn('Failed to forward audio chunk', err);
        }
      }, 4800);
    } catch (err) {
      await teardownVoiceSession({ resetStatus: false });
      setVoiceError(
        err instanceof Error
          ? err.message
          : 'Unable to start microphone stream. Please try again.'
      );
      updateVoiceStatus('error');
      return;
    }

    updateVoiceStatus('running');
    startVisualization();
  }, [
    configureClientTools,
    fetchRelaySession,
    startVisualization,
    teardownVoiceSession,
    updateVoiceStatus,
  ]);

  const resetConversation = useCallback(() => {
    clientRef.current?.conversation.clear();
    setConversationItems([]);
    setRealtimeEvents([]);
    onResetContext();
  }, [onResetContext]);

  useEffect(() => {
    return () => {
      teardownVoiceSession({ resetStatus: false }).catch((err) =>
        console.warn('Error during voice session teardown', err)
      );
    };
  }, [teardownVoiceSession]);

  useEffect(() => {
    if (
      expandedEventIndex !== null &&
      expandedEventIndex >= realtimeEvents.length
    ) {
      setExpandedEventIndex(null);
    }
  }, [expandedEventIndex, realtimeEvents.length]);

  const shouldShowTopVoiceModal = Boolean(isSessionActive && voiceStatusLabel);

  const topVoiceModal = shouldShowTopVoiceModal ? (
    <div className="top-voice-data-modal" data-component="TopVoiceDataModal">
      <div className="top-voice-data-modal__header">
        <div className="top-voice-data-modal__status" aria-live="polite">
          {voiceStatus === 'running' ? (
            <span
              className="top-voice-data-modal__status-dot"
              aria-hidden="true"
            />
          ) : (
            <Spinner size={14} />
          )}
          <span>{voiceStatusLabel}</span>
        </div>
        <span className="top-voice-data-modal__hint">
          {voiceStatus === 'running' ? null : 'Connecting…'}
        </span>
      </div>
      {voiceStatus === 'running' ? (
        <div className="realtime-voice-modal__visualization">
          <div className="realtime-voice-modal__visualization-entry realtime-voice-modal__visualization-entry--client">
            <span>Mic</span>
            <canvas ref={inputCanvasRef} />
          </div>
          <div className="realtime-voice-modal__visualization-entry realtime-voice-modal__visualization-entry--server">
            <span>AI</span>
            <canvas ref={outputCanvasRef} />
          </div>
        </div>
      ) : (
        <div className="top-voice-data-modal__message">
          <Spinner size={18} />
          <span>Preparing your voice session…</span>
        </div>
      )}
    </div>
  ) : null;

  const bottomVoiceModal = (
    <div className="realtime-voice-modal" data-component="RealtimeVoiceModal">
      <div className="realtime-voice-modal__header">
        <div className="realtime-voice-modal__status">
          <span className="realtime-voice-modal__title">Voice Assistant</span>
        </div>
        <div className="realtime-voice-modal__controls">
          {voiceStatus === 'running' ? (
            <Button
              icon={Square}
              label="Stop"
              buttonStyle="alert"
              disabled={voiceStatus !== 'running'}
              onClick={stopVoiceSession}
            />
          ) : (
            <div className="realtime-voice-modal__start-wrapper">
              {!hasPressedStart && !isSessionActive && (
                <div
                  className="realtime-voice-modal__start-arrow"
                  aria-hidden="true"
                >
                  <span className="realtime-voice-modal__start-arrow-icon">
                    →
                  </span>
                </div>
              )}
              <Button
                icon={Mic}
                label={isSessionActive ? 'Starting…' : 'START'}
                className="realtime-voice-modal__start-button"
                disabled={isSessionActive}
                onClick={startVoiceSession}
              />
            </div>
          )}
          {(isSessionActive ||
            !!realtimeEvents.length ||
            !!conversationItems.length) && (
              <Button
                icon={RefreshCw}
                label="Reset"
                iconColor={'white'}
                textStyle={{ color: COLORS.white }}
                buttonStyle="flush"
                disabled={!conversationItems.length && !realtimeEvents.length}
                onClick={resetConversation}
              />
            )}
        </div>
      </div>
      {voiceError && (
        <div className="realtime-voice-modal__error">
          <AlertTriangle size={16} />
          <span>{voiceError}</span>
        </div>
      )}
      {isLargeScreen && showStarters && (
        <div
          className="realtime-voice-modal__starters"
          aria-live="polite"
          data-testid="conversation-starters"
        >
          <div className="realtime-voice-modal__starters-header">
            <span className="realtime-voice-modal__starters-title">
              Try saying...
            </span>
            <button
              className="realtime-voice-modal__starters-close"
              onClick={() => setShowStarters(false)}
              aria-label="Close suggestions"
              type="button"
            >
              <X size={14} />
            </button>
          </div>
          <ul className="realtime-voice-modal__starters-list">
            {CONVERSATION_STARTERS.map((starter) => (
              <p key={starter}>{starter}</p>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={`realtime-voice-modal-stack${shouldShowTopVoiceModal ? ' realtime-voice-modal-stack--active' : ''
        }`}
      data-component="RealtimeVoiceModalStack"
    >
      {topVoiceModal}
      {bottomVoiceModal}
    </div>
  );
}

