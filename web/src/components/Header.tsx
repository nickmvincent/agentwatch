interface HeaderProps {
  connected: boolean;
  repoCount: number;
  agentCount: number;
}

export function Header({ connected, repoCount, agentCount }: HeaderProps) {
  return (
    <header className="bg-gray-800 border-b border-gray-700 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-white">Agentwatch</h1>
          <span
            className={`px-2 py-1 rounded text-xs ${
              connected
                ? "bg-green-900 text-green-300"
                : "bg-red-900 text-red-300"
            }`}
          >
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
        <div className="flex items-center gap-4 text-gray-400 text-sm">
          <span>{repoCount} repos</span>
          <span>{agentCount} agents</span>
        </div>
      </div>
    </header>
  );
}
