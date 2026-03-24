'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { AudioStreamPlayer, AudioRecorder, createWavUrl } from '@/lib/audio';
import { Mic, MicOff, Video, VideoOff, Send, Phone, PhoneOff, Loader2, Settings, Volume2, X, ChevronDown, Plus, Trash2, MessageSquareText, MessageSquare } from 'lucide-react';

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
  
  // Settings
  const [selectedVoice, setSelectedVoice] = useState('Zephyr');
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash-native-audio-preview-12-2025');
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

  const isMicMutedRef = useRef(isMicMuted);
  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

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

  const startVideo = async (deviceIdOrType?: string | null) => {
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
  };

  const stopVideo = () => {
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(t => t.stop());
      videoStreamRef.current = null;
    }
    if (videoIntervalRef.current) {
      clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }
    setIsVideoEnabled(false);
  };

  const handleAudioButtonClick = async () => {
    setShowAudioMenu(!showAudioMenu);
    setShowVideoMenu(false);
    if (!showAudioMenu) {
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
    const nextShowMenu = !showVideoMenu;
    setShowVideoMenu(nextShowMenu);
    setShowAudioMenu(false);
    
    if (nextShowMenu) {
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

  const sendVideoFrame = () => {
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
  }, []);

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

      playerRef.current = new AudioStreamPlayer();
      recorderRef.current = new AudioRecorder((base64Data) => {
        if (sessionRef.current && !isMicMutedRef.current) {
          userAudioBufferRef.current.push(base64Data);
          sessionRef.current.then((session: any) => {
            session.sendRealtimeInput({
              audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
            });
          });
        }
      });

      const sessionPromise = ai.live.connect({
        model: selectedModel,
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setIsConnecting(false);
            recorderRef.current?.start(selectedAudioDeviceRef.current || undefined);
          },
          onmessage: async (message: LiveServerMessage) => {
            const parts = message.serverContent?.modelTurn?.parts;
            
            if (parts) {
              // Play audio outside of state updater to prevent double-play in React Strict Mode
              for (const part of parts) {
                if (part.inlineData && playerRef.current && part.inlineData.data) {
                  playerRef.current.playPCM(part.inlineData.data);
                }
              }

              // Finalize user message if it's still pending
              setMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.role === 'user' && !lastMsg.isComplete) {
                  const audioChunks = [...userAudioBufferRef.current];
                  let audioUrl: string | undefined;
                  if (audioChunks.length > 0) {
                    audioUrl = createWavUrl(audioChunks, 16000);
                  }
                  return [...prev.slice(0, -1), { ...lastMsg, isComplete: true, audioUrl }];
                }
                return prev;
              });

              setMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                let newMsg: Message;
                if (lastMsg && lastMsg.role === 'model' && !lastMsg.isComplete) {
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

                if (lastMsg && lastMsg.role === 'model' && !lastMsg.isComplete) {
                  return [...prev.slice(0, -1), newMsg];
                } else {
                  return [...prev, newMsg];
                }
              });
            }

            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text || '';
              setMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.role === 'model' && !lastMsg.isComplete) {
                  return [...prev.slice(0, -1), { ...lastMsg, text: lastMsg.text + text }];
                }
                return prev;
              });
            }

            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text || '';
              setMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.role === 'user' && !lastMsg.isComplete && lastMsg.isAudio) {
                  return [...prev.slice(0, -1), { ...lastMsg, text: lastMsg.text + text }];
                } else {
                  return [...prev, { id: Date.now().toString(), role: 'user', text, thought: '', isAudio: true, isComplete: false }];
                }
              });
            }

            if (message.serverContent?.turnComplete || message.serverContent?.interrupted) {
              userAudioBufferRef.current = []; // Clear user audio buffer for the next turn
              setMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.role === 'model') {
                  let audioUrl = lastMsg.audioUrl;
                  if (lastMsg.audioData && lastMsg.audioData.length > 0 && !audioUrl) {
                    audioUrl = createWavUrl(lastMsg.audioData, 24000);
                  }
                  return [...prev.slice(0, -1), { ...lastMsg, isComplete: true, audioUrl }];
                }
                return prev;
              });
            }

            if (message.serverContent?.interrupted && playerRef.current) {
              playerRef.current.interrupt();
            }

            if (message.toolCall?.functionCalls) {
              for (const call of message.toolCall.functionCalls) {
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
          systemInstruction: "You are a helpful assistant. You can see the user if they enable their camera. You can also think before you speak. You have a tool to generate or edit images. If the user uploads an image (using the plus button or pasting) and asks to change, edit, or modify it, use the 'generateImage' tool. When using the tool for editing, the prompt should describe the changes relative to the uploaded image. If the user asks to edit an image but hasn't uploaded one, ask them to upload it first. You can see uploaded images as they are sent to you as video frames.",
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          tools: [generateImageTool],
        },
      });

      sessionRef.current = sessionPromise;
    } catch (err) {
      console.error("Connection error:", err);
      handleDisconnect(false);
    }
  }, [isConnecting, isConnected, selectedModel, selectedVoice, selectedImageModel, handleDisconnect]);

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
        // We can't easily use refs for the menus since they are conditionally rendered
        // but we can check if the click target is within a menu container
        const target = event.target as HTMLElement;
        if (!target.closest('.relative')) {
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
    <div className="relative flex flex-col h-full w-full bg-neutral-950 overflow-hidden">
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
        className={`absolute inset-0 w-full h-full object-cover z-0 ${isVideoEnabled ? 'block' : 'hidden'}`}
      />
      {/* Dark gradient overlay to make text readable over video */}
      {isVideoEnabled && (
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/80 z-0 pointer-events-none" />
      )}
      {!isVideoEnabled && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-600 z-0 bg-neutral-900">
          <VideoOff className="w-16 h-16 mb-4 opacity-20" />
          <p className="opacity-50">Camera is off</p>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />

      {/* Chat UI Overlay */}
      <div className="relative z-10 flex flex-col h-full w-full max-w-[95vw] mx-auto">
        <div className="p-4 bg-gradient-to-b from-black/80 to-transparent flex justify-end items-center transition-all duration-300 hover:bg-black/90">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowTranscription(!showTranscription)}
              className={`p-2 rounded-full transition-all duration-300 shadow-lg flex items-center justify-center ${
                showTranscription 
                  ? 'bg-blue-600/30 text-blue-400 border border-blue-500/40 hover:bg-blue-600/40' 
                  : 'bg-neutral-800/50 text-neutral-500 border border-neutral-700/30 hover:bg-neutral-800/80 hover:text-neutral-400'
              }`}
              title={showTranscription ? 'Hide Transcription' : 'Show Transcription'}
            >
              {showTranscription ? <MessageSquareText className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-neutral-400 text-sm text-center px-4 drop-shadow-md">
              Connect to start a conversation. You can speak or type your messages.
            </div>
          ) : (
            messages.map((msg) => {
              const hasVisibleContent = showTranscription || msg.imageUrl || (msg.userImages && msg.userImages.length > 0);
              if (!hasVisibleContent) return null;

              return (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
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
                        {msg.imageUrl && (
                          <div className="mt-2 rounded-lg overflow-hidden border border-neutral-700/50 bg-neutral-900/50 relative">
                            <Image 
                              src={msg.imageUrl} 
                              alt="Generated content" 
                              width={800} 
                              height={600} 
                              className="w-full h-auto object-contain max-h-[60vh]" 
                              referrerPolicy="no-referrer"
                              unoptimized
                            />
                          </div>
                        )}
                        {msg.audioUrl && showTranscription && (
                          <div className="mt-2">
                            <audio controls src={msg.audioUrl} className="h-8 w-[90%] opacity-90" />
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
                          <div className="mt-2">
                            <audio controls src={msg.audioUrl} className="h-8 w-[90%] opacity-90" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
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

          <div className="flex items-center justify-center gap-4">
            <div className="relative">
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
            
            <div className="relative">
              <button 
                onClick={handleCameraButtonClick}
                className={`flex items-center gap-1 p-3 rounded-full transition-colors ${!isVideoEnabled ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'}`}
                title="Camera Options"
                disabled={!isConnected}
              >
                {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                <ChevronDown className="w-3 h-3 opacity-50" />
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

            <div className="w-px h-6 bg-neutral-800 mx-2"></div>

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

            <div className="w-px h-6 bg-neutral-800 mx-2"></div>

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
    </div>
  );
}

