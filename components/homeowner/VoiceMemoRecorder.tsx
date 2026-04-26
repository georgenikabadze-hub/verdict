"use client";

import { Mic, Square, Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// VoiceMemoRecorder — homeowner-side voice intake.
//
// Captures mic audio via the Web Audio API at 24 kHz mono int16 PCM (the
// format Gradium's STT WebSocket expects), POSTs the raw bytes to
// /api/voice-transcribe, and bubbles up { audioDataUrl, transcript } so the
// parent <IntakePanel /> can attach the memo to the lead before submit.
//
// Why PCM and not MediaRecorder/WebM: Gradium STT setup uses
// `input_format: "pcm"` and the SDK code shows it expects raw int16 LE bytes.
// Decoding WebM/Opus on the server is heavyweight; capturing PCM directly
// in the browser via an AudioWorklet is small + dependency-free.
// ---------------------------------------------------------------------------

const SAMPLE_RATE = 24_000;

export interface VoiceMemo {
  audioDataUrl: string;
  transcript?: string;
  durationMs: number;
}

interface Props {
  value: VoiceMemo | null;
  onChange: (memo: VoiceMemo | null) => void;
  className?: string;
}

type Status = "idle" | "recording" | "transcribing" | "error";

export function VoiceMemoRecorder({ value, onChange, className = "" }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const pcmChunksRef = useRef<Int16Array[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopAll = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    pcmChunksRef.current = [];
    setStatus("recording");
    startedAtRef.current = performance.now();
    setElapsedMs(0);
    tickRef.current = window.setInterval(() => {
      setElapsedMs(performance.now() - startedAtRef.current);
    }, 100);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: SAMPLE_RATE, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx: any =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).AudioContext ?? (window as any).webkitAudioContext;
      const ctx: AudioContext = new Ctx({ sampleRate: SAMPLE_RATE });
      audioCtxRef.current = ctx;

      // Inline AudioWorklet processor — receives Float32 audio, downconverts
      // to Int16, and posts back to the main thread. Loaded via blob URL so
      // we don't need a separate static file in /public.
      const workletSrc = `
        class PCMRecorder extends AudioWorkletProcessor {
          process(inputs) {
            const ch = inputs[0]?.[0];
            if (!ch) return true;
            const out = new Int16Array(ch.length);
            for (let i = 0; i < ch.length; i++) {
              const s = Math.max(-1, Math.min(1, ch[i]));
              out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            this.port.postMessage(out, [out.buffer]);
            return true;
          }
        }
        registerProcessor("pcm-recorder", PCMRecorder);
      `;
      const blobUrl = URL.createObjectURL(new Blob([workletSrc], { type: "application/javascript" }));
      await ctx.audioWorklet.addModule(blobUrl);
      URL.revokeObjectURL(blobUrl);

      const node = new AudioWorkletNode(ctx, "pcm-recorder");
      node.port.onmessage = (ev) => {
        const data = ev.data as Int16Array;
        if (data && data.length > 0) {
          pcmChunksRef.current.push(new Int16Array(data));
        }
      };
      workletNodeRef.current = node;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(node);
      // Worklet must connect somewhere to actually receive audio frames.
      // A zero-gain destination keeps the audio silent locally.
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      node.connect(silentGain).connect(ctx.destination);
      sourceRef.current = source;
    } catch (err) {
      stopAll();
      setStatus("error");
      setError(err instanceof Error ? err.message : "could not access microphone");
    }
  }, [stopAll]);

  const stopAndUpload = useCallback(async () => {
    if (status !== "recording") return;
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    const durationMs = Math.max(0, performance.now() - startedAtRef.current);
    const chunks = pcmChunksRef.current;
    pcmChunksRef.current = [];

    // Tear down the mic + worklet immediately — no point keeping the
    // stream open while we wait for transcription.
    stopAll();

    if (chunks.length === 0) {
      setStatus("idle");
      return;
    }

    // Concatenate all int16 chunks.
    const totalSamples = chunks.reduce((acc, c) => acc + c.length, 0);
    const merged = new Int16Array(totalSamples);
    let off = 0;
    for (const c of chunks) {
      merged.set(c, off);
      off += c.length;
    }
    const pcmBytes = new Uint8Array(merged.buffer);

    // Build a self-contained WAV data URL so the installer-side <audio>
    // tag can play it without any decoder dependency.
    const wavBlob = pcmToWavBlob(merged, SAMPLE_RATE);
    const audioDataUrl = await blobToDataUrl(wavBlob);

    // Send PCM to Gradium via our server route.
    setStatus("transcribing");
    let transcript: string | undefined;
    try {
      const res = await fetch("/api/voice-transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: pcmBytes,
      });
      if (res.ok) {
        const body = (await res.json()) as { transcript?: string };
        transcript = (body.transcript ?? "").trim() || undefined;
      } else {
        const txt = await res.text();
        // Don't block the memo if Gradium is down — keep the audio.
        // eslint-disable-next-line no-console
        console.warn("[voice-memo] transcribe failed:", res.status, txt.slice(0, 200));
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[voice-memo] transcribe network error:", err);
    }

    onChange({ audioDataUrl, transcript, durationMs: Math.round(durationMs) });
    setStatus("idle");
  }, [onChange, status, stopAll]);

  const clearMemo = useCallback(() => {
    onChange(null);
    setStatus("idle");
    setError(null);
  }, [onChange]);

  // Render
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-[#9BA3AF]">
          Roof obstructions (optional) — Gradium AI
        </span>
        {value ? (
          <button
            type="button"
            onClick={clearMemo}
            className="flex items-center gap-1 text-[10px] text-[#9BA3AF] hover:text-[#F36262]"
          >
            <Trash2 size={10} />
            Remove
          </button>
        ) : null}
      </div>
      <p className="-mt-0.5 text-[11px] leading-snug text-[#5B6470]">
        Tell the installer what&rsquo;s on your roof — chimneys, satellite dishes,
        skylights, antennas, vent pipes, dormers, or anything that shades it
        (tall trees, neighbours&rsquo; buildings). Anything the satellite can&rsquo;t see.
      </p>

      {value ? (
        <div className="flex flex-col gap-2 rounded-lg border border-[#62E6A7]/40 bg-[#62E6A7]/5 p-2.5">
          <audio
            controls
            src={value.audioDataUrl}
            className="h-7 w-full"
            preload="metadata"
          />
          {value.transcript ? (
            <div className="rounded border border-[#2A3038] bg-[#0A0E1A] p-2 text-xs leading-relaxed text-[#F7F8FA]">
              <span className="mr-1 text-[10px] uppercase tracking-wider text-[#62E6A7]">
                Transcript ·
              </span>
              {value.transcript}
            </div>
          ) : (
            <div className="text-[10px] italic text-[#9BA3AF]">
              No transcript — Gradium STT was unavailable; the audio is still attached.
            </div>
          )}
        </div>
      ) : status === "recording" ? (
        <button
          type="button"
          onClick={stopAndUpload}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#F36262] bg-[#F36262]/10 px-3 py-2.5 text-sm text-[#F36262] hover:bg-[#F36262]/20"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F36262] opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#F36262]"></span>
          </span>
          <Square size={14} />
          Stop recording · {(elapsedMs / 1000).toFixed(1)} s
        </button>
      ) : status === "transcribing" ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-[#3DAEFF]/40 bg-[#3DAEFF]/10 px-3 py-2.5 text-sm text-[#3DAEFF]">
          <Loader2 size={14} className="animate-spin" />
          Transcribing with Gradium AI…
        </div>
      ) : (
        <button
          type="button"
          onClick={start}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#2A3038] bg-[#12161C] px-3 py-2.5 text-sm text-[#9BA3AF] transition-colors hover:border-[#62E6A7] hover:text-[#62E6A7]"
        >
          <Mic size={14} />
          Tap to describe what&rsquo;s on your roof
        </button>
      )}

      {error ? (
        <div className="text-[10px] text-[#F36262]">⚠ {error}</div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PCM → WAV conversion. We wrap the int16 samples in a 44-byte RIFF/WAVE
// header so a plain HTML <audio> can play the memo on the installer side
// without bringing in any audio decoding library.
// ---------------------------------------------------------------------------

function pcmToWavBlob(samples: Int16Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let p = 0;
  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i));
  };
  writeStr("RIFF");
  view.setUint32(p, 36 + dataSize, true); p += 4;
  writeStr("WAVE");
  writeStr("fmt ");
  view.setUint32(p, 16, true); p += 4;             // chunk size
  view.setUint16(p, 1, true); p += 2;              // PCM
  view.setUint16(p, numChannels, true); p += 2;
  view.setUint32(p, sampleRate, true); p += 4;
  view.setUint32(p, byteRate, true); p += 4;
  view.setUint16(p, blockAlign, true); p += 2;
  view.setUint16(p, bitsPerSample, true); p += 2;
  writeStr("data");
  view.setUint32(p, dataSize, true); p += 4;
  // PCM data in little-endian
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(p, samples[i], true);
    p += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error ?? new Error("FileReader failed"));
    r.readAsDataURL(blob);
  });
}

export default VoiceMemoRecorder;
