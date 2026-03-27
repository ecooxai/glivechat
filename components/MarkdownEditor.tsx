'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Music, Film, ExternalLink, Image as ImageIcon } from 'lucide-react';

interface MarkdownEditorProps {
  content: string;
  onChange: (newContent: string) => void;
  onSelect?: (text: string) => void;
  placeholder?: string;
}

export default function MarkdownEditor({ content, onChange, onSelect, placeholder }: MarkdownEditorProps) {
  const [focusedLineIndex, setFocusedLineIndex] = useState<number | null>(null);
  const lines = useMemo(() => (content || '').split('\n'), [content]);
  const inputRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  const handleLineChange = (index: number, newText: string) => {
    const newLines = [...lines];
    newLines[index] = newText;
    onChange(newLines.join('\n'));
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const newLines = [...lines];
      const cursorPosition = e.currentTarget.selectionStart;
      const currentLineText = newLines[index];
      const beforeCursor = currentLineText.substring(0, cursorPosition);
      const afterCursor = currentLineText.substring(cursorPosition);
      
      newLines[index] = beforeCursor;
      newLines.splice(index + 1, 0, afterCursor);
      
      onChange(newLines.join('\n'));
      setFocusedLineIndex(index + 1);
    } else if (e.key === 'Backspace' && e.currentTarget.selectionStart === 0 && index > 0) {
      e.preventDefault();
      const newLines = [...lines];
      const currentLineText = newLines[index];
      const prevLineText = newLines[index - 1];
      const newPrevLineText = prevLineText + currentLineText;
      
      newLines[index - 1] = newPrevLineText;
      newLines.splice(index, 1);
      
      onChange(newLines.join('\n'));
      setFocusedLineIndex(index - 1);
      
      // Set cursor at the end of the previous line
      setTimeout(() => {
        const input = inputRefs.current[index - 1];
        if (input) {
          input.selectionStart = prevLineText.length;
          input.selectionEnd = prevLineText.length;
        }
      }, 0);
    } else if (e.key === 'ArrowUp') {
      if (e.currentTarget.selectionStart === 0 && index > 0) {
        e.preventDefault();
        setFocusedLineIndex(index - 1);
      }
    } else if (e.key === 'ArrowDown') {
      if (e.currentTarget.selectionStart === lines[index].length && index < lines.length - 1) {
        e.preventDefault();
        setFocusedLineIndex(index + 1);
      }
    }
  };

  useEffect(() => {
    if (focusedLineIndex !== null && inputRefs.current[focusedLineIndex]) {
      inputRefs.current[focusedLineIndex]?.focus();
      // Adjust height
      const target = inputRefs.current[focusedLineIndex];
      if (target) {
        target.style.height = 'auto';
        target.style.height = target.scrollHeight + 'px';
      }
    }
  }, [focusedLineIndex]);

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (selection) {
        const text = selection.toString();
        // Only trigger if we're not inside a textarea (which is handled by its own onSelect)
        if (document.activeElement?.tagName !== 'TEXTAREA') {
          if (onSelect) onSelect(text);
        }
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [onSelect]);

  if (!content && focusedLineIndex === null) {
    return (
      <div 
        className="flex-1 p-2 text-neutral-500 cursor-text italic"
        onClick={() => setFocusedLineIndex(0)}
      >
        {placeholder || 'Click to start writing...'}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-0.5">
      {lines.map((line, index) => (
        <div 
          key={index} 
          className={`relative min-h-[1.5rem] group transition-all duration-200 ${focusedLineIndex === index ? 'bg-white/5 rounded-lg' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setFocusedLineIndex(index);
          }}
        >
          {focusedLineIndex === index ? (
            <textarea
              ref={el => { inputRefs.current[index] = el; }}
              value={line}
              onChange={(e) => handleLineChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onBlur={() => {
                // We don't want to blur if we're clicking another line
                // But we need to allow the click to register
                setTimeout(() => {
                   // Only blur if the active element is not one of our inputs
                   if (!inputRefs.current.includes(document.activeElement as HTMLTextAreaElement)) {
                     setFocusedLineIndex(null);
                   }
                }, 150);
              }}
              onSelect={(e) => {
                const target = e.target as HTMLTextAreaElement;
                const text = target.value.substring(target.selectionStart, target.selectionEnd);
                if (onSelect) onSelect(text);
              }}
              className="w-full bg-transparent text-white outline-none border-none resize-none font-mono text-sm leading-relaxed p-2 block"
              rows={1}
              autoFocus
              style={{ height: 'auto', overflow: 'hidden' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = target.scrollHeight + 'px';
              }}
            />
          ) : (
            <div className="prose prose-invert prose-sm max-w-none p-2 hover:bg-white/5 rounded-lg transition-all cursor-text min-h-[1.5rem] break-words">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]} 
                rehypePlugins={[rehypeRaw]}
                components={{
                  p: ({ children }) => <span className="m-0">{children}</span>,
                  iframe: ({ node, ...props }) => (
                    <div className="my-4 rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-black">
                      <iframe {...props} className="w-full aspect-video" />
                    </div>
                  ),
                  audio: ({ node, ...props }) => (
                    <div className="my-4 p-4 bg-neutral-800/50 rounded-2xl border border-white/10 flex items-center gap-4">
                      <Music className="w-6 h-6 text-blue-400" />
                      <audio {...props} controls className="flex-1 h-8" />
                    </div>
                  ),
                  video: ({ node, ...props }) => (
                    <div className="my-4 rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-black">
                      <video {...props} controls className="w-full max-h-[500px]" />
                    </div>
                  ),
                  img: ({ node, ...props }) => (
                    <div className="my-4 relative group inline-block">
                      <img {...props} className="max-w-full rounded-2xl border border-white/10 shadow-xl" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl pointer-events-none">
                        <ImageIcon className="w-8 h-8 text-white/50" />
                      </div>
                    </div>
                  ),
                  a: ({ node, ...props }) => (
                    <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline inline-flex items-center gap-1">
                      {props.children}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )
                }}
              >
                {line || '&nbsp;'}
              </ReactMarkdown>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
