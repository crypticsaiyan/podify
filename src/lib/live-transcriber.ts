// Browser-side push-to-talk transcription: mic -> 16-bit PCM -> AssemblyAI Streaming STT.

const CHUNK_SECONDS = 0.1; // AssemblyAI accepts 50 ms to 1000 ms per message

const WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

let cachedToken: { value: string; at: number } | null = null;

// Tokens are reusable within their window, so prefetching one hides a round trip.
export async function prefetchToken(): Promise<string> {
  if (cachedToken && Date.now() - cachedToken.at < 8 * 60_000) return cachedToken.value;
  const res = await fetch("/api/stt-token");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not get a speech token");
  cachedToken = { value: data.token, at: Date.now() };
  return data.token;
}

type TurnMessage = { type: "Turn"; turn_order: number; transcript: string; end_of_turn: boolean };

export class LiveTranscriber {
  private ws?: WebSocket;
  private ctx?: AudioContext;
  private stream?: MediaStream;
  private buffer = new Int16Array(0);
  private filled = 0;
  private queue: ArrayBuffer[] = [];
  private turns = new Map<number, string>();
  private terminated?: Promise<void>;
  private starting?: Promise<void>;
  private stopped = false;

  constructor(
    private onText: (text: string) => void,
    private context = "",
  ) {}

  get text(): string {
    return [...this.turns.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, t]) => t.trim())
      .filter(Boolean)
      .join(" ");
  }

  start(): Promise<void> {
    this.starting = this.open();
    return this.starting;
  }

  private async open() {
    const token = prefetchToken();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    if (this.stopped) return this.release();

    // Mic capture starts before the socket is open; early audio is queued, not lost.
    // The context runs at the device's native rate: Firefox cannot resample a live mic into
    // a 16 kHz context, and AssemblyAI accepts any rate from 8 kHz to 96 kHz.
    this.ctx = new AudioContext();
    const sampleRate = this.ctx.sampleRate;
    this.buffer = new Int16Array(Math.round(sampleRate * CHUNK_SECONDS));
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const node = new AudioWorkletNode(this.ctx, "pcm-capture");
    node.port.onmessage = (e: MessageEvent<Float32Array>) => this.push(e.data);
    this.ctx.createMediaStreamSource(this.stream).connect(node);
    node.connect(this.ctx.destination); // outputs silence; keeps the node pulled

    const params = new URLSearchParams({
      sample_rate: String(sampleRate),
      encoding: "pcm_s16le",
      speech_model: "universal-3-6-pro",
      token: await token,
    });
    if (this.context) params.set("agent_context", this.context.slice(0, 1700));

    const ws = new WebSocket(`wss://streaming.assemblyai.com/v3/ws?${params}`);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    this.terminated = new Promise((resolve) => {
      ws.onclose = () => resolve();
      ws.onerror = () => resolve();
    });
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "Turn") {
        const turn = msg as TurnMessage;
        this.turns.set(turn.turn_order, turn.transcript);
        this.onText(this.text);
      } else if (msg.type === "Termination") {
        ws.close();
      }
    };
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.addEventListener("close", (e) => reject(new Error(`Speech connection closed (${e.code}) ${e.reason}`)), {
        once: true,
      });
    });
    for (const chunk of this.queue.splice(0)) ws.send(chunk);
  }

  private push(samples: Float32Array) {
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      this.buffer[this.filled++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.filled === this.buffer.length) this.flush();
    }
  }

  private flush(pad = false) {
    if (this.filled === 0) return;
    // The final chunk is zero-padded so it still meets the 50 ms minimum.
    const chunk = pad ? new Int16Array(this.buffer.length) : new Int16Array(this.filled);
    chunk.set(this.buffer.subarray(0, this.filled));
    this.filled = 0;
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(chunk.buffer);
    else this.queue.push(chunk.buffer);
  }

  // Stops the mic and waits for the final transcript.
  async stop(): Promise<string> {
    this.stopped = true;
    try {
      await this.starting;
    } catch {
      // Connection errors surface through the empty transcript below.
    }
    this.flush(true);
    this.release();
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "Terminate" }));
      await Promise.race([this.terminated, new Promise((r) => setTimeout(r, 3000))]);
    }
    this.ws?.close();
    return this.text;
  }

  private release() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.stream = undefined;
    this.ctx = undefined;
  }
}
