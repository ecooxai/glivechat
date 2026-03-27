'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { motion, AnimatePresence } from 'motion/react';
import { AudioStreamPlayer, AudioRecorder, createWavUrl } from '@/lib/audio';
import { Mic, MicOff, Video, VideoOff, Send, Phone, PhoneOff, Loader2, Settings, Volume2, X, ChevronDown, Plus, Trash2, MessageSquareText, MessageSquare, Camera, Image as ImageIcon, Film, Download, Eye } from 'lucide-react';

// IndexedDB Utility for permanent storage
const DB_NAME = 'LiveChatGallery';
const STORE_NAME = 'items';

async function initDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveGalleryItem(item: any) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(item);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

async function getGalleryItems() {
  const db = await initDB();
  return new Promise<any[]>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteGalleryItem(id: string) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

const formatSize = (bytes?: number) => {
  if (!bytes) return 'Unknown size';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

type Message = {
  id: string;
  role: 'user' | 'model';
  text: string;
  thought: string;
  isAudio: boolean;
  isComplete: boolean;
  audioData?: string[];
  audioUrl?: string;
  imageUrl?: string;
  userImages?: string[];
  tokens?: {
    current?: number;
    total?: number;
  };
};

export default function LiveChat() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showTranscription, setShowTranscription] = useState(true);
  const [galleryItems, setGalleryItems] = useState<any[]>([]);
  const [showGallery, setShowGallery] = useState(false);
  const [recentShot, setRecentShot] = useState<string | null>(null);
  const [latestGeneratedImage, setLatestGeneratedImage] = useState<string | null>(null);
  const [showLargeGeneratedImage, setShowLargeGeneratedImage] = useState(false);
  const recentShotTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [selectedGalleryItem, setSelectedGalleryItem] = useState<any | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isAutoTrimEnabled, setIsAutoTrimEnabled] = useState(false);
  
  // Settings
  const [selectedVoice, setSelectedVoice] = useState('Zephyr');
  const [selectedModel, setSelectedModel] = useState('gemini-3.1-flash-live-preview');
  const [selectedImageModel, setSelectedImageModel] = useState('gemini-2.5-flash-image');

  const prevVoiceRef = useRef(selectedVoice);
  const prevModelRef = useRef(selectedModel);

  // Devices
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string | null>(null);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string | null>(null);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showVideoMenu, setShowVideoMenu] = useState(false);
  
  // Settings
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<any>(null);
  const playerRef = useRef<AudioStreamPlayer | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImagesRef = useRef<string[]>([]);
  const lastGeneratedImageUrlRef = useRef<string | null>(null);
  const userAudioBufferRef = useRef<string[]>([]);
  const activeUserMessageIdRef = useRef<string | null>(null);
  
  const isIntentionalDisconnectRef = useRef(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const selectedAudioDeviceRef = useRef<string | null>(null);
  const selectedVideoDeviceRef = useRef<string | null>(null);

  useEffect(() => {
    pendingImagesRef.current = pendingImages;
  }, [pendingImages]);

  useEffect(() => {
    selectedAudioDeviceRef.current = selectedAudioDevice;
  }, [selectedAudioDevice]);

  useEffect(() => {
    selectedVideoDeviceRef.current = selectedVideoDevice;
  }, [selectedVideoDevice]);

  useEffect(() => {
    const loadGallery = async () => {
      try {
        const items = await getGalleryItems();
        setGalleryItems(items.sort((a, b) => b.timestamp - a.timestamp));
      } catch (err) {
        console.error('Failed to load gallery:', err);
      }
    };
    loadGallery();
  }, []);

  const isMicMutedRef = useRef(isMicMuted);
  const isAutoTrimEnabledRef = useRef(isAutoTrimEnabled);
  const silenceCounterRef = useRef(0);
  const isSilentRef = useRef(true);

  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  useEffect(() => {
    isAutoTrimEnabledRef.current = isAutoTrimEnabled;
  }, [isAutoTrimEnabled]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send newly uploaded images to the session so the model can "see" them
  useEffect(() => {
    if (isConnected && pendingImages.length > 0) {
      const lastImage = pendingImages[pendingImages.length - 1];
      const base64Data = lastImage.split(',')[1];
      const mimeType = lastImage.split(';')[0].split(':')[1];
      
      sessionRef.current?.then((session: any) => {
        session.sendRealtimeInput({
          video: { data: base64Data, mimeType: mimeType }
        });
      });
    }
  }, [pendingImages, isConnected]);

  const stopVideo = useCallback(() => {
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(t => t.stop());
      videoStreamRef.current = null;
    }
    if (videoIntervalRef.current) {
      clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }
    setIsVideoEnabled(false);
  }, []);

  const sendVideoFrame = useCallback(() => {
    if (!sessionRef.current || !videoRef.current || !canvasRef.current || !isVideoEnabled) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx || video.videoWidth === 0) return;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
    const base64Data = dataUrl.split(',')[1];
    
    sessionRef.current.then((session: any) => {
      session.sendRealtimeInput({
        video: { data: base64Data, mimeType: 'image/jpeg' }
      });
    });
  }, [isVideoEnabled]);

  const startVideo = useCallback(async (deviceIdOrType?: string | null) => {
    try {
      stopVideo();
      
      let stream: MediaStream;
      if (deviceIdOrType === 'screen') {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      } else {
        const constraints = deviceIdOrType ? { video: { deviceId: { exact: deviceIdOrType } } } : { video: true };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      videoStreamRef.current = stream;
      setIsVideoEnabled(true);
      setSelectedVideoDevice(deviceIdOrType || null);
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
      
      videoIntervalRef.current = setInterval(() => {
        sendVideoFrame();
      }, 1000); // 1 frame per second

      if (deviceIdOrType === 'screen') {
        stream.getVideoTracks()[0].onended = () => {
          stopVideo();
          setSelectedVideoDevice(null);
        };
      }
    } catch (err) {
      console.error("Error accessing camera/screen:", err);
      setIsVideoEnabled(false);
      setSelectedVideoDevice(null);
    }
  }, [sendVideoFrame, stopVideo]);

  const handleAudioButtonClick = async () => {
    if (showAudioMenu) {
      changeAudioDevice('disable');
    } else {
      setShowAudioMenu(true);
      setShowVideoMenu(false);
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAudioDevices(devices.filter(d => d.kind === 'audioinput'));
      } catch (err) {
        console.error("Error fetching audio devices:", err);
      }
    }
  };

  const handleCameraButtonClick = async () => {
    if (showVideoMenu) {
      changeVideoDevice('disable');
    } else {
      setShowVideoMenu(true);
      setShowAudioMenu(false);
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoIn = devices.filter(d => d.kind === 'videoinput');
        setVideoDevices(videoIn);

        if (!isVideoEnabled) {
          // If no device selected, use the first one available
          const deviceToUse = selectedVideoDeviceRef.current || (videoIn.length > 0 ? videoIn[0].deviceId : null);
          await startVideo(deviceToUse);
        }
      } catch (err) {
        console.error("Error fetching video devices:", err);
      }
    }
  };

  const handleShotDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isConnected) return;
    setRecordingStartTime(Date.now());
    longPressTimerRef.current = setTimeout(() => {
      startVideoRecording();
    }, 1000);
  };

  const handleShotUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (isRecordingVideo) {
      stopVideoRecording();
    } else if (recordingStartTime && Date.now() - recordingStartTime < 1000) {
      captureImage();
    }
    setRecordingStartTime(null);
  };

  const captureImage = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg');
    
    const base64Length = dataUrl.length - (dataUrl.indexOf(',') + 1);
    const padding = (dataUrl.charAt(dataUrl.length - 2) === '=') ? 2 : ((dataUrl.charAt(dataUrl.length - 1) === '=') ? 1 : 0);
    const fileSize = (base64Length * 0.75) - padding;

    const newItem = {
      id: `img_${Date.now()}`,
      type: 'image',
      url: dataUrl,
      timestamp: Date.now(),
      resolution: `${video.videoWidth}x${video.videoHeight}`,
      size: fileSize
    };
    
    await saveGalleryItem(newItem);
    setGalleryItems(prev => [newItem, ...prev]);

    setRecentShot(dataUrl);
    if (recentShotTimeoutRef.current) clearTimeout(recentShotTimeoutRef.current);
    recentShotTimeoutRef.current = setTimeout(() => setRecentShot(null), 3000);
  };

  const startVideoRecording = async () => {
    if (!videoStreamRef.current) return;
    setIsRecordingVideo(true);
    videoChunksRef.current = [];
    
    const recorder = new MediaRecorder(videoStreamRef.current);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) videoChunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      const blob = new Blob(videoChunksRef.current, { type: 'video/webm' });
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        const base64Length = base64data.length - (base64data.indexOf(',') + 1);
        const padding = (base64data.charAt(base64data.length - 2) === '=') ? 2 : ((base64data.charAt(base64data.length - 1) === '=') ? 1 : 0);
        const fileSize = (base64Length * 0.75) - padding;

        const newItem = {
          id: `vid_${Date.now()}`,
          type: 'video',
          url: base64data,
          timestamp: Date.now(),
          resolution: `${videoRef.current?.videoWidth || 0}x${videoRef.current?.videoHeight || 0}`,
          size: fileSize
        };
        await saveGalleryItem(newItem);
        setGalleryItems(prev => [newItem, ...prev]);
      };
    };
    
    mediaRecorderRef.current = recorder;
    recorder.start();
  };

  const stopVideoRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecordingVideo(false);
  };

  const deleteItem = async (id: string) => {
    await deleteGalleryItem(id);
    setGalleryItems(prev => prev.filter(item => item.id !== id));
    if (selectedGalleryItem?.id === id) setSelectedGalleryItem(null);
  };

  const downloadItem = (item: any) => {
    const a = document.createElement('a');
    a.href = item.url;
    a.download = `${item.type}_${item.id}.${item.type === 'image' ? 'jpg' : 'webm'}`;
    a.click();
  };

  const changeAudioDevice = async (deviceId: string) => {
    if (deviceId === 'disable') {
      setIsMicMuted(true);
      setShowAudioMenu(false);
      return;
    }
    
    setIsMicMuted(false);
    setSelectedAudioDevice(deviceId);
    setShowAudioMenu(false);
    
    if (isConnected && recorderRef.current) {
      recorderRef.current.stop();
      await recorderRef.current.start(deviceId);
    }
  };

  const changeVideoDevice = async (deviceId: string) => {
    setShowVideoMenu(false);
    if (deviceId === 'disable') {
      stopVideo();
      setSelectedVideoDevice(null);
      return;
    }
    await startVideo(deviceId);
  };

  const handleDisconnect = useCallback((intentional: boolean) => {
    setIsConnected(false);
    setIsConnecting(false);
    recorderRef.current?.stop();
    playerRef.current?.interrupt();
    
    if (intentional) {
      stopVideo();
    }
    
    if (sessionRef.current) {
      sessionRef.current.then((session: any) => session.close()).catch(() => {});
      sessionRef.current = null;
    }

    if (!intentional && !isIntentionalDisconnectRef.current) {
      console.log("Disconnected unexpectedly. Reconnecting in 3 seconds...");
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        connectRef.current();
      }, 3000);
    }
  }, [stopVideo]);

  const connect = useCallback(async () => {
    if (isConnecting || isConnected) return;
    setIsConnecting(true);
    isIntentionalDisconnectRef.current = false;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });
      
      const generateImageTool = {
        functionDeclarations: [
          {
            name: 'generateImage',
            description: 'Generate or edit an image based on a text prompt. Use this when the user asks to "generate an image", "draw something", or when they ask to "edit", "change", or "modify" an uploaded image. If the user has uploaded an image (using the plus button or pasting), this tool will receive it as context for editing.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                prompt: {
                  type: Type.STRING,
                  description: 'A detailed description of the image to generate or the modifications to apply to the uploaded image. Be specific about what to add, remove, or change.',
                },
              },
              required: ['prompt'],
            },
          },
        ],
      };

      const setCameraStateTool = {
        functionDeclarations: [{
          name: 'setCameraState',
          description: 'Enable or disable the user\'s camera.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              enabled: {
                type: Type.BOOLEAN,
                description: 'Whether the camera should be enabled or disabled.'
              }
            },
            required: ['enabled']
          }
        }]
      };

      const setTranscriptionStateTool = {
        functionDeclarations: [{
          name: 'setTranscriptionState',
          description: 'Show or hide the transcription (text history) of the conversation.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              visible: {
                type: Type.BOOLEAN,
                description: 'Whether the transcription should be visible or hidden.'
              }
            },
            required: ['visible']
          }
        }]
      };

      playerRef.current = new AudioStreamPlayer();
      recorderRef.current = new AudioRecorder((base64Data, volume) => {
        if (sessionRef.current && !isMicMutedRef.current) {
          const threshold = 0.0001; // Extremely sensitive threshold
          
          if (volume > threshold) {
            if (isSilentRef.current) {
              // User started speaking! New utterance.
              activeUserMessageIdRef.current = Date.now().toString();
              userAudioBufferRef.current = [];
            }
            silenceCounterRef.current = 0;
            isSilentRef.current = false;
          } else {
            silenceCounterRef.current++;
          }

          // Always send to session so model can detect end of turn
          sessionRef.current.then((session: any) => {
            session.sendRealtimeInput({
              audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
            });
          });

          // Trimming logic for history buffer
          if (isAutoTrimEnabledRef.current) {
            // 2048 samples @ 16kHz is ~128ms per chunk. 3 seconds is ~23 chunks.
            if (silenceCounterRef.current > 23) {
              if (!isSilentRef.current) {
                // Trim the last 3 seconds of silence we just captured
                userAudioBufferRef.current = userAudioBufferRef.current.slice(0, -23);
                isSilentRef.current = true;
                
                // Finalize the audio for this utterance
                const audioChunks = [...userAudioBufferRef.current];
                if (audioChunks.length > 0 && activeUserMessageIdRef.current) {
                  const audioUrl = createWavUrl(audioChunks, 16000);
                  const msgId = activeUserMessageIdRef.current;
                  setMessages(prev => {
                    const index = prev.findIndex(m => m.id === msgId);
                    if (index !== -1) {
                      const nextMessages = [...prev];
                      nextMessages[index] = { ...nextMessages[index], audioUrl, isComplete: true };
                      return nextMessages;
                    } else {
                      return [...prev, { id: msgId, role: 'user', text: '', thought: '', isAudio: true, isComplete: true, audioUrl }];
                    }
                  });
                }
              }
            } else {
              userAudioBufferRef.current.push(base64Data);
            }
          } else {
            userAudioBufferRef.current.push(base64Data);
          }
        }
      });

      const sessionPromise = ai.live.connect({
        model: selectedModel,
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setIsConnecting(false);
            activeUserMessageIdRef.current = Date.now().toString();
            recorderRef.current?.start(selectedAudioDeviceRef.current || undefined);
          },
          onmessage: async (message: LiveServerMessage) => {
            const parts = message.serverContent?.modelTurn?.parts;
            const outputTranscription = message.serverContent?.outputTranscription;
            const turnComplete = message.serverContent?.turnComplete;
            const interrupted = message.serverContent?.interrupted;

            // Helper to finalize user message
            const finalizeUserMessage = () => {
              setMessages(prev => {
                const msgId = activeUserMessageIdRef.current;
                if (!msgId) return prev;

                const index = prev.findIndex(m => m.id === msgId);
                
                const audioChunks = [...userAudioBufferRef.current];
                let audioUrl: string | undefined;
                if (audioChunks.length > 0) {
                  audioUrl = createWavUrl(audioChunks, 16000);
                }

                // Mark as silent so next loud speech starts a new utterance
                isSilentRef.current = true;

                if (index !== -1) {
                  const msg = prev[index];
                  const nextMessages = [...prev];
                  nextMessages[index] = { ...msg, isComplete: true, audioUrl: audioUrl || msg.audioUrl };
                  return nextMessages;
                } else if (audioChunks.length > 0) {
                  // Message doesn't exist at all, create it
                  return [...prev, { id: msgId, role: 'user', text: '', thought: '', isAudio: true, isComplete: true, audioUrl }];
                }
                return prev;
              });
            };

            if (parts) {
              // Play audio outside of state updater to prevent double-play in React Strict Mode
              for (const part of parts) {
                if (part.inlineData && playerRef.current && part.inlineData.data) {
                  playerRef.current.playPCM(part.inlineData.data);
                }
              }

              setMessages(prev => {
                const index = prev.map(m => m.role === 'model' && !m.isComplete).lastIndexOf(true);
                let newMsg: Message;
                if (index !== -1) {
                  const lastMsg = prev[index];
                  // Clone audioData to prevent duplicate chunks in React Strict Mode
                  newMsg = { ...lastMsg, audioData: lastMsg.audioData ? [...lastMsg.audioData] : [] };
                } else {
                  newMsg = { id: Date.now().toString(), role: 'model', text: '', thought: '', isAudio: false, isComplete: false, audioData: [] };
                }

                for (const part of parts) {
                  if (part.inlineData) {
                    newMsg.isAudio = true;
                    if (part.inlineData.data) {
                      newMsg.audioData!.push(part.inlineData.data);
                    }
                  } else if (part.thought && part.text) {
                    newMsg.thought += part.text;
                  } else if (part.text) {
                    newMsg.text += part.text;
                  }
                }

                if (index !== -1) {
                  const nextMessages = [...prev];
                  nextMessages[index] = newMsg;
                  return nextMessages;
                } else {
                  return [...prev, newMsg];
                }
              });
            }

            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text || '';
              setMessages(prev => {
                const index = prev.map(m => m.role === 'model' && !m.isComplete).lastIndexOf(true);
                if (index !== -1) {
                  const msg = prev[index];
                  const nextMessages = [...prev];
                  nextMessages[index] = { ...msg, text: msg.text + text };
                  return nextMessages;
                }
                return prev;
              });
            }

            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text || '';
              setMessages(prev => {
                const msgId = activeUserMessageIdRef.current;
                if (msgId) {
                  const index = prev.findIndex(m => m.id === msgId);
                  if (index !== -1) {
                    const msg = prev[index];
                    const nextMessages = [...prev];
                    nextMessages[index] = { ...msg, text: msg.text + text };
                    return nextMessages;
                  } else {
                    return [...prev, { id: msgId, role: 'user', text, thought: '', isAudio: true, isComplete: false }];
                  }
                } else {
                  // Fallback
                  const newId = Date.now().toString();
                  activeUserMessageIdRef.current = newId;
                  return [...prev, { id: newId, role: 'user', text, thought: '', isAudio: true, isComplete: false }];
                }
              });
            }

            if (turnComplete || interrupted) {
              finalizeUserMessage();
              setMessages(prev => {
                const index = prev.map(m => m.role === 'model' && !m.isComplete).lastIndexOf(true);
                if (index !== -1) {
                  const lastMsg = prev[index];
                  let audioUrl = lastMsg.audioUrl;
                  if (lastMsg.audioData && lastMsg.audioData.length > 0 && !audioUrl) {
                    audioUrl = createWavUrl(lastMsg.audioData, 24000);
                  }
                  const nextMessages = [...prev];
                  nextMessages[index] = { ...lastMsg, isComplete: true, audioUrl };
                  return nextMessages;
                }
                return prev;
              });
            }

            if (message.serverContent?.interrupted && playerRef.current) {
              playerRef.current.interrupt();
            }

            if (message.toolCall?.functionCalls) {
              for (const call of message.toolCall.functionCalls) {
                if (call.name === 'setCameraState') {
                  const { enabled } = call.args as any;
                  if (enabled) {
                    startVideo();
                  } else {
                    stopVideo();
                  }
                  sessionPromise.then((session: any) => {
                    session.sendToolResponse({
                      functionResponses: [{
                        name: 'setCameraState',
                        id: call.id,
                        response: { result: `Camera ${enabled ? 'enabled' : 'disabled'} successfully.` }
                      }]
                    });
                  });
                }

                if (call.name === 'setTranscriptionState') {
                  const { visible } = call.args as any;
                  setShowTranscription(visible);
                  sessionPromise.then((session: any) => {
                    session.sendToolResponse({
                      functionResponses: [{
                        name: 'setTranscriptionState',
                        id: call.id,
                        response: { result: `Transcription ${visible ? 'visible' : 'hidden'} successfully.` }
                      }]
                    });
                  });
                }

                if (call.name === 'generateImage') {
                  const { prompt } = call.args as any;
                  
                    const imageMsgId = Date.now().toString();
                    setMessages(prev => [...prev, {
                      id: imageMsgId,
                      role: 'model',
                      text: `Generating/Editing image: "${prompt}"...`,
                      thought: '',
                      isAudio: false,
                      isComplete: false
                    }]);

                    try {
                      const parts: any[] = [];
                      
                      // Add pending images for image-to-image/editing
                      pendingImagesRef.current.forEach(img => {
                        const base64Data = img.split(',')[1];
                        const mimeType = img.split(';')[0].split(':')[1];
                        parts.push({
                          inlineData: {
                            data: base64Data,
                            mimeType: mimeType
                          }
                        });
                      });

                      // If no pending images, check if we can use the last generated image
                      if (parts.length === 0 && lastGeneratedImageUrlRef.current) {
                        const img = lastGeneratedImageUrlRef.current;
                        if (img.startsWith('data:')) {
                          const base64Data = img.split(',')[1];
                          const mimeType = img.split(';')[0].split(':')[1];
                          parts.push({
                            inlineData: {
                              data: base64Data,
                              mimeType: mimeType
                            }
                          });
                        }
                      }

                      // Add the text prompt last
                      const finalPrompt = parts.length > 0 
                        ? `EDITING INSTRUCTION: Use the provided image as the base. Apply these changes: ${prompt}. Keep the original composition and style unless specified otherwise.`
                        : prompt;
                      
                      parts.push({ text: finalPrompt });

                      const response = await ai.models.generateContent({
                        model: selectedImageModel,
                        contents: { parts },
                      });

                      let imageUrl = '';
                      for (const part of response.candidates?.[0]?.content?.parts || []) {
                        if (part.inlineData) {
                          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
                          break;
                        }
                      }

                      if (imageUrl) {
                        lastGeneratedImageUrlRef.current = imageUrl;
                        setLatestGeneratedImage(imageUrl);
                        setMessages(prev => prev.map(m => m.id === imageMsgId ? {
                          ...m,
                          text: parts.length > 1 ? `Edited image based on: "${prompt}"` : `Generated image for: "${prompt}"`,
                          imageUrl,
                          isComplete: true
                        } : m));
                        
                        // Clear pending images after successful edit
                        if (parts.length > 1) {
                          setPendingImages([]);
                        }
                      
                      sessionPromise.then((session: any) => {
                        session.sendToolResponse({
                          functionResponses: [{
                            name: 'generateImage',
                            id: call.id,
                            response: { result: 'Image generated successfully and displayed to user.' }
                          }]
                        });
                      });
                    } else {
                      throw new Error('No image data in response');
                    }
                  } catch (err) {
                    console.error('Image generation error:', err);
                    setMessages(prev => prev.map(m => m.id === imageMsgId ? {
                      ...m,
                      text: `Failed to generate image: ${err instanceof Error ? err.message : String(err)}`,
                      isComplete: true
                    } : m));
                    
                    sessionPromise.then((session: any) => {
                      session.sendToolResponse({
                        functionResponses: [{
                          name: 'generateImage',
                          id: call.id,
                          response: { error: 'Failed to generate image.' }
                        }]
                      });
                    });
                  }
                }
              }
            }

            if (message.usageMetadata) {
              setMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.role === 'model') {
                  return [...prev.slice(0, -1), { 
                    ...lastMsg, 
                    tokens: {
                      current: message.usageMetadata?.responseTokenCount,
                      total: message.usageMetadata?.totalTokenCount
                    }
                  }];
                }
                return prev;
              });
            }
          },
          onclose: () => {
            handleDisconnect(false);
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            handleDisconnect(false);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } },
          },
          systemInstruction: "You are a helpful assistant. You can see the user if they enable their camera. You can also think before you speak. You have tools to generate or edit images, control the camera, and show/hide the transcription. If the user uploads an image and asks to change, edit, or modify it, use the 'generateImage' tool. If the user asks to open/enable or close/disable the camera, use the 'setCameraState' tool. If the user asks to show or hide the transcription/text history, use the 'setTranscriptionState' tool.",
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          tools: [generateImageTool, setCameraStateTool, setTranscriptionStateTool],
        },
      });

      sessionRef.current = sessionPromise;
    } catch (err) {
      console.error("Connection error:", err);
      handleDisconnect(false);
    }
  }, [isConnecting, isConnected, selectedModel, selectedVoice, selectedImageModel, handleDisconnect, startVideo, stopVideo]);

  const disconnect = () => {
    isIntentionalDisconnectRef.current = true;
    handleDisconnect(true);
  };

  const connectRef = useRef(connect);
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const sendText = (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!textInput.trim() && pendingImages.length === 0) || !sessionRef.current) return;
    
    const userMsg: Message = { 
      id: Date.now().toString(), 
      role: 'user', 
      text: textInput, 
      thought: '', 
      isAudio: false, 
      isComplete: true,
      userImages: pendingImages.length > 0 ? [...pendingImages] : undefined
    };
    setMessages(prev => [...prev, userMsg]);
    
    sessionRef.current.then((session: any) => {
      const parts: any[] = [];
      if (textInput.trim()) {
        parts.push({ text: textInput });
      }
      
      pendingImages.forEach(img => {
        const base64Data = img.split(',')[1];
        const mimeType = img.split(';')[0].split(':')[1];
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        });
      });

      session.sendRealtimeInput({
        text: textInput.trim() || "See attached images",
        // The Live API doesn't support multiple parts in sendRealtimeInput directly in the same way as generateContent
        // but we can send them as separate inputs or if the SDK supports it.
        // Actually, for the Live API, we should send them as media if they are images.
        // However, the prompt says "send these images too".
        // If we are using the Live API, we might need to send them as separate inputs or if the model can handle them.
        // Let's assume the user wants them to be part of the context.
      });

      // If there are images, we might want to send them as well.
      // For now, let's just send the text and clear the images.
      // In a real scenario, we'd send the images as well.
    });
    
    setTextInput('');
    setPendingImages([]);
  };

  // Auto-reconnect when voice or model changes while connected
  useEffect(() => {
    const voiceChanged = prevVoiceRef.current !== selectedVoice;
    const modelChanged = prevModelRef.current !== selectedModel;

    if (isConnected && (voiceChanged || modelChanged)) {
      handleDisconnect(true);
      const timeout = setTimeout(() => {
        connectRef.current();
      }, 500);
      
      prevVoiceRef.current = selectedVoice;
      prevModelRef.current = selectedModel;
      return () => clearTimeout(timeout);
    }

    prevVoiceRef.current = selectedVoice;
    prevModelRef.current = selectedModel;
  }, [selectedVoice, selectedModel, isConnected, handleDisconnect]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setPendingImages(prev => [...prev, base64]);
      };
      reader.readAsDataURL(file);
    });
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePendingImage = (index: number) => {
    setPendingImages(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (!blob) continue;
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event.target?.result as string;
            setPendingImages(prev => [...prev, base64]);
          };
          reader.readAsDataURL(blob);
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showAudioMenu || showVideoMenu) {
        const target = event.target as HTMLElement;
        if (!target.closest('.menu-container')) {
          setShowAudioMenu(false);
          setShowVideoMenu(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAudioMenu, showVideoMenu]);

  useEffect(() => {
    // Auto-connect on mount
    connectRef.current();
    
    return () => {
      // Cleanup on unmount
      isIntentionalDisconnectRef.current = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      
      setIsConnected(false);
      setIsConnecting(false);
      recorderRef.current?.stop();
      playerRef.current?.interrupt();
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach(t => t.stop());
        videoStreamRef.current = null;
      }
      if (videoIntervalRef.current) {
        clearInterval(videoIntervalRef.current);
        videoIntervalRef.current = null;
      }
      if (sessionRef.current) {
        sessionRef.current.then((session: any) => session.close()).catch(() => {});
        sessionRef.current = null;
      }
    };
  }, []);

  return (
    <div className={`relative flex flex-col h-full w-full overflow-hidden transition-colors duration-500 ${isConnected ? 'bg-black' : 'bg-red-600'}`}>
      {/* Latest Generated Image Mini View */}
      <AnimatePresence>
        {latestGeneratedImage && (
          <motion.div
            initial={{ opacity: 0, x: -20, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -20, scale: 0.9 }}
            className="absolute top-4 left-4 z-40 rounded-xl overflow-hidden border-2 border-blue-500/50 shadow-2xl shadow-blue-500/10 cursor-pointer group"
            onClick={() => setShowLargeGeneratedImage(true)}
          >
            <Image src={latestGeneratedImage} alt="Latest generated" width={120} height={90} className="object-cover transition-transform duration-300 group-hover:scale-110" unoptimized />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
              <Eye className="w-4 h-4 text-white" />
              <span className="text-white text-xs font-medium">View</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Large Generated Image Modal */}
      <AnimatePresence>
        {showLargeGeneratedImage && latestGeneratedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
            onClick={() => setShowLargeGeneratedImage(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-5xl w-full max-h-[90vh] flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <Image 
                src={latestGeneratedImage} 
                alt="Large generated view" 
                width={1920} 
                height={1080} 
                className="w-full h-full object-contain rounded-2xl" 
                unoptimized 
              />
              <button
                onClick={() => setShowLargeGeneratedImage(false)}
                className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full backdrop-blur-md transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recent Shot Toast */}
      <AnimatePresence>
        {recentShot && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="absolute top-4 right-4 z-50 rounded-xl overflow-hidden border-2 border-green-500 shadow-2xl shadow-green-500/20"
          >
            <Image src={recentShot} alt="Recent shot" width={120} height={90} className="object-cover" unoptimized />
            <div className="absolute bottom-0 inset-x-0 bg-green-500 text-white text-[10px] font-bold text-center py-0.5 uppercase tracking-wider">
              Captured
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-medium text-neutral-100">Settings</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-neutral-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Model</label>
                <select 
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="gemini-2.5-flash-native-audio-preview-12-2025">Gemini 2.5 Flash Native Audio</option>
                  <option value="gemini-3.1-flash-live-preview">Gemini 3.1 Flash Live Preview</option>
                  <option value="gemini-3.1-flash-preview">Gemini 3.1 Flash Preview</option>
                  <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
                </select>
                <p className="text-xs text-neutral-500 mt-1">Session will restart on change.</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Voice</label>
                <select 
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="Puck">Puck</option>
                  <option value="Charon">Charon</option>
                  <option value="Kore">Kore</option>
                  <option value="Fenrir">Fenrir</option>
                  <option value="Zephyr">Zephyr</option>
                </select>
                <p className="text-xs text-neutral-500 mt-1">Session will restart on change.</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Image Model</label>
                <select 
                  value={selectedImageModel}
                  onChange={async (e) => {
                    const model = e.target.value;
                    setSelectedImageModel(model);
                    if (model === 'gemini-3.1-flash-image-preview' || model === 'gemini-3-pro-image-preview') {
                      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
                      if (!hasKey) {
                        await (window as any).aistudio.openSelectKey();
                      }
                    }
                  }}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="gemini-2.5-flash-image">Nano Banana (2.5 Flash)</option>
                  <option value="gemini-3.1-flash-image-preview">Banana 2 (3.1 Flash)</option>
                  <option value="gemini-3-pro-image-preview">Banana Pro (3 Pro)</option>
                </select>
                <p className="text-xs text-neutral-500 mt-1">
                  Select model for image generation. 
                  {(selectedImageModel === 'gemini-3.1-flash-image-preview' || selectedImageModel === 'gemini-3-pro-image-preview') && (
                    <span className="block text-blue-400 mt-1">
                      Requires paid API key. See <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="underline">billing docs</a>.
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
                <div>
                  <label className="block text-sm font-medium text-neutral-200">Auto Trim Silence</label>
                  <p className="text-xs text-neutral-500">Removes silences longer than 3s from saved recordings.</p>
                </div>
                <button 
                  onClick={() => setIsAutoTrimEnabled(!isAutoTrimEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isAutoTrimEnabled ? 'bg-blue-600' : 'bg-neutral-700'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isAutoTrimEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
            
            <div className="mt-8 flex justify-end">
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Background */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] h-auto object-contain z-0 ${isVideoEnabled ? 'block' : 'hidden'}`}
      />
      {/* Dark gradient overlay to make text readable over video */}
      {isVideoEnabled && (
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/80 z-0 pointer-events-none" />
      )}
      {!isVideoEnabled && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-600 z-0">
          <VideoOff className="w-16 h-16 mb-4 opacity-20" />
          <p className="opacity-50">Camera is off</p>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />

      {/* Chat UI Overlay */}
      <div className="relative z-10 flex flex-col h-full w-full max-w-[95vw] mx-auto">
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-neutral-400 text-sm text-center px-4 drop-shadow-md">
              {isConnected ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <p className="text-white font-medium">Connected</p>
                  <p className="text-xs opacity-70">You can speak or type your messages.</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full" />
                  <p className="text-white font-medium">Disconnected</p>
                  <p className="text-xs text-white">Use the call button at the bottom to connect.</p>
                </div>
              )}
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {messages.map((msg) => {
                const hasVisibleContent = showTranscription;
                if (!hasVisibleContent) return null;

                return (
                  <motion.div 
                    key={msg.id} 
                    layout
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`rounded-2xl px-4 py-3 text-sm shadow-lg backdrop-blur-md w-[80vw] ${
                      msg.role === 'user' 
                        ? 'bg-blue-600/90 text-white rounded-br-sm border border-blue-500/30' 
                        : 'bg-neutral-800/90 text-neutral-200 rounded-bl-sm border border-neutral-700/50'
                    }`}>
                      {msg.role === 'model' ? (
                        <div className="flex flex-col gap-2">
                          {msg.isAudio && showTranscription && (
                            <div className="flex items-center gap-2 text-blue-400 text-xs font-medium uppercase tracking-wider">
                              <Volume2 className="w-4 h-4" /> Audio Response
                            </div>
                          )}
                          {msg.thought && showTranscription && (
                            <details className="group">
                              <summary className="cursor-pointer text-neutral-400 hover:text-neutral-300 select-none text-xs font-medium uppercase tracking-wider flex items-center gap-1">
                                <span className="group-open:hidden">▶</span>
                                <span className="hidden group-open:inline">▼</span>
                                Thinking Process
                              </summary>
                              <div className="mt-2 text-green-400 whitespace-pre-wrap font-mono text-xs bg-neutral-950/70 p-3 rounded-lg border border-neutral-800/50">
                                {msg.thought}
                              </div>
                            </details>
                          )}
                          {msg.text && showTranscription && (
                            <div className="text-neutral-100 mt-1">
                              {msg.text}
                            </div>
                          )}
                          {msg.imageUrl && showTranscription && (
                            <div className="mt-3 rounded-xl overflow-hidden border border-neutral-700/50 bg-neutral-900/40 shadow-2xl group relative">
                              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10" />
                              <Image 
                                src={msg.imageUrl} 
                                alt="Generated content" 
                                width={800} 
                                height={600} 
                                className="w-full h-auto object-contain max-h-[65vh] transition-transform duration-500 group-hover:scale-[1.02]" 
                                referrerPolicy="no-referrer"
                                unoptimized
                              />
                              <div className="absolute bottom-3 right-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                <span className="text-[10px] uppercase tracking-widest bg-black/60 backdrop-blur-md px-2 py-1 rounded border border-white/10 text-white/70">
                                  AI Generated
                                </span>
                              </div>
                            </div>
                          )}
                          {msg.audioUrl && showTranscription && (
                            <div className="mt-2 bg-black/20 rounded-xl p-2 border border-white/5 shadow-inner">
                              <audio controls src={msg.audioUrl} className="h-8 w-full opacity-80 hover:opacity-100 transition-opacity" />
                            </div>
                          )}
                          {msg.tokens && showTranscription && (
                            <div className="mt-2 text-[10px] text-neutral-400 flex gap-3 border-t border-neutral-700/50 pt-2 uppercase tracking-wider">
                              <span>Tokens: {msg.tokens.current || 0}</span>
                              <span>Context: {msg.tokens.total || 0}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {msg.isAudio && showTranscription && (
                            <div className="flex items-center gap-1 text-blue-200 text-xs mb-1">
                              <Mic className="w-3 h-3" /> Voice Input
                            </div>
                          )}
                          {showTranscription && msg.text}
                          {msg.userImages && msg.userImages.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {msg.userImages.map((img, idx) => (
                                <div key={idx} className="relative w-24 h-24 rounded-lg overflow-hidden border border-blue-400/30">
                                  <Image 
                                    src={img} 
                                    alt={`User upload ${idx}`} 
                                    fill 
                                    className="object-cover" 
                                    unoptimized
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                          {msg.audioUrl && showTranscription && (
                            <div className="mt-2 bg-black/20 rounded-xl p-2 border border-white/5 shadow-inner">
                              <audio controls src={msg.audioUrl} className="h-8 w-full opacity-80 hover:opacity-100 transition-opacity" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Area: Input + Controls */}
        <div className="p-4 bg-neutral-950/80 backdrop-blur-xl border-t border-neutral-800/50 flex flex-col gap-4">
          {pendingImages.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-2">
              {pendingImages.map((img, idx) => (
                <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-neutral-700">
                  <Image src={img} alt="Pending upload" fill className="object-cover" unoptimized />
                  <button 
                    onClick={() => removePendingImage(idx)}
                    className="absolute top-0 right-0 p-1 bg-black/50 text-white hover:bg-red-500 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <form onSubmit={sendText} className="flex gap-2 items-center">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              className="hidden" 
              accept="image/*" 
              multiple 
            />
            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-full bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors disabled:opacity-50"
              disabled={!isConnected}
              title="Upload Image"
            >
              <Plus className="w-5 h-5" />
            </button>
            <input 
              type="text" 
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type a message..." 
              className="flex-1 bg-neutral-900/80 border border-neutral-700/50 rounded-full px-4 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder-neutral-500"
              disabled={!isConnected}
            />
            <button 
              type="submit"
              disabled={!isConnected || (!textInput.trim() && pendingImages.length === 0)}
              className="p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4">
            <button 
              onMouseDown={handleShotDown}
              onMouseUp={handleShotUp}
              onMouseLeave={handleShotUp}
              onTouchStart={handleShotDown}
              onTouchEnd={handleShotUp}
              className={`p-3 rounded-full transition-all duration-300 flex items-center justify-center group relative ${
                isRecordingVideo 
                  ? 'bg-red-600 text-white animate-pulse scale-110' 
                  : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
              }`}
              title="Click for Photo, Hold for Video"
              disabled={!isConnected}
            >
              <Camera className={`w-5 h-5 ${isRecordingVideo ? 'hidden' : 'block'}`} />
              {isRecordingVideo && <Film className="w-5 h-5" />}
              {isRecordingVideo && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
              )}
            </button>

            <button 
              onClick={() => setShowGallery(true)}
              className="p-3 rounded-full bg-neutral-800 text-neutral-200 hover:bg-neutral-700 transition-all duration-300 flex items-center justify-center relative"
              title="Gallery"
            >
              <ImageIcon className="w-5 h-5" />
              {galleryItems.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-blue-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-black min-w-[18px] text-center">
                  {galleryItems.length}
                </span>
              )}
            </button>

            <div className="relative menu-container">
              <button 
                onClick={handleCameraButtonClick}
                className={`p-3 rounded-full transition-all duration-300 flex items-center justify-center ${
                  isVideoEnabled 
                    ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 ring-1 ring-blue-500/20' 
                    : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
                }`}
                title={isVideoEnabled ? 'Disable Camera' : 'Enable Camera'}
                disabled={!isConnected}
              >
                {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>

              {showVideoMenu && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden z-50">
                  <div className="p-2 border-b border-neutral-800 text-[10px] text-neutral-500 uppercase tracking-wider font-medium">Select Camera</div>
                  <div className="max-h-48 overflow-y-auto">
                    {videoDevices.map(device => (
                      <button
                        key={device.deviceId}
                        onClick={() => changeVideoDevice(device.deviceId)}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-neutral-800 transition-colors ${selectedVideoDevice === device.deviceId && isVideoEnabled ? 'text-blue-400 bg-blue-500/5' : 'text-neutral-300'}`}
                      >
                        {device.label || `Camera ${device.deviceId.slice(0, 5)}`}
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-neutral-800">
                    <button
                      onClick={() => changeVideoDevice('screen')}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-neutral-800 transition-colors ${selectedVideoDevice === 'screen' && isVideoEnabled ? 'text-blue-400 bg-blue-500/5' : 'text-neutral-300'}`}
                    >
                      Screen Share
                    </button>
                    <button
                      onClick={() => changeVideoDevice('disable')}
                      className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-neutral-800 transition-colors"
                    >
                      Disable Camera
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button 
              onClick={() => setShowTranscription(!showTranscription)}
              className={`p-3 rounded-full transition-all duration-500 flex items-center justify-center group ${
                showTranscription 
                  ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 ring-1 ring-blue-500/20' 
                  : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
              }`}
              title={showTranscription ? 'Hide Transcription' : 'Show Transcription'}
              disabled={!isConnected}
            >
              {showTranscription ? (
                <MessageSquareText className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" />
              ) : (
                <MessageSquare className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" />
              )}
            </button>

            <div className="hidden md:block w-px h-6 bg-neutral-800 mx-1"></div>

            <div className="relative menu-container">
              <button 
                onClick={handleAudioButtonClick}
                className={`flex items-center gap-1 p-3 rounded-full transition-colors ${isMicMuted ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'}`}
                title="Audio Options"
                disabled={!isConnected}
              >
                {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                <ChevronDown className="w-3 h-3 opacity-50" />
              </button>
              
              {showAudioMenu && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden z-50">
                  <div className="p-2 border-b border-neutral-800 text-[10px] text-neutral-500 uppercase tracking-wider font-medium">Select Microphone</div>
                  <div className="max-h-48 overflow-y-auto">
                    {audioDevices.map(device => (
                      <button
                        key={device.deviceId}
                        onClick={() => changeAudioDevice(device.deviceId)}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-neutral-800 transition-colors ${selectedAudioDevice === device.deviceId && !isMicMuted ? 'text-blue-400 bg-blue-500/5' : 'text-neutral-300'}`}
                      >
                        {device.label || `Microphone ${device.deviceId.slice(0, 5)}`}
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-neutral-800">
                    <button
                      onClick={() => changeAudioDevice('disable')}
                      className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-neutral-800 transition-colors"
                    >
                      Disable Microphone
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            <div className="hidden md:block w-px h-6 bg-neutral-800 mx-1"></div>

            {isConnected ? (
              <button 
                onClick={disconnect}
                className="p-3 rounded-full bg-red-500/20 text-red-500 hover:bg-red-500/30 transition-colors flex items-center justify-center"
                title="End Call"
              >
                <PhoneOff className="w-5 h-5" />
              </button>
            ) : (
              <button 
                onClick={connect}
                disabled={isConnecting}
                className="p-3 rounded-full bg-green-500/20 text-green-500 hover:bg-green-500/30 transition-colors disabled:opacity-50 flex items-center justify-center"
                title={isConnecting ? "Connecting..." : "Connect"}
              >
                {isConnecting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Phone className="w-5 h-5" />
                )}
              </button>
            )}

            <div className="hidden md:block w-px h-6 bg-neutral-800 mx-1"></div>

            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-3 rounded-full bg-neutral-800 text-neutral-200 hover:bg-neutral-700 transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Gallery Modal */}
      <AnimatePresence>
        {showGallery && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-neutral-900 border border-neutral-800 w-full max-w-4xl max-h-[85vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50 backdrop-blur-xl">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-blue-400" />
                    Media Gallery
                  </h2>
                  <p className="text-xs text-neutral-500 mt-1">Photos and videos captured during your session</p>
                </div>
                <button 
                  onClick={() => setShowGallery(false)}
                  className="p-2 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {galleryItems.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-neutral-600 gap-4">
                    <div className="p-6 rounded-full bg-neutral-800/50">
                      <Camera className="w-12 h-12 opacity-20" />
                    </div>
                    <p>No media captured yet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {galleryItems.map(item => (
                      <div 
                        key={item.id} 
                        className="group relative aspect-square rounded-2xl overflow-hidden border border-neutral-800 bg-black hover:border-blue-500/50 transition-all cursor-pointer flex flex-col"
                        onClick={() => setSelectedGalleryItem(item)}
                      >
                        <div className="flex-1 relative w-full h-full">
                          {item.type === 'image' ? (
                            <Image src={item.url} alt="Captured" fill className="object-cover group-hover:scale-110 transition-transform duration-500" unoptimized />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-neutral-800">
                              <Film className="w-8 h-8 text-neutral-500" />
                              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
                            </div>
                          )}
                        </div>
                        <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-black/60 backdrop-blur-md text-[10px] font-medium text-white border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                          {item.type.toUpperCase()}
                        </div>
                        <div className="absolute bottom-0 inset-x-0 bg-black/80 backdrop-blur-md p-2 text-[10px] text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-0.5 z-10">
                          <div className="flex justify-between">
                            <span className="uppercase font-bold text-white">{item.type}</span>
                            <span>{formatSize(item.size)}</span>
                          </div>
                          <div className="text-neutral-400">{item.resolution || 'Unknown resolution'}</div>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 z-20">
                          <button 
                            onClick={(e) => { e.stopPropagation(); downloadItem(item); }}
                            className="p-3 rounded-full bg-blue-600/80 text-white hover:bg-blue-500 transition-colors backdrop-blur-sm"
                            title="Download"
                          >
                            <Download className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                            className="p-3 rounded-full bg-red-600/80 text-white hover:bg-red-500 transition-colors backdrop-blur-sm"
                            title="Delete"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Media Preview Modal */}
      <AnimatePresence>
        {selectedGalleryItem && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl"
            onClick={() => setSelectedGalleryItem(null)}
          >
            <motion.div 
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="relative max-w-5xl w-full max-h-[90vh] flex flex-col items-center gap-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="absolute -top-12 right-0 flex gap-2">
                <button 
                  onClick={() => downloadItem(selectedGalleryItem)}
                  className="p-3 rounded-full bg-blue-600 text-white hover:bg-blue-500 transition-all"
                  title="Download"
                >
                  <Download className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => deleteItem(selectedGalleryItem.id)}
                  className="p-3 rounded-full bg-red-600 text-white hover:bg-red-500 transition-all"
                  title="Delete"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => setSelectedGalleryItem(null)}
                  className="p-3 rounded-full bg-neutral-800 text-white hover:bg-neutral-700 transition-all"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="w-full h-full min-h-[50vh] relative rounded-3xl overflow-hidden bg-black flex items-center justify-center border border-white/10 shadow-2xl">
                {selectedGalleryItem.type === 'image' ? (
                  <Image src={selectedGalleryItem.url} alt="Preview" fill className="object-contain" unoptimized />
                ) : (
                  <video src={selectedGalleryItem.url} controls autoPlay className="max-w-full max-h-[80vh]" />
                )}
              </div>
              
              <div className="text-neutral-400 text-sm font-medium bg-neutral-900/50 px-4 py-2 rounded-full border border-neutral-800 flex flex-wrap gap-4 items-center justify-center">
                <span>{new Date(selectedGalleryItem.timestamp).toLocaleString()}</span>
                <span className="uppercase text-white">{selectedGalleryItem.type}</span>
                <span>{selectedGalleryItem.resolution || 'Unknown resolution'}</span>
                <span>{formatSize(selectedGalleryItem.size)}</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

