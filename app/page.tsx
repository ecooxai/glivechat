import LiveChat from '@/components/LiveChat';

export default function Home() {
  return (
    <main className="h-screen bg-neutral-950 text-neutral-50 flex flex-col">
      <div className="flex-1 overflow-hidden">
        <LiveChat />
      </div>
    </main>
  );
}
