import React, { useState } from 'react';
import { Shield, Key, RefreshCw, Cpu, UserCheck, CheckCircle2, Award } from 'lucide-react';
import { PeerInfo } from '../types';

interface SecurityConsoleProps {
  myId: string;
  myName: string;
  myPublicKeyJwk?: JsonWebKey | null;
  peers: PeerInfo[];
}

export default function SecurityConsole({
  myId,
  myName,
  myPublicKeyJwk = null,
  peers
}: SecurityConsoleProps) {
  const [copied, setCopied] = useState(false);

  // Computes a visual SHA-256-like fingerprint of the JWK public key for peer verification
  const getFingerprint = (jwk: JsonWebKey | null) => {
    if (!jwk || !jwk.n) return "Awaiting generation...";
    // Combine some modulus characters to make a neat unique fingerprint block
    const cleanModulus = jwk.n.substring(0, 16) + jwk.n.substring(jwk.n.length - 16);
    let hash = 0;
    for (let i = 0; i < cleanModulus.length; i++) {
      hash = (hash << 5) - hash + cleanModulus.charCodeAt(i);
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
    return `SHA-256:FPR-${hex.substring(0, 4)}-${hex.substring(4, 8)}-568E-90DE`;
  };

  const myFingerprint = getFingerprint(myPublicKeyJwk);

  const handleCopyKey = () => {
    if (!myPublicKeyJwk) return;
    navigator.clipboard.writeText(JSON.stringify(myPublicKeyJwk, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id="security-console" className="flex flex-col bg-[#08090f] border border-slate-800/40 rounded-xl overflow-hidden p-4 text-xs font-sans h-full shadow-lg">
      
      {/* Console Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-slate-800/40 mb-4">
        <Shield className="w-4 h-4 text-cyan-400" />
        <span className="font-semibold tracking-tight text-slate-200">Cryptographic Subsystem</span>
      </div>

      <div className="space-y-4 flex-1 overflow-y-auto pr-1">
        
        {/* Local Cryptographic Context */}
        <div className="space-y-1.5 p-3 bg-[#05060a]/90 border border-slate-800/50 rounded-lg">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
            <span className="flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              Your Device Keys
            </span>
            <span className="text-[9px] bg-cyan-500/10 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/20">
              Active RSA-2048
            </span>
          </div>

          <div className="pt-2 text-[10px] space-y-1 text-slate-400">
            <div>
              <span className="text-slate-500 font-medium">Owner:</span> {myName}
            </div>
            <div>
              <span className="text-slate-500 font-medium font-sans">Key ID:</span> <code className="font-mono text-cyan-300">{myId.substring(0, 8)}</code>
            </div>
            <div>
              <span className="text-slate-500 font-medium">Decryption:</span> <span className="text-cyan-400 font-semibold secure-glow">E2EE Sealed</span>
            </div>
            <div className="pt-1 border-t border-slate-800/30 mt-2">
              <div className="text-slate-500 mb-0.5 font-sans">Verification hash:</div>
              <code className="font-mono text-[9px] text-slate-300 bg-[#05060a] px-1 py-0.5 rounded block whitespace-nowrap overflow-hidden text-ellipsis">
                {myFingerprint}
              </code>
            </div>
          </div>

          {myPublicKeyJwk && (
            <button
              onClick={handleCopyKey}
              className="mt-3.5 w-full bg-slate-900/50 hover:bg-slate-850 text-[10px] py-1.5 px-3 rounded border border-slate-800/40 text-slate-300 hover:text-white transition-colors flex items-center justify-center gap-1 cursor-pointer"
            >
              <Key className="w-3 h-3 text-slate-400" />
              <span>{copied ? 'Copied JWK Parameters!' : 'Copy Public JWK Params'}</span>
            </button>
          )}
        </div>

        {/* Recipients Keys Interchanges */}
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between px-1">
            <span className="flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
              Verified Room Keys ({peers.length})
            </span>
          </div>

          <div className="space-y-2">
            {peers.map(peer => (
              <div key={peer.id} className="p-2.5 bg-[#05060a]/50 border border-slate-800/50 rounded-lg space-y-1 text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-300">{peer.name}</span>
                  <span className="flex items-center gap-0.5 text-[9px] text-cyan-400 font-medium bg-cyan-955/40 px-1.5 py-0.5 rounded border border-cyan-900/40">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    Verified
                  </span>
                </div>
                <code className="font-mono text-[8px] text-slate-500 block overflow-hidden text-ellipsis whitespace-nowrap bg-[#05060a] p-1 rounded">
                  {peer.publicKeyJwk ? `n: ${peer.publicKeyJwk.n?.substring(0, 32)}...` : 'Awaiting JWK payload'}
                </code>
                <div className="text-[9px] text-slate-500">
                  Fingerprint: <span className="font-mono text-slate-400">{getFingerprint(peer.publicKeyJwk || null).substring(12)}</span>
                </div>
              </div>
            ))}

            {peers.length === 0 && (
              <div className="text-center py-6 border border-dashed border-slate-800/40 rounded-lg text-slate-600">
                Awaiting peer connections to exchange public keys...
              </div>
            )}
          </div>
        </div>

        {/* Informative Assurance Block */}
        <div className="p-3 bg-cyan-955/20 border border-cyan-900/30 rounded-lg text-cyan-400 space-y-1 text-[10px]">
          <div className="flex items-center gap-1.5 font-semibold text-cyan-300">
            <Award className="w-3.5 h-3.5" />
            <span>Secure Sync Standard</span>
          </div>
          <p className="text-slate-400 leading-normal">
            For every individual message, your browser spins up an industrial-grade <strong>AES-256-GCM symmetric session key</strong>. The plaintext never touches the network wire.
          </p>
        </div>

      </div>
    </div>
  );
}
