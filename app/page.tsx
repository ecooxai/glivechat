import LiveChat from '@/components/LiveChat';

export default function Home() {
  return (
    <main className="h-screen bg-neutral-950 text-neutral-50 flex flex-col">
      <header className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/50">
        <h1 className="text-xl font-semibold tracking-tight">Gemini Live Chat</h1>
      </header>
      <div className="flex-1 overflow-hidden">
        <LiveChat />
      </div>
    </main>
  );
}
