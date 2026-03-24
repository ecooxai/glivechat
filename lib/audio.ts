export function createWavUrl(base64Chunks: string[], sampleRate: number): string {
  let totalLength = 0;
  const byteArrays: Uint8Array[] = [];
  
  for (const b64 of base64Chunks) {
    const binaryString = atob(b64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    byteArrays.push(bytes);
    totalLength += len;
  }

  const wavBuffer = new ArrayBuffer(44 + totalLength);
  const view = new DataView(wavBuffer);

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + totalLength, true);
  writeString(view, 8, 'WAVE');

  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);

  writeString(view, 36, 'data');
  view.setUint32(40, totalLength, true);

  let offset = 44;
  for (const bytes of byteArrays) {
    new Uint8Array(wavBuffer, offset, bytes.length).set(bytes);
    offset += bytes.length;
  }

  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

export class AudioStreamPlayer {
  private context: AudioContext | null = null;
  private nextPlayTime: number = 0;

  constructor() {
    // We initialize context lazily to avoid autoplay policy issues
  }

  private initContext() {
    if (!this.context) {
      this.context = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
  }

  async playPCM(base64Data: string) {
    this.initContext();
    if (!this.context) return;

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    const audioBuffer = this.context.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);

    const source = this.context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.context.destination);

    const currentTime = this.context.currentTime;
    if (this.nextPlayTime < currentTime) {
      this.nextPlayTime = currentTime;
    }

    source.start(this.nextPlayTime);
    this.nextPlayTime += audioBuffer.duration;
  }

  interrupt() {
    if (this.context) {
      this.context.close();
      this.context = null;
    }
    this.nextPlayTime = 0;
  }
}

export class AudioRecorder {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;

  constructor(private onAudioData: (base64Data: string, volume: number) => void) {}

  async start(deviceId?: string) {
    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 16000,
      }
    };
    
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });

    const workletCode = `
      class PCMRecorderProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this.bufferSize = 2048;
          this.buffer = new Float32Array(this.bufferSize);
          this.bytesWritten = 0;
        }

        process(inputs, outputs, parameters) {
          const input = inputs[0];
          if (input.length > 0) {
            const channelData = input[0];
            
            // Calculate volume (RMS)
            let sum = 0;
            for (let i = 0; i < channelData.length; i++) {
              sum += channelData[i] * channelData[i];
            }
            const rms = Math.sqrt(sum / channelData.length);
            
            for (let i = 0; i < channelData.length; i++) {
              this.buffer[this.bytesWritten++] = channelData[i];
              if (this.bytesWritten >= this.bufferSize) {
                this.port.postMessage({
                  buffer: this.buffer,
                  volume: rms
                });
                this.bytesWritten = 0;
              }
            }
          }
          return true;
        }
      }
      registerProcessor('pcm-recorder', PCMRecorderProcessor);
    `;

    const blob = new Blob([workletCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);

    await this.context.audioWorklet.addModule(url);
    this.workletNode = new AudioWorkletNode(this.context, 'pcm-recorder');
    
    this.workletNode.port.onmessage = (event) => {
      const { buffer: float32Array, volume } = event.data;
      const int16Array = new Int16Array(float32Array.length);
      for (let i = 0; i < float32Array.length; i++) {
        let s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      
      const bytes = new Uint8Array(int16Array.buffer);
      const base64 = btoa(String.fromCharCode(...bytes));
      this.onAudioData(base64, volume);
    };

    this.sourceNode = this.context.createMediaStreamSource(this.stream);
    this.sourceNode.connect(this.workletNode);
    
    // Connect to a silent gain node and then to destination to keep the worklet running
    this.gainNode = this.context.createGain();
    this.gainNode.gain.value = 0;
    this.workletNode.connect(this.gainNode);
    this.gainNode.connect(this.context.destination);
  }

  stop() {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    if (this.context) {
      this.context.close();
      this.context = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }
}
