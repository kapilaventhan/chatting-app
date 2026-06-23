import React, { useState } from 'react';
import { Shield, Key, ArrowRight, User, HelpCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface CreateJoinRoomProps {
  onJoin: (username: string, roomId: string) => void;
}

export default function CreateJoinRoom({ onJoin }: CreateJoinRoomProps) {
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [showExplanation, setShowExplanation] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !roomId.trim()) return;
    onJoin(username.trim(), roomId.trim().toLowerCase());
  };

  const handleSuggestRoom = () => {
    const randomHex = Math.random().toString(36).substring(2, 10);
    setRoomId(`room-${randomHex}`);
  };

  const sampleNames = [
    "CyberRaven", "SecureFox", "CryptoOtter", "SilentFalcon", 
    "EncryptedDeer", "QuantumLynx", "ShieldedBear", "VaultedSeal"
  ];

  const handleRandomName = () => {
    const idx = Math.floor(Math.random() * sampleNames.length);
    setUsername(sampleNames[idx]);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#05060a] text-slate-300 p-6 md:p-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-[#0d111c] via-[#05060a] to-black pointer-events-none opacity-85" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg bg-[#08090f]/90 backdrop-blur-xl border border-slate-800/40 rounded-2xl p-8 shadow-2xl relative z-10"
      >
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-2xl mb-4 shadow-lg shadow-cyan-500/5">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-500 bg-clip-text text-transparent">
            SecureSync Chat
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            P2P Voice & Video Calling with Military-Grade End-to-End Encryption
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Username Input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex justify-between">
              <span>Your Screen Name</span>
              <button 
                type="button" 
                onClick={handleRandomName}
                className="text-cyan-450 hover:text-cyan-300 text-[10px] normal-case tracking-normal hover:underline"
              >
                Generate random
              </button>
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                <User className="w-4 h-4" />
              </span>
              <input
                type="text"
                required
                maxLength={20}
                placeholder="Enter screen name (e.g., Alice)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#0a0c14] border border-slate-800/60 rounded-xl py-3 pl-10 pr-4 text-sm text-slate-250 placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
              />
            </div>
          </div>

          {/* Room ID Input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex justify-between">
              <span>Secure Room Code</span>
              <button 
                type="button" 
                onClick={handleSuggestRoom}
                className="text-cyan-450 hover:text-cyan-300 text-[10px] normal-case tracking-normal hover:underline"
              >
                Generate Code
              </button>
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                <Key className="w-4 h-4" />
              </span>
              <input
                type="text"
                required
                placeholder="Enter or generate secure room ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full bg-[#0a0c14] border border-slate-800/60 rounded-xl py-3 pl-10 pr-4 text-sm text-slate-250 placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium py-3 px-4 rounded-xl shadow-lg shadow-cyan-500/10 active:scale-[0.98] transition-all cursor-pointer"
          >
            <span>Initialize Secure Handshake</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Info Explainer Toggle */}
        <div className="mt-8 pt-6 border-t border-slate-800/40 flex flex-col items-center">
          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-xs transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>How does SecureSync End-to-End Encryption work?</span>
          </button>

          {showExplanation && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 bg-[#05060a] rounded-xl p-4 border border-slate-800/40 text-xs text-slate-300 space-y-3"
            >
              <p>
                🔒 <strong>Zero-Knowledge Key Generation:</strong> When you join, your browser generates a unique <strong>RSA-2048 Cryptographic Keypair</strong>. Your private decryption key never leaves your tab.
              </p>
              <p>
                🤝 <strong>Public-Key Interchange:</strong> Connected peers automatically exchange their <strong>RSA Public Keys</strong> via their live WebSocket signaling channel.
              </p>
              <p>
                🔑 <strong>Multi-Recipient AES Wrapping:</strong> To send a message, we create a temporary <strong>AES-256-GCM symmetric session key</strong>, encrypt the text with it, wrap that session key with each peer's RSA Public Key, and send the encrypted package.
              </p>
              <p>
                📱 <strong>Independent P2P Decryption:</strong> Only the recipient's secure RSA Private Key can unpack the AES session key to decrypt the text. Neither the server nor any third party can eavesdrop.
              </p>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
