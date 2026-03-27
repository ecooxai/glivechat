'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { GoogleGenAI, LiveServerMessage, Modality, Type, ThinkingLevel } from '@google/genai';
import { motion, AnimatePresence } from 'motion/react';
import { AudioStreamPlayer, AudioRecorder, createWavUrl } from '@/lib/audio';
import { Mic, MicOff, Video, VideoOff, Send, Phone, PhoneOff, Loader2, Settings, Volume2, X, ChevronDown, Plus, Trash2, MessageSquareText, MessageSquare, Camera, Image as ImageIcon, Film, Download, Eye, Bookmark, Check, FileText, Edit3, Save, History, Folder } from 'lucide-react';
import MarkdownEditor from './MarkdownEditor';

// IndexedDB Utility for permanent storage
const DB_NAME = 'LiveChatGallery';
const STORE_NAME = 'items';
const NOTES_STORE = 'notes';
const FOLDERS_STORE = 'folders';

async function initDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        db.createObjectStore(NOTES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
        db.createObjectStore(FOLDERS_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveFolder(folder: Folder) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FOLDERS_STORE, 'readwrite');
    const store = transaction.objectStore(FOLDERS_STORE);
    const request = store.put(folder);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

async function getFolders() {
  const db = await initDB();
  return new Promise<Folder[]>((resolve, reject) => {
    const transaction = db.transaction(FOLDERS_STORE, 'readonly');
    const store = transaction.objectStore(FOLDERS_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteFolder(id: string) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FOLDERS_STORE, 'readwrite');
    const store = transaction.objectStore(FOLDERS_STORE);
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

async function saveNote(note: Note) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(NOTES_STORE, 'readwrite');
    const store = transaction.objectStore(NOTES_STORE);
    const request = store.put(note);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

async function getNotes() {
  const db = await initDB();
  return new Promise<Note[]>((resolve, reject) => {
    const transaction = db.transaction(NOTES_STORE, 'readonly');
    const store = transaction.objectStore(NOTES_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteNote(id: string) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(NOTES_STORE, 'readwrite');
    const store = transaction.objectStore(NOTES_STORE);
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
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

import { diffLines, Change } from 'diff';

function renderDiff(oldText: string, newText: string) {
  const changes = diffLines(oldText, newText);
  
  // Find indices of changed blocks
  const changedIndices = new Set<number>();
  changes.forEach((change, i) => {
    if (change.added || change.removed) {
      changedIndices.add(i);
      if (i > 0) changedIndices.add(i - 1);
      if (i < changes.length - 1) changedIndices.add(i + 1);
    }
  });

  const result: React.ReactNode[] = [];
  let lastIndex = -1;

  changes.forEach((change, i) => {
    if (!changedIndices.has(i)) return;

    // Add ellipsis if we skipped some unchanged lines
    if (lastIndex !== -1 && i > lastIndex + 1) {
      result.push(
        <div key={`ellipsis-${i}`} className="text-neutral-500 py-1 px-2 select-none">
          ...
        </div>
      );
    }
    lastIndex = i;

    const lines = change.value.replace(/\n$/, '').split('\n');
    
    if (change.added) {
      lines.forEach((line, lineIdx) => {
        result.push(
          <div key={`add-${i}-${lineIdx}`} className="bg-green-500/20 text-green-300 px-2 py-0.5 border-l-2 border-green-500">
            + {line}
          </div>
        );
      });
    } else if (change.removed) {
      lines.forEach((line, lineIdx) => {
        result.push(
          <div key={`del-${i}-${lineIdx}`} className="bg-red-500/20 text-red-300 px-2 py-0.5 border-l-2 border-red-500 line-through">
            - {line}
          </div>
        );
      });
    } else {
      // For unchanged context, we might only want to show the last line if it's before a change,
      // or the first line if it's after a change, to keep it compact.
      // But for simplicity, let's just show up to 2 lines of context.
      const contextLines = lines.length > 2 ? 
        (i < Math.max(...Array.from(changedIndices)) ? lines.slice(-2) : lines.slice(0, 2)) 
        : lines;
        
      contextLines.forEach((line, lineIdx) => {
        result.push(
          <div key={`ctx-${i}-${lineIdx}`} className="text-neutral-400 px-2 py-0.5 border-l-2 border-transparent">
            &nbsp;&nbsp;{line}
          </div>
        );
      });
    }
  });

  if (result.length === 0) {
    return <div className="text-neutral-500 italic px-2">No changes detected.</div>;
  }

  return <div className="flex flex-col gap-0.5">{result}</div>;
}

type Message = {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  thought: string;
  isAudio: boolean;
  isSilence?: boolean;
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

type Folder = {
  id: string;
  name: string;
  createdAt: number;
};

type Note = {
  id: string;
  title: string;
  content: string;
  lastModified: number;
  folderId: string;
};

type NoteEditProposal = {
  noteId: string;
  originalContent: string;
  newContent: string;
  description: string;
};

// Helper to check if text is effectively silent (only punctuation/whitespace/symbols)
const checkIsSilence = (text: string) => {
  if (!text) return true;
  // Remove all non-alphanumeric characters across all languages
  try {
    const cleaned = text.trim().replace(/[^\p{L}\p{N}]/gu, '');
    return cleaned.length === 0;
  } catch (e) {
    // Fallback for environments that don't support unicode property escapes
    const cleaned = text.trim().replace(/[^a-zA-Z0-9]/g, '');
    return cleaned.length === 0;
  }
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
  const [showEditor, setShowEditor] = useState(false);
  const [isNoteSyncing, setIsNoteSyncing] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [isSelectionSyncing, setIsSelectionSyncing] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [showFolderList, setShowFolderList] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [editProposal, setEditProposal] = useState<NoteEditProposal | null>(null);
  const [recentShot, setRecentShot] = useState<string | null>(null);
  const lastSyncedNoteContentRef = useRef<Record<string, string>>({});
  const lastSyncedNoteIdRef = useRef<string | null>(null);
  const [latestGeneratedImage, setLatestGeneratedImage] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
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
  const [selectedThinkingLevel, setSelectedThinkingLevel] = useState<ThinkingLevel>(ThinkingLevel.LOW);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const savedVoice = localStorage.getItem('selectedVoice');
      const savedModel = localStorage.getItem('selectedModel');
      const savedImageModel = localStorage.getItem('selectedImageModel');
      const savedThinkingLevel = localStorage.getItem('selectedThinkingLevel');
      const savedAutoTrim = localStorage.getItem('isAutoTrimEnabled');

      if (savedVoice) setSelectedVoice(savedVoice);
      if (savedModel) setSelectedModel(savedModel);
      if (savedImageModel) setSelectedImageModel(savedImageModel);
      if (savedThinkingLevel) setSelectedThinkingLevel(savedThinkingLevel as ThinkingLevel);
      if (savedAutoTrim) setIsAutoTrimEnabled(savedAutoTrim === 'true');
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem('selectedVoice', selectedVoice);
      localStorage.setItem('selectedModel', selectedModel);
      localStorage.setItem('selectedImageModel', selectedImageModel);
      localStorage.setItem('selectedThinkingLevel', selectedThinkingLevel);
      localStorage.setItem('isAutoTrimEnabled', isAutoTrimEnabled.toString());
    } catch (e) {
      console.error('Failed to save settings', e);
    }
  }, [selectedVoice, selectedModel, selectedImageModel, selectedThinkingLevel, isAutoTrimEnabled]);

  const prevVoiceRef = useRef(selectedVoice);
  const prevModelRef = useRef(selectedModel);
  const prevImageModelRef = useRef(selectedImageModel);
  const prevThinkingLevelRef = useRef(selectedThinkingLevel);
  const prevFolderIdRef = useRef(activeFolderId);

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
  const notesRef = useRef<Note[]>([]);
  const activeNoteIdRef = useRef<string | null>(null);
  const activeFolderIdRef = useRef<string | null>(null);
  const foldersRef = useRef<Folder[]>([]);
  
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
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    foldersRef.current = folders;
  }, [folders]);

  useEffect(() => {
    activeNoteIdRef.current = activeNoteId;
  }, [activeNoteId]);

  useEffect(() => {
    activeFolderIdRef.current = activeFolderId;
  }, [activeFolderId]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [items, savedNotes, savedFolders] = await Promise.all([getGalleryItems(), getNotes(), getFolders()]);
        setGalleryItems(items.sort((a, b) => b.timestamp - a.timestamp));
        
        let currentFolders = savedFolders;
        if (savedFolders.length === 0) {
          const defaultFolder: Folder = {
            id: 'default',
            name: 'General',
            createdAt: Date.now()
          };
          await saveFolder(defaultFolder);
          currentFolders = [defaultFolder];
        }
        setFolders(currentFolders.sort((a, b) => b.createdAt - a.createdAt));
        const initialFolderId = currentFolders[0].id;
        setActiveFolderId(initialFolderId);

        const updatedNotes = savedNotes.map(n => n.folderId ? n : { ...n, folderId: 'default' });
        setNotes(updatedNotes.sort((a, b) => b.lastModified - a.lastModified));
        
        const folderNotes = updatedNotes.filter(n => n.folderId === initialFolderId);
        if (folderNotes.length > 0) {
          setActiveNoteId(folderNotes[0].id);
        }
      } catch (err) {
        console.error('Failed to load data:', err);
      }
    };
    loadData();
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

  const syncNoteWithAI = useCallback((note: Note) => {
    if (!isConnected || !sessionRef.current) return;
    
    setIsNoteSyncing(true);
    sessionRef.current.then((session: any) => {
      const folderName = folders.find(f => f.id === note.folderId)?.name || 'General';
      session.sendRealtimeInput({
        text: `[SYSTEM] Note Update: Folder "${folderName}", Note "${note.title}" (ID: ${note.id})\n\n${note.content}`
      });
      lastSyncedNoteContentRef.current[note.id] = note.content;
      lastSyncedNoteIdRef.current = note.id;
      
      setTimeout(() => setIsNoteSyncing(false), 2000);
    });
  }, [isConnected, folders]);

  // Sync active note with AI after 3s of inactivity or switch
  useEffect(() => {
    if (!isConnected || !activeNoteId) return;
    
    const activeNote = notes.find(n => n.id === activeNoteId);
    if (!activeNote) return;

    // Sync if content changed OR if we switched to a new note
    const contentChanged = lastSyncedNoteContentRef.current[activeNoteId] !== activeNote.content;
    const noteSwitched = lastSyncedNoteIdRef.current !== activeNoteId;

    if (!contentChanged && !noteSwitched) return;

    const timer = setTimeout(() => {
      syncNoteWithAI(activeNote);
    }, 3000);

    return () => clearTimeout(timer);
  }, [notes, activeNoteId, isConnected, syncNoteWithAI]);

  useEffect(() => {
    setSelectedText('');
  }, [activeNoteId]);

  // Sync selected text with AI after 3s of selection
  useEffect(() => {
    if (!isConnected || !selectedText || selectedText.trim().length < 2) return;

    const timer = setTimeout(() => {
      setIsSelectionSyncing(true);
      sessionRef.current?.then((session: any) => {
        session.sendRealtimeInput({
          text: `[SYSTEM] User Selection: The user has selected the following text in their note for context:\n\n"${selectedText}"\n\nPlease keep this selection in mind for your next response.`
        });
        
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'system',
          text: `Sent selection to AI`,
          thought: '',
          isAudio: false,
          isComplete: true,
          timestamp: Date.now()
        }]);

        setTimeout(() => setIsSelectionSyncing(false), 2000);
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, [selectedText, isConnected]);

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

  useEffect(() => {
    setIsSaved(false);
  }, [latestGeneratedImage]);

  const saveToGallery = async (url: string) => {
    if (!url || isSaved) return;
    
    const base64Length = url.length - (url.indexOf(',') + 1);
    const padding = (url.charAt(url.length - 2) === '=') ? 2 : ((url.charAt(url.length - 1) === '=') ? 1 : 0);
    const fileSize = (base64Length * 0.75) - padding;

    const newItem = {
      id: `ai_img_${Date.now()}`,
      type: 'image',
      url: url,
      timestamp: Date.now(),
      resolution: '1024x1024', // Default for AI images
      size: fileSize
    };
    
    await saveGalleryItem(newItem);
    setGalleryItems(prev => [newItem, ...prev]);
    setIsSaved(true);
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

      const createNoteTool = {
        functionDeclarations: [{
          name: 'createNote',
          description: 'Create a new Markdown note.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              title: {
                type: Type.STRING,
                description: 'The title of the new note.'
              },
              content: {
                type: Type.STRING,
                description: 'The initial content of the note.'
              }
            },
            required: ['title', 'content']
          }
        }]
      };

      const editNoteTool = {
        functionDeclarations: [{
          name: 'editNote',
          description: 'Edit a Markdown note. You can replace the entire note, append, prepend, or replace a specific block of text. The user will see a diff and must approve the change.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              noteId: {
                type: Type.STRING,
                description: 'The ID of the note to edit.'
              },
              action: {
                type: Type.STRING,
                enum: ['replace', 'append', 'prepend', 'replace_text'],
                description: 'The type of edit to perform. Use replace_text to replace a specific string with new content (e.g. to insert text at a certain line, replace the original line with the original line + the new line).'
              },
              targetText: {
                type: Type.STRING,
                description: 'The exact text to replace. ONLY required and used when action is replace_text.'
              },
              content: {
                type: Type.STRING,
                description: 'The new content to add, the full content to replace with, or the replacement text for replace_text.'
              },
              description: {
                type: Type.STRING,
                description: 'A brief description of why you are making this edit.'
              }
            },
            required: ['noteId', 'action', 'content', 'description']
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
          const threshold = 0.008; // Less sensitive threshold to avoid noise triggering
          
          if (volume > threshold) {
            if (isSilentRef.current) {
              // User started speaking! New utterance.
              activeUserMessageIdRef.current = Date.now().toString();
              userAudioBufferRef.current = [base64Data];
            } else {
              userAudioBufferRef.current.push(base64Data);
            }
            silenceCounterRef.current = 0;
            isSilentRef.current = false;
          } else {
            silenceCounterRef.current++;
            if (!isSilentRef.current) {
              userAudioBufferRef.current.push(base64Data);
            }
          }

          // Always send to session so model can detect end of turn
          sessionRef.current.then((session: any) => {
            session.sendRealtimeInput({
              audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
            });
          });

          // Silence detection and finalization
          // 2048 samples @ 16kHz is ~128ms per chunk. 15 chunks is ~2 seconds.
          if (silenceCounterRef.current > 15 && !isSilentRef.current) {
            isSilentRef.current = true;
            
            // Finalize the audio for this utterance
            const audioChunks = [...userAudioBufferRef.current];
            userAudioBufferRef.current = []; // Clear buffer after finalization
            
            // Trim silence if enabled
            const finalChunks = isAutoTrimEnabledRef.current ? audioChunks.slice(0, -15) : audioChunks;
            
            // Require at least 8 chunks (~1 second) to be considered a valid message
            if (finalChunks.length >= 8 && activeUserMessageIdRef.current) {
              const audioUrl = createWavUrl(finalChunks, 16000);
              const msgId = activeUserMessageIdRef.current;
              setMessages(prev => {
                const index = prev.findIndex(m => m.id === msgId);
                if (index !== -1) {
                  const msg = prev[index];
                  const nextMessages = [...prev];
                  const isSilence = checkIsSilence(msg.text);
                  nextMessages[index] = { ...msg, audioUrl, isComplete: true, isSilence };
                  return nextMessages;
                } else {
                  return [...prev, { id: msgId, role: 'user', text: '', thought: '', isAudio: true, isSilence: true, isComplete: true, audioUrl }];
                }
              });
            }
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
            
            // Send current notes context immediately
            sessionPromise.then((session: any) => {
              const currentNotes = notesRef.current;
              const activeId = activeNoteIdRef.current;
              const activeNote = currentNotes.find(n => n.id === activeId);
              const activeFolder = foldersRef.current.find(f => f.id === activeFolderIdRef.current) || { name: 'General' };
              
              let contextText = `[SYSTEM] Session started. Current Notes:\n`;
              if (currentNotes.length > 0) {
                contextText += currentNotes.map(n => `ID: ${n.id}\nTitle: ${n.title}\nContent:\n${n.content}`).join('\n---\n');
                if (activeNote) {
                  contextText += `\n\nCURRENT ACTIVE NOTE: Folder "${activeFolder.name}", Note "${activeNote.title}" (ID: ${activeNote.id})`;
                }
              } else {
                contextText += `No notes available.`;
              }
              
              contextText += `\n\nINSTRUCTION: You MUST immediately greet the user by saying EXACTLY "we are in ${activeFolder.name} ${activeNote ? activeNote.title : 'but no note is selected'}". Do not add any other text.`;
              
              session.sendRealtimeInput({ text: contextText });
            });
          },
          onmessage: async (message: LiveServerMessage) => {
            const parts = message.serverContent?.modelTurn?.parts;
            const outputTranscription = message.serverContent?.outputTranscription;
            const turnComplete = message.serverContent?.turnComplete;
            const interrupted = message.serverContent?.interrupted;

            // Helper to finalize user message
            const finalizeUserMessage = () => {
              // Require at least 8 chunks (~1 second) to prevent noise-triggered empty messages
              if (userAudioBufferRef.current.length < 8) {
                userAudioBufferRef.current = [];
                isSilentRef.current = true;
                return;
              }
              
              const audioChunks = [...userAudioBufferRef.current];
              userAudioBufferRef.current = []; // Clear it!
              isSilentRef.current = true;
              
              const msgId = activeUserMessageIdRef.current;
              if (!msgId) return;

              const audioUrl = createWavUrl(audioChunks, 16000);
              
              setMessages(prev => {
                const index = prev.findIndex(m => m.id === msgId);
                if (index !== -1) {
                  const msg = prev[index];
                  const nextMessages = [...prev];
                  const isSilence = checkIsSilence(msg.text);
                  nextMessages[index] = { ...msg, isComplete: true, isSilence, audioUrl: audioUrl || msg.audioUrl };
                  return nextMessages;
                } else {
                  return [...prev, { id: msgId, role: 'user', text: '', thought: '', isAudio: true, isSilence: true, isComplete: true, audioUrl }];
                }
              });
            };

            if (parts) {
              finalizeUserMessage();
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
                    const newText = msg.text + text;
                    const isSilence = checkIsSilence(newText);
                    nextMessages[index] = { ...msg, text: newText, isSilence };
                    return nextMessages;
                  } else {
                    const isSilence = checkIsSilence(text);
                    return [...prev, { id: msgId, role: 'user', text, thought: '', isAudio: true, isSilence, isComplete: false }];
                  }
                } else {
                  // Fallback
                  const newId = Date.now().toString();
                  activeUserMessageIdRef.current = newId;
                  const isSilence = checkIsSilence(text);
                  return [...prev, { id: newId, role: 'user', text, thought: '', isAudio: true, isSilence, isComplete: false }];
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

                if (call.name === 'createNote') {
                  const { title, content } = call.args as any;
                  const newNote: Note = {
                    id: Date.now().toString(),
                    title,
                    content,
                    lastModified: Date.now(),
                    folderId: activeFolderIdRef.current || 'default'
                  };
                  setNotes(prev => [newNote, ...prev]);
                  setActiveNoteId(newNote.id);
                  saveNote(newNote);
                  setShowEditor(true);

                  sessionPromise.then((session: any) => {
                    session.sendRealtimeInput({
                      text: `[SYSTEM] Note Update: "${title}" (ID: ${newNote.id})\n\n${content}`
                    });
                    
                    session.sendToolResponse({
                      functionResponses: [{
                        name: 'createNote',
                        id: call.id,
                        response: { result: `Note "${title}" created successfully with ID ${newNote.id}.` }
                      }]
                    });
                  });
                }

                if (call.name === 'editNote') {
                  const { noteId, action, content, description, targetText } = call.args as any;
                  const note = notesRef.current.find(n => n.id === noteId);
                  if (note) {
                    let newContent = note.content;
                    if (action === 'replace') newContent = content;
                    else if (action === 'append') newContent = note.content + '\n' + content;
                    else if (action === 'prepend') newContent = content + '\n' + note.content;
                    else if (action === 'replace_text' && targetText) {
                      newContent = note.content.replace(targetText, content);
                    }

                    setEditProposal({
                      noteId,
                      originalContent: note.content,
                      newContent,
                      description
                    });
                    setShowEditor(true);

                    sessionPromise.then((session: any) => {
                      session.sendToolResponse({
                        functionResponses: [{
                          name: 'editNote',
                          id: call.id,
                          response: { result: 'Edit proposal sent to user for approval.' }
                        }]
                      });
                    });
                  } else {
                    sessionPromise.then((session: any) => {
                      const availableIds = notesRef.current.map(n => n.id).join(', ');
                      session.sendToolResponse({
                        functionResponses: [{
                          name: 'editNote',
                          id: call.id,
                          response: { error: `Note with ID ${noteId} not found. Available note IDs are: ${availableIds || 'None'}. Please use one of these IDs.` }
                        }]
                      });
                    });
                  }
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
                const index = prev.map(m => m.role === 'model').lastIndexOf(true);
                if (index !== -1) {
                  const lastMsg = prev[index];
                  const newCurrent = (lastMsg.tokens?.current || 0) + (message.usageMetadata?.responseTokenCount || 0);
                  const newTotal = (lastMsg.tokens?.total || 0) + (message.usageMetadata?.totalTokenCount || 0);
                  const nextMessages = [...prev];
                  nextMessages[index] = { 
                    ...lastMsg, 
                    tokens: {
                      current: newCurrent,
                      total: newTotal
                    }
                  };
                  return nextMessages;
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
          systemInstruction: `You are a helpful assistant. You can see the user if they enable their camera. You can also think before you speak. You have tools to generate or edit images, control the camera, show/hide the transcription, and manage Markdown notes. 

If the user uploads an image and asks to change, edit, or modify it, use the 'generateImage' tool. 
If the user asks to open/enable or close/disable the camera, use the 'setCameraState' tool. 
If the user asks to show or hide the transcription/text history, use the 'setTranscriptionState' tool.
If the user asks to create a new note, use the 'createNote' tool.
If the user asks to update, change, or add to their existing notes, use the 'editNote' tool. You MUST use the exact ID provided in the 'Current Notes' section or in a '[SYSTEM] Note Update' message.

When you receive a message starting with '[SYSTEM] Note Update', it means the user has updated or switched to a different note. This note is now the CURRENT ACTIVE NOTE. You MUST respond by saying EXACTLY "we are in {folder name} {note name}". Do not add any other text, commentary, or prefixes.

When you receive a message starting with '[SYSTEM] User Selection', it means the user has highlighted text for your context. Respond ONLY by repeating the selected text exactly as it was provided. Do not add any other text, commentary, or prefixes.

Current Notes:
${notes.filter(n => n.folderId === (activeFolderId || 'default')).length > 0 ? notes.filter(n => n.folderId === (activeFolderId || 'default')).map(n => `ID: ${n.id}\nTitle: ${n.title}\nContent:\n${n.content}`).join('\n---\n') : 'No notes available.'}
Active Note ID: ${activeNoteId || 'None'}`,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          thinkingConfig: { thinkingLevel: selectedThinkingLevel },
          tools: [generateImageTool, setCameraStateTool, setTranscriptionStateTool, editNoteTool, createNoteTool],
        },
      });

      sessionRef.current = sessionPromise;
    } catch (err) {
      console.error("Connection error:", err);
      handleDisconnect(false);
    }
  }, [isConnecting, isConnected, selectedModel, selectedVoice, selectedImageModel, selectedThinkingLevel, handleDisconnect, startVideo, stopVideo]);

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

  // Auto-reconnect when voice, model, image model, thinking level, or folder changes while connected
  useEffect(() => {
    const voiceChanged = prevVoiceRef.current !== selectedVoice;
    const modelChanged = prevModelRef.current !== selectedModel;
    const imageModelChanged = prevImageModelRef.current !== selectedImageModel;
    const thinkingLevelChanged = prevThinkingLevelRef.current !== selectedThinkingLevel;
    const folderChanged = prevFolderIdRef.current !== activeFolderId;

    if (isConnected && (voiceChanged || modelChanged || imageModelChanged || thinkingLevelChanged || folderChanged)) {
      handleDisconnect(true);
      const timeout = setTimeout(() => {
        connectRef.current();
      }, 500);
      
      prevVoiceRef.current = selectedVoice;
      prevModelRef.current = selectedModel;
      prevImageModelRef.current = selectedImageModel;
      prevThinkingLevelRef.current = selectedThinkingLevel;
      prevFolderIdRef.current = activeFolderId;
      return () => clearTimeout(timeout);
    }

    prevVoiceRef.current = selectedVoice;
    prevModelRef.current = selectedModel;
    prevImageModelRef.current = selectedImageModel;
    prevThinkingLevelRef.current = selectedThinkingLevel;
    prevFolderIdRef.current = activeFolderId;
  }, [selectedVoice, selectedModel, selectedImageModel, selectedThinkingLevel, activeFolderId, isConnected, handleDisconnect]);

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
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLatestGeneratedImage(null);
              }}
              className="absolute top-1 left-1 z-50 p-1 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
              title="Dismiss"
            >
              <X className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                saveToGallery(latestGeneratedImage);
              }}
              className={`absolute top-1 right-1 z-50 p-1 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all ${
                isSaved ? 'bg-green-500 opacity-100' : 'bg-black/50 hover:bg-blue-500'
              }`}
              title={isSaved ? "Saved to Gallery" : "Save to Gallery"}
              disabled={isSaved}
            >
              {isSaved ? <Check className="w-3 h-3" /> : <Bookmark className="w-3 h-3" />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const a = document.createElement('a');
                a.href = latestGeneratedImage;
                a.download = `ai_image_${Date.now()}.png`;
                a.click();
              }}
              className="absolute bottom-1 right-1 z-50 p-1 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-500"
              title="Download"
            >
              <Download className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!pendingImages.includes(latestGeneratedImage)) {
                  setPendingImages(prev => [...prev, latestGeneratedImage]);
                }
              }}
              className="absolute bottom-1 left-1 z-50 p-1 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-500"
              title="Use as Reference"
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const response = await fetch(latestGeneratedImage);
                  const blob = await response.blob();
                  await navigator.clipboard.write([
                    new ClipboardItem({ [blob.type]: blob })
                  ]);
                } catch (err) {
                  console.error('Failed to copy image:', err);
                }
              }}
              className="absolute bottom-1 left-1/2 -translate-x-1/2 z-50 p-1 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-500"
              title="Copy to Clipboard"
            >
              <MessageSquare className="w-3 h-3" />
            </button>
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
              <div className="absolute top-4 right-4 flex gap-2">
                <button
                  onClick={async () => {
                    try {
                      const response = await fetch(latestGeneratedImage);
                      const blob = await response.blob();
                      await navigator.clipboard.write([
                        new ClipboardItem({ [blob.type]: blob })
                      ]);
                      alert('Image copied to clipboard!');
                    } catch (err) {
                      console.error('Failed to copy image:', err);
                      alert('Failed to copy image to clipboard.');
                    }
                  }}
                  className="p-3 bg-black/50 hover:bg-blue-500 text-white rounded-full backdrop-blur-md transition-all"
                  title="Copy to Clipboard"
                >
                  <MessageSquare className="w-6 h-6" />
                </button>
                <button
                  onClick={() => {
                    if (!pendingImages.includes(latestGeneratedImage)) {
                      setPendingImages(prev => [...prev, latestGeneratedImage]);
                    }
                  }}
                  className="p-3 bg-black/50 hover:bg-blue-500 text-white rounded-full backdrop-blur-md transition-all"
                  title="Use as Reference"
                >
                  <Plus className="w-6 h-6" />
                </button>
                <button
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = latestGeneratedImage;
                    a.download = `ai_image_${Date.now()}.png`;
                    a.click();
                  }}
                  className="p-3 bg-black/50 hover:bg-blue-500 text-white rounded-full backdrop-blur-md transition-all"
                  title="Download"
                >
                  <Download className="w-6 h-6" />
                </button>
                <button
                  onClick={() => saveToGallery(latestGeneratedImage)}
                  className={`p-3 rounded-full text-white backdrop-blur-md transition-all ${
                    isSaved ? 'bg-green-500' : 'bg-black/50 hover:bg-blue-500'
                  }`}
                  title={isSaved ? "Saved to Gallery" : "Save to Gallery"}
                  disabled={isSaved}
                >
                  {isSaved ? <Check className="w-6 h-6" /> : <Bookmark className="w-6 h-6" />}
                </button>
                <button
                  onClick={() => {
                    setLatestGeneratedImage(null);
                    setShowLargeGeneratedImage(false);
                  }}
                  className="p-3 bg-black/50 hover:bg-red-500 text-white rounded-full backdrop-blur-md transition-all"
                  title="Dismiss Image"
                >
                  <Trash2 className="w-6 h-6" />
                </button>
                <button
                  onClick={() => setShowLargeGeneratedImage(false)}
                  className="p-3 bg-black/50 hover:bg-black/80 text-white rounded-full backdrop-blur-md transition-colors"
                  title="Close"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
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

      {/* Settings Panel is now handled in the bottom toolbar area */}

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
                if (msg.role === 'system') {
                  return (
                    <motion.div 
                      key={msg.id} 
                      layout
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-center"
                    >
                      <div className="bg-blue-500/10 text-blue-400 text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border border-blue-400/20 flex items-center gap-2">
                        <History className="w-3 h-3" />
                        {msg.text}
                      </div>
                    </motion.div>
                  );
                }

                const hasVisibleContent = showTranscription;
                if (!hasVisibleContent || msg.isSilence) return null;

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
                              <div className="absolute top-3 right-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex gap-2">
                                <button
                                  onClick={async () => {
                                    try {
                                      const response = await fetch(msg.imageUrl!);
                                      const blob = await response.blob();
                                      await navigator.clipboard.write([
                                        new ClipboardItem({ [blob.type]: blob })
                                      ]);
                                      alert('Image copied to clipboard!');
                                    } catch (err) {
                                      console.error('Failed to copy image:', err);
                                      alert('Failed to copy image to clipboard.');
                                    }
                                  }}
                                  className="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-blue-600 transition-all border border-white/10"
                                  title="Copy to Clipboard"
                                >
                                  <MessageSquare className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => saveToGallery(msg.imageUrl!)}
                                  className="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-blue-600 transition-all border border-white/10"
                                  title="Save to Gallery"
                                >
                                  <Bookmark className="w-4 h-4" />
                                </button>
                              </div>
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
                            <div className="mt-2 text-[10px] flex gap-3 border-t border-neutral-700/50 pt-2 uppercase tracking-wider font-mono">
                              <span className="flex items-center gap-1">
                                <span className="text-neutral-500">Tokens:</span>
                                <span className="text-blue-400 font-bold">{(msg.tokens.current || 0).toLocaleString()}</span>
                              </span>
                              <span className="flex items-center gap-1">
                                <span className="text-neutral-500">Context:</span>
                                <span className="text-neutral-300 font-bold">{(msg.tokens.total || 0).toLocaleString()}</span>
                              </span>
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
                                <div key={idx} className="relative w-24 h-24 rounded-lg overflow-hidden border border-blue-400/30 group/img">
                                  <Image 
                                    src={img} 
                                    alt={`User upload ${idx}`} 
                                    fill 
                                    className="object-cover" 
                                    unoptimized
                                  />
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        const response = await fetch(img);
                                        const blob = await response.blob();
                                        await navigator.clipboard.write([
                                          new ClipboardItem({ [blob.type]: blob })
                                        ]);
                                        alert('Image copied to clipboard!');
                                      } catch (err) {
                                        console.error('Failed to copy image:', err);
                                        alert('Failed to copy image to clipboard.');
                                      }
                                    }}
                                    className="absolute top-1 right-1 z-20 opacity-0 group-hover/img:opacity-100 transition-opacity p-1 bg-black/60 rounded-full text-white hover:bg-blue-600"
                                    title="Copy to Clipboard"
                                  >
                                    <MessageSquare className="w-3 h-3" />
                                  </button>
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

              {/* Silence Audio Group */}
              {showTranscription && messages.some(m => m.isSilence) && (
                <motion.div 
                  key="silence-group"
                  layout
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="flex justify-end"
                >
                  <div className="rounded-2xl px-4 py-3 text-sm shadow-lg backdrop-blur-md w-[80vw] bg-blue-600/90 text-white rounded-br-sm border border-blue-500/30">
                    <details className="group">
                      <summary className="cursor-pointer text-blue-200 hover:text-white select-none text-xs font-medium uppercase tracking-wider flex items-center gap-1">
                        <span className="group-open:hidden">▶</span>
                        <span className="hidden group-open:inline">▼</span>
                        <Mic className="w-3 h-3" /> Silence Audio ({messages.filter(m => m.isSilence).length})
                      </summary>
                      <div className="mt-2 space-y-2 max-h-60 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                        {messages.filter(m => m.isSilence).map((msg) => (
                          <div key={msg.id} className="bg-black/20 rounded-xl p-2 border border-white/5 shadow-inner">
                            <audio controls src={msg.audioUrl} className="h-8 w-full opacity-80 hover:opacity-100 transition-opacity" />
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Area: Input + Controls */}
        <div className="p-4 bg-neutral-950/80 backdrop-blur-xl border-t border-neutral-800/50 flex flex-col gap-4 relative">
          {/* Gallery Panel (Moved here to be above toolbar) */}
          <AnimatePresence>
            {showGallery && (
              <motion.div 
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                className="absolute bottom-full left-0 right-0 z-50 mb-4 mx-2 bg-neutral-900/95 backdrop-blur-xl border border-neutral-800 rounded-3xl shadow-2xl max-h-[70vh] overflow-hidden flex flex-col"
              >
                <div className="p-6 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50 backdrop-blur-xl">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <ImageIcon className="w-5 h-5 text-blue-400" />
                      Media Gallery
                    </h2>
                    <p className="text-xs text-neutral-500 mt-1">Photos and videos captured during your session</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {galleryItems.length > 0 && (
                      <>
                        <button 
                          onClick={() => {
                            galleryItems.forEach(item => {
                              const a = document.createElement('a');
                              a.href = item.url;
                              a.download = `${item.type}_${item.id}.${item.type === 'image' ? 'jpg' : 'webm'}`;
                              a.click();
                            });
                          }}
                          className="p-2 rounded-full hover:bg-blue-500/20 text-blue-400 transition-all flex items-center gap-2 text-xs font-medium"
                          title="Download All"
                        >
                          <Download className="w-4 h-4" />
                          <span className="hidden sm:inline">Download All</span>
                        </button>
                        <button 
                          onClick={async () => {
                            if (confirm('Are you sure you want to clear all gallery items?')) {
                              for (const item of galleryItems) {
                                await deleteGalleryItem(item.id);
                              }
                              setGalleryItems([]);
                            }
                          }}
                          className="p-2 rounded-full hover:bg-red-500/20 text-red-500 transition-all flex items-center gap-2 text-xs font-medium"
                          title="Clear All"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="hidden sm:inline">Clear All</span>
                        </button>
                      </>
                    )}
                    <button 
                      onClick={() => setShowGallery(false)}
                      className="p-2 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-all"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
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
                              onClick={(e) => {
                                e.stopPropagation();
                                if (item.type === 'image' && !pendingImages.includes(item.url)) {
                                  setPendingImages(prev => [...prev, item.url]);
                                  setShowGallery(false);
                                }
                              }}
                              className="p-3 rounded-full bg-blue-600/80 text-white hover:bg-blue-500 transition-colors backdrop-blur-sm"
                              title="Add to Input"
                            >
                              <Plus className="w-5 h-5" />
                            </button>
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
            )}
          </AnimatePresence>

      {/* Settings Panel (Moved here to be above toolbar) */}
          <AnimatePresence>
            {isSettingsOpen && (
              <motion.div 
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                className="absolute bottom-full left-0 right-0 z-50 mb-4 mx-2 bg-neutral-900/95 backdrop-blur-xl border border-neutral-800 rounded-3xl shadow-2xl max-h-[70vh] overflow-hidden flex flex-col"
              >
                <div className="p-6 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50 backdrop-blur-xl">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <Settings className="w-5 h-5 text-blue-400" />
                      Settings
                    </h2>
                    <p className="text-xs text-neutral-500 mt-1">Configure your session and models</p>
                  </div>
                  <button 
                    onClick={() => setIsSettingsOpen(false)}
                    className="p-2 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-all"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                
                <div className="p-6 overflow-y-auto custom-scrollbar">
                  <div className="space-y-6 max-w-2xl mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-neutral-400 mb-2">Model</label>
                        <select 
                          value={selectedModel}
                          onChange={(e) => setSelectedModel(e.target.value)}
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        >
                          <option value="gemini-2.5-flash-native-audio-preview-12-2025">Gemini 2.5 Flash Native Audio</option>
                          <option value="gemini-3.1-flash-live-preview">Gemini 3.1 Flash Live Preview</option>
                          <option value="gemini-3.1-flash-preview">Gemini 3.1 Flash Preview</option>
                          <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
                        </select>
                        <p className="text-[10px] text-neutral-500 mt-2 uppercase tracking-wider">Session will restart on change</p>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-neutral-400 mb-2">Voice</label>
                        <select 
                          value={selectedVoice}
                          onChange={(e) => setSelectedVoice(e.target.value)}
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        >
                          <option value="Puck">Puck</option>
                          <option value="Charon">Charon</option>
                          <option value="Kore">Kore</option>
                          <option value="Fenrir">Fenrir</option>
                          <option value="Zephyr">Zephyr</option>
                        </select>
                        <p className="text-[10px] text-neutral-500 mt-2 uppercase tracking-wider">Session will restart on change</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-neutral-400 mb-2">Thinking Level</label>
                        <select 
                          value={selectedThinkingLevel}
                          onChange={(e) => setSelectedThinkingLevel(e.target.value as ThinkingLevel)}
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        >
                          <option value={ThinkingLevel.MINIMAL}>None</option>
                          <option value={ThinkingLevel.LOW}>Low</option>
                          <option value={ThinkingLevel.THINKING_LEVEL_UNSPECIFIED}>Medium (Default)</option>
                          <option value={ThinkingLevel.HIGH}>High</option>
                        </select>
                        <p className="text-[10px] text-neutral-500 mt-2 uppercase tracking-wider">Session will restart on change</p>
                      </div>
                    </div>
                    
                    <div className="pt-6 border-t border-neutral-800">
                      <label className="block text-sm font-medium text-neutral-400 mb-2">Image Model</label>
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
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                      >
                        <option value="gemini-2.5-flash-image">Nano Banana (2.5 Flash)</option>
                        <option value="gemini-3.1-flash-image-preview">Banana 2 (3.1 Flash)</option>
                        <option value="gemini-3-pro-image-preview">Banana Pro (3 Pro)</option>
                      </select>
                      <div className="mt-2 p-3 bg-neutral-950/50 rounded-lg border border-neutral-800/50">
                        <p className="text-xs text-neutral-500">
                          Select model for image generation. 
                          {(selectedImageModel === 'gemini-3.1-flash-image-preview' || selectedImageModel === 'gemini-3-pro-image-preview') && (
                            <span className="block text-blue-400 mt-1 font-medium">
                              Requires paid API key. See <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-300">billing docs</a>.
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-neutral-950/50 rounded-2xl border border-neutral-800/50">
                      <div>
                        <label className="block text-sm font-medium text-neutral-200">Auto Trim Silence</label>
                        <p className="text-xs text-neutral-500">Removes silences longer than 3s from saved recordings.</p>
                      </div>
                      <button 
                        onClick={() => setIsAutoTrimEnabled(!isAutoTrimEnabled)}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all focus:outline-none ${isAutoTrimEnabled ? 'bg-blue-600' : 'bg-neutral-700'}`}
                      >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${isAutoTrimEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>

                    <div className="pt-4 flex justify-end">
                      <button 
                        onClick={() => setIsSettingsOpen(false)}
                        className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
              onClick={() => setShowGallery(!showGallery)}
              className={`p-3 rounded-full transition-all duration-300 flex items-center justify-center relative ${
                showGallery 
                  ? 'bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/20' 
                  : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
              }`}
              title="Gallery"
            >
              <ImageIcon className="w-5 h-5" />
              {galleryItems.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-blue-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-black min-w-[18px] text-center">
                  {galleryItems.length}
                </span>
              )}
            </button>

            <button 
              onClick={() => setShowEditor(!showEditor)}
              className={`p-3 rounded-full transition-all duration-300 flex items-center justify-center relative ${
                showEditor 
                  ? 'bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/20' 
                  : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
              }`}
              title="Markdown Notes"
            >
              <FileText className="w-5 h-5" />
              {notes.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-blue-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-black min-w-[18px] text-center">
                  {notes.length}
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
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={`p-3 rounded-full transition-all duration-300 flex items-center justify-center ${
                isSettingsOpen 
                  ? 'bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/20' 
                  : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
              }`}
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

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
                  onClick={() => {
                    if (selectedGalleryItem.type === 'image' && !pendingImages.includes(selectedGalleryItem.url)) {
                      setPendingImages(prev => [...prev, selectedGalleryItem.url]);
                      setSelectedGalleryItem(null);
                      setShowGallery(false);
                    }
                  }}
                  className="p-3 rounded-full bg-blue-600 text-white hover:bg-blue-500 transition-all"
                  title="Add to Input"
                >
                  <Plus className="w-5 h-5" />
                </button>
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
      {/* Markdown Editor Modal */}
      <AnimatePresence>
        {showEditor && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={() => setShowEditor(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-neutral-900 border border-white/10 w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Tabs */}
              <div className="flex items-center bg-black/40 border-b border-white/10 relative">
                {/* Folder Selector */}
                <div className="relative shrink-0 border-r border-white/10">
                  <button 
                    onClick={() => setShowFolderList(!showFolderList)}
                    className={`flex items-center gap-2 px-4 py-3 transition-all hover:scale-[1.02] active:scale-[0.98] ${showFolderList ? 'bg-blue-600/20 text-blue-400' : 'text-neutral-400 hover:bg-white/5'}`}
                    title="Folders"
                  >
                    <Folder className="w-4 h-4" />
                    <span className="text-sm font-bold max-w-[80px] truncate">
                      {folders.find(f => f.id === activeFolderId)?.name || 'Folders'}
                    </span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${showFolderList ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {showFolderList && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute top-full left-0 w-64 bg-neutral-900 border border-white/10 shadow-2xl z-50 rounded-b-xl overflow-hidden"
                      >
                        <div className="p-2 border-b border-white/5 bg-black/20 flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold px-2">Your Folders</span>
                          <button 
                            onClick={() => setIsCreatingFolder(true)}
                            className="p-1 hover:bg-blue-600/20 text-blue-400 rounded transition-colors"
                            title="New Folder"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="max-h-64 overflow-y-auto py-1">
                          {isCreatingFolder ? (
                            <div className="px-4 py-2 flex items-center gap-2 border-b border-white/5">
                              <input
                                autoFocus
                                type="text"
                                value={newFolderName}
                                onChange={e => setNewFolderName(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && newFolderName.trim()) {
                                    const newFolder: Folder = { id: Date.now().toString(), name: newFolderName.trim(), createdAt: Date.now() };
                                    setFolders(prev => [newFolder, ...prev]);
                                    saveFolder(newFolder);
                                    setActiveFolderId(newFolder.id);
                                    setNewFolderName('');
                                    setIsCreatingFolder(false);
                                  } else if (e.key === 'Escape') {
                                    setNewFolderName('');
                                    setIsCreatingFolder(false);
                                  }
                                }}
                                placeholder="Folder name..."
                                className="flex-1 bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500 min-w-0"
                              />
                              <button
                                onClick={() => {
                                  if (newFolderName.trim()) {
                                    const newFolder: Folder = { id: Date.now().toString(), name: newFolderName.trim(), createdAt: Date.now() };
                                    setFolders(prev => [newFolder, ...prev]);
                                    saveFolder(newFolder);
                                    setActiveFolderId(newFolder.id);
                                    setNewFolderName('');
                                    setIsCreatingFolder(false);
                                  }
                                }}
                                className="p-1 text-green-400 hover:bg-green-400/20 rounded shrink-0"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => {
                                  setNewFolderName('');
                                  setIsCreatingFolder(false);
                                }}
                                className="p-1 text-neutral-400 hover:bg-white/10 rounded shrink-0"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => setIsCreatingFolder(true)}
                              className="w-full text-left px-4 py-2 text-sm cursor-pointer flex items-center gap-2 text-blue-400 hover:bg-blue-600/10 transition-colors border-b border-white/5"
                            >
                              <Plus className="w-3 h-3" />
                              <span className="font-medium">Create New Folder</span>
                            </button>
                          )}
                          {folders.map(folder => (
                            <div 
                              key={folder.id}
                              onClick={() => {
                                setActiveFolderId(folder.id);
                                setShowFolderList(false);
                                // Filter notes for this folder and set active note
                                const folderNotes = notes.filter(n => n.folderId === folder.id);
                                if (folderNotes.length > 0) {
                                  setActiveNoteId(folderNotes[0].id);
                                } else {
                                  setActiveNoteId(null);
                                }
                                // Reconnect to update AI context
                                handleDisconnect(true);
                              }}
                              className={`px-4 py-2 text-sm cursor-pointer flex items-center justify-between group transition-colors ${
                                activeFolderId === folder.id ? 'bg-blue-600/10 text-blue-400' : 'text-neutral-400 hover:bg-white/5'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <Folder className="w-3 h-3 opacity-50" />
                                <span className="truncate">{folder.name}</span>
                              </div>
                              {folder.id !== 'default' && (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm(`Delete folder "${folder.name}" and all its notes?`)) {
                                      const newFolders = folders.filter(f => f.id !== folder.id);
                                      setFolders(newFolders);
                                      deleteFolder(folder.id);
                                      // Also delete notes in this folder
                                      const notesToDelete = notes.filter(n => n.folderId === folder.id);
                                      notesToDelete.forEach(n => deleteNote(n.id));
                                      setNotes(prev => prev.filter(n => n.folderId !== folder.id));
                                      if (activeFolderId === folder.id) {
                                        setActiveFolderId('default');
                                      }
                                    }
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition-opacity"
                                >
                                  <Trash2 className="w-3 h-3 text-red-400" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Note Tabs */}
                <div className="flex-1 flex items-center overflow-x-auto scrollbar-hide">
                  {notes.filter(n => n.folderId === activeFolderId).map(note => (
                    <div 
                      key={note.id}
                      onClick={() => setActiveNoteId(note.id)}
                      className={`flex items-center gap-2 px-4 py-3 cursor-pointer border-r border-white/5 transition-colors min-w-[120px] max-w-[200px] shrink-0 group ${
                        activeNoteId === note.id ? 'bg-blue-600/10 text-blue-400' : 'text-neutral-400 hover:bg-white/5'
                      }`}
                    >
                      <FileText className="w-4 h-4 shrink-0" />
                      <span className="text-sm font-medium truncate flex-1">{note.title}</span>
                      {activeNoteId === note.id && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            const newNotes = notes.filter(n => n.id !== note.id);
                            setNotes(newNotes);
                            deleteNote(note.id);
                            if (activeNoteId === note.id) {
                              setActiveNoteId(newNotes.length > 0 ? newNotes[0].id : null);
                            }
                          }}
                          className="p-1 hover:bg-red-500/20 rounded transition-colors shrink-0"
                        >
                          <X className="w-3 h-3 text-red-400" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button 
                    onClick={() => {
                      const newNote: Note = {
                        id: Date.now().toString(),
                        title: 'Untitled Note',
                        content: '',
                        lastModified: Date.now(),
                        folderId: activeFolderId || 'default'
                      };
                      setNotes(prev => [newNote, ...prev]);
                      setActiveNoteId(newNote.id);
                      saveNote(newNote);
                    }}
                    className="shrink-0 p-3 text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
                    title="New Note"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="shrink-0 ml-auto px-4 flex items-center gap-4 border-l border-white/10">
                  <AnimatePresence>
                    {isNoteSyncing ? (
                      <motion.div 
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="flex items-center justify-center text-blue-400 bg-blue-400/10 p-2 rounded-full border border-blue-400/20"
                        title="Syncing..."
                      >
                        <History className="w-4 h-4 animate-spin" />
                      </motion.div>
                    ) : (
                      isConnected && activeNoteId && (
                          <button 
                            onClick={() => {
                              const note = notes.find(n => n.id === activeNoteId);
                              if (note) syncNoteWithAI(note);
                            }}
                            className="flex items-center justify-center text-neutral-400 hover:text-blue-400 bg-white/5 hover:bg-blue-400/10 p-2 rounded-full border border-white/10 hover:border-blue-400/20 transition-all"
                            title="Sync with AI now"
                          >
                            <History className="w-4 h-4" />
                          </button>
                      )
                    )}
                  </AnimatePresence>
                  <button 
                    onClick={() => setShowEditor(false)}
                    className="p-2 text-neutral-400 hover:text-white transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Editor Content */}
              <div className="flex-1 flex flex-col p-6 overflow-hidden relative">
                {activeNoteId ? (
                  <>
                    <input 
                      type="text"
                      value={notes.find(n => n.id === activeNoteId)?.title || ''}
                      onChange={(e) => {
                        const newNotes = notes.map(n => n.id === activeNoteId ? { ...n, title: e.target.value, lastModified: Date.now() } : n);
                        setNotes(newNotes);
                        saveNote(newNotes.find(n => n.id === activeNoteId)!);
                      }}
                      className="bg-transparent text-2xl font-bold text-white mb-4 outline-none border-b border-transparent focus:border-blue-500/50 pb-2 transition-colors"
                      placeholder="Note Title"
                    />
                    <MarkdownEditor 
                      content={notes.find(n => n.id === activeNoteId)?.content || ''}
                      onChange={(newContent) => {
                        const newNotes = notes.map(n => n.id === activeNoteId ? { ...n, content: newContent, lastModified: Date.now() } : n);
                        setNotes(newNotes);
                        saveNote(newNotes.find(n => n.id === activeNoteId)!);
                      }}
                      onSelect={(text) => {
                        setSelectedText(text);
                      }}
                      placeholder="Write your Markdown note here..."
                    />
                    <AnimatePresence>
                      {isSelectionSyncing && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.9, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: 10 }}
                          className="absolute bottom-10 right-10 z-30 bg-blue-600/90 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-full border border-blue-400/30 flex items-center gap-2 shadow-2xl backdrop-blur-md"
                        >
                          <Eye className="w-4 h-4" />
                          AI is reading selection...
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 gap-4">
                    <FileText className="w-16 h-16 opacity-20" />
                    <p>No notes yet. Create one to get started!</p>
                    <button 
                      onClick={() => {
                        const newNote: Note = {
                          id: Date.now().toString(),
                          title: 'Untitled Note',
                          content: '',
                          lastModified: Date.now(),
                          folderId: activeFolderId || 'default'
                        };
                        setNotes([newNote]);
                        setActiveNoteId(newNote.id);
                        saveNote(newNote);
                      }}
                      className="px-6 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-500 transition-colors"
                    >
                      Create First Note
                    </button>
                  </div>
                )}

                {/* Edit Proposal Overlay */}
                <AnimatePresence>
                  {editProposal && (
                    <motion.div 
                      initial={{ opacity: 0, y: 50 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 50 }}
                      className="absolute inset-x-0 bottom-0 bg-neutral-900 border-t border-blue-500/30 p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-20"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                            <Edit3 className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <h3 className="text-white font-bold">AI Edit Proposal</h3>
                            <p className="text-xs text-neutral-400">{editProposal.description}</p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <button 
                            onClick={() => setEditProposal(null)}
                            className="p-3 rounded-full bg-neutral-800 text-white hover:bg-neutral-700 transition-colors shadow-lg active:scale-95"
                            title="Discard"
                          >
                            <X className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => {
                              const newNotes = notes.map(n => n.id === editProposal.noteId ? { ...n, content: editProposal.newContent, lastModified: Date.now() } : n);
                              setNotes(newNotes);
                              saveNote(newNotes.find(n => n.id === editProposal.noteId)!);
                              setEditProposal(null);
                            }}
                            className="p-3 rounded-full bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/20 active:scale-95"
                            title="Apply Changes"
                          >
                            <Check className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                      <div className="bg-black/40 rounded-xl p-4 max-h-[30vh] overflow-y-auto font-mono text-sm whitespace-pre-wrap leading-relaxed border border-white/5">
                        {renderDiff(editProposal.originalContent, editProposal.newContent)}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

