// app/api/voice-transcribe/route.ts
//
// Voice memo transcription endpoint, powered by **Gradium Voice AI**
// (https://gradium.ai). The homeowner records a memo via Web Audio API +
// MediaRecorder in IntakePanel, the captured PCM is POSTed here as raw
// 24 kHz int16 little-endian bytes, and we stream it through Gradium's
// speech-to-text WebSocket to return a plain-text transcript that the
// installer-side lead detail renders alongside audio playback.
//
// Why a server-side WebSocket and not a direct browser WebSocket: the
// Gradium API key (gsk_…) must stay server-only per the project's
// "never expose credentials" rule. The browser uploads PCM bytes to
// this route; this route owns the Gradium connection.
//
// Protocol (from gradium-ai/gradium-py /gradium/speech.py):
//   1. WebSocket → wss://eu.api.gradium.ai/api/speech/asr with header
//      `kyutai-api-key: <GRADIUM_API_KEY>`
//   2. First message: { type:"setup", model_name:"default",
//                       input_format:"pcm", json_config:"{...}" }
//   3. Repeated messages: { type:"audio",
//                           audio:<base64 of int16 PCM bytes> }
//   4. Server emits { type:"text", text:"...", start_s, stop_s, ... }
//   5. We close once all chunks are sent and collect the text segments.

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GRADIUM_WS_URL = "wss://eu.api.gradium.ai/api/speech/asr";
// 24 kHz / 2 bytes per int16 sample = 48 000 bytes/s.
// Stream in ~80 ms windows so the server doesn't buffer the whole file.
const STREAM_CHUNK_BYTES = 24_000 / 1000 * 80 * 2;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.GRADIUM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "voice transcription not configured (missing GRADIUM_API_KEY)" },
      { status: 503 },
    );
  }

  // Body shape: raw PCM (Content-Type: application/octet-stream).
  // 24 kHz, mono, 16-bit little-endian. The browser produces this from
  // an AudioWorklet ingesting the mic stream — no codec decode needed.
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.startsWith("application/octet-stream")) {
    return NextResponse.json(
      { error: "expected raw PCM (application/octet-stream)" },
      { status: 400 },
    );
  }
  const pcm = new Uint8Array(await req.arrayBuffer());
  if (pcm.byteLength === 0) {
    return NextResponse.json({ error: "empty audio payload" }, { status: 400 });
  }
  if (pcm.byteLength > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "audio too large (>25 MB)" }, { status: 413 });
  }

  // Open the Gradium STT WebSocket. Node 22+ ships native WebSocket;
  // headers (for our `kyutai-api-key` auth) are passed as the third arg.
  const ws = new WebSocket(GRADIUM_WS_URL, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    headers: { "kyutai-api-key": apiKey } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ws as any).binaryType = "arraybuffer";

  const transcriptParts: string[] = [];

  try {
    await waitForOpen(ws, 5_000);

    // Setup message tells Gradium we're sending PCM int16 at 24 kHz.
    ws.send(
      JSON.stringify({
        type: "setup",
        model_name: "default",
        input_format: "pcm",
        json_config: JSON.stringify({}),
      }),
    );

    // Wait for the server's "ready" ack before streaming audio so we
    // don't drop the first chunks while the model warms up.
    await waitForReady(ws, 8_000);

    // Stream the PCM in ~80 ms slices. Each slice base64-encoded into
    // an "audio" message — same format the Python SDK uses.
    for (let off = 0; off < pcm.byteLength; off += STREAM_CHUNK_BYTES) {
      const slice = pcm.subarray(off, Math.min(off + STREAM_CHUNK_BYTES, pcm.byteLength));
      ws.send(
        JSON.stringify({
          type: "audio",
          audio: Buffer.from(slice).toString("base64"),
        }),
      );
    }

    // Tell Gradium we're done — its EOF signal flushes any pending text.
    ws.send(JSON.stringify({ type: "eos" }));

    // Collect all text events until the socket closes (server signals
    // end-of-input by closing once "eos" is processed).
    await collectText(ws, transcriptParts, 15_000);
  } catch (err) {
    safeClose(ws);
    return NextResponse.json(
      { error: "gradium transcription failed", detail: String(err) },
      { status: 502 },
    );
  } finally {
    safeClose(ws);
  }

  const transcript = transcriptParts.join(" ").replace(/\s+/g, " ").trim();
  return NextResponse.json({
    transcript,
    provider: "gradium-voice-asr",
  });
}

// ---------------------------------------------------------------------------
// WebSocket helpers — small enough to keep inline rather than introducing
// a dependency.
// ---------------------------------------------------------------------------

function waitForOpen(ws: WebSocket, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("gradium ws connect timeout")), timeoutMs);
    ws.addEventListener("open", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
    ws.addEventListener("error", (e) => {
      clearTimeout(t);
      reject(new Error(`gradium ws error: ${(e as Event).type}`));
    }, { once: true });
  });
}

function waitForReady(ws: WebSocket, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("gradium ws ready timeout")), timeoutMs);
    const handler = (event: MessageEvent) => {
      try {
        const msg = parseMessage(event.data);
        if (msg?.type === "ready") {
          ws.removeEventListener("message", handler);
          clearTimeout(t);
          resolve();
        }
        if (msg?.type === "error") {
          ws.removeEventListener("message", handler);
          clearTimeout(t);
          reject(new Error(`gradium setup error: ${msg.message ?? "unknown"}`));
        }
      } catch {
        // ignore non-JSON frames
      }
    };
    ws.addEventListener("message", handler);
  });
}

function collectText(ws: WebSocket, into: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(), timeoutMs);
    ws.addEventListener("message", (event) => {
      const msg = parseMessage(event.data);
      if (msg?.type === "text" && typeof msg.text === "string") {
        into.push(msg.text);
      }
    });
    ws.addEventListener("close", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
    ws.addEventListener("error", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseMessage(data: any): Record<string, any> | null {
  try {
    if (typeof data === "string") return JSON.parse(data);
    if (data instanceof ArrayBuffer) {
      return JSON.parse(new TextDecoder().decode(data));
    }
    if (data && typeof data === "object" && "toString" in data) {
      return JSON.parse(String(data));
    }
  } catch {
    // ignore
  }
  return null;
}

function safeClose(ws: WebSocket): void {
  try {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  } catch {
    // ignore
  }
}
