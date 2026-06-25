import React, { useEffect, useRef, useState } from "react";
import { 
  Phone, PhoneOff, Video, VideoOff, Mic, MicOff, ShieldAlert, MonitorPlay, 
  Activity, Volume2, VolumeX, Eye, Maximize2, RefreshCw, Signal, Clock 
} from "lucide-react";
import { CallSession, CallType } from "../types";
import { motion, AnimatePresence } from "motion/react";

interface CallPanelProps {
  session: CallSession;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  onAnswer: (type: CallType) => void;
  onDecline: () => void;
  onHangup: () => void;
  isMuted: boolean;
  isCamOff: boolean;
  onToggleMute: () => void;
  onToggleCam: () => void;
  connectionLogs: string[];
}

export default function CallPanel({
  session,
  localStream,
  remoteStream,
  remoteVideoRef,
  onAnswer,
  onDecline,
  onHangup,
  isMuted,
  isCamOff,
  onToggleMute,
  onToggleCam,
  connectionLogs
}: CallPanelProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // States for new premium functionalities
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [networkQuality, setNetworkQuality] = useState<"excellent" | "good" | "poor">("excellent");

  // Timer: ticking call duration when session is 'connected'
  useEffect(() => {
    let interval: any;
    if (session.status === "connected") {
      setCallDuration(0);
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
        
        // Randomly simulate sub-second network quality changes for visual richness
        const rand = Math.random();
        if (rand > 0.85) setNetworkQuality(prev => prev === "excellent" ? "good" : "excellent");
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [session.status]);

  // Hook streams up to video elements when available
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, session.status, isCamOff]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, session.status]);

  // Format seconds to MM:SS
  const formatTime = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Full Screen API wrapper
  const toggleFullScreen = () => {
    try {
      if (!document.fullscreenElement) {
        panelRef.current?.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    } catch (err) {
      console.warn("Fullscreen mode not permitted in Sandbox frame");
    }
  };

  // PIP API wrapper
  const togglePictureInPicture = async () => {
    try {
      if (remoteVideoRef.current && remoteVideoRef.current.readyState >= 1) {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await remoteVideoRef.current.requestPictureInPicture();
        }
      } else {
        alert("Picture-in-picture requires an active remote video feed stream.");
      }
    } catch (err) {
      console.warn("PIP stream initialization restricted or unsupported in browser");
    }
  };

  // Turn off panel logic
  if (session.status === "idle" || session.status === "ended") return null;

  return (
    <AnimatePresence>
      <div 
        ref={panelRef}
        id="call-overlay" 
        className="fixed inset-0 z-50 flex flex-col md:flex-row bg-[#05060a]/95 backdrop-blur-md p-4 md:p-8 text-slate-100 font-sans"
      >
        
        {/* Main Panel Content: stream projections */}
        <div className="flex-1 flex flex-col items-center justify-center relative rounded-2xl bg-[#08090f] border border-slate-800/40 overflow-hidden shadow-2xl min-h-[40vh] md:min-h-0">
          
          {/* Header Dashboard overlays on calling connected */}
          {session.status === "connected" && (
            <div className="absolute top-4 left-4 z-25 flex items-center gap-3 bg-black/40 backdrop-blur px-3 py-1.5 rounded-xl border border-slate-800/60">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-mono font-bold">{formatTime(callDuration)}</span>
              <span className="text-slate-600">|</span>
              
              {/* Network quality flag */}
              <div className="flex items-center gap-1">
                <Signal className={`w-3.5 h-3.5 ${
                  networkQuality === "excellent" ? "text-green-400" : networkQuality === "good" ? "text-amber-400" : "text-rose-400"
                }`} />
                <span className="text-[10px] uppercase font-semibold">
                  {networkQuality} Connection
                </span>
              </div>
            </div>
          )}

          {session.status === "connected" ? (
            <div className="w-full h-full relative flex items-center justify-center">
              {/* Remote Stream Video */}
              {session.type === "video" && remoteStream ? (
                <video
                  ref={remoteVideoRef}
                  id="remote-video"
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover rounded-2xl"
                />
              ) : (
                <div className="flex flex-col items-center gap-4 text-slate-400">
                  {/* Hidden audio element to play remote audio in voice-only calls */}
                  {remoteStream && (
                    <audio
                      autoPlay
                      playsInline
                      ref={(el) => {
                        if (el) el.srcObject = remoteStream;
                      }}
                      className="hidden"
                    />
                  )}
                  <div className="w-24 h-24 rounded-full bg-slate-900 border-2 border-cyan-500 flex items-center justify-center text-4xl font-bold">
                    {session.peerName[0]?.toUpperCase() || "?"}
                  </div>
                  <div className="text-lg font-medium tracking-tight">
                    {session.peerName} ({session.type === "audio" ? "Audio Call Only" : "Video Streams"})
                  </div>
                  <span className="text-xs text-cyan-400 animate-pulse flex items-center gap-1.5 bg-cyan-950/40 px-3 py-1 rounded-full border border-cyan-800/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    P2P Secure Line Active
                  </span>
                </div>
              )}

              {/* Local Stream PIP Float box */}
              {localStream && (
                <div className="absolute top-4 right-4 w-28 h-40 md:w-44 md:h-60 rounded-xl bg-[#05060a]/90 border border-slate-700/50 shadow-lg overflow-hidden z-10 transition-all duration-300">
                  {session.type === "video" && !isCamOff ? (
                    <video
                      ref={localVideoRef}
                      id="local-video"
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-400 text-xs">
                      {isCamOff ? "Cam Blocked" : "Audio Mic Only"}
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 bg-slate-900/80 backdrop-blur px-1.5 py-0.5 rounded text-[10px] text-slate-300">
                    You
                  </div>
                </div>
              )}
            </div>
          ) : (
            // Outgoing Dialing / Incoming Alert Visualizers
            <div className="flex flex-col items-center justify-center text-center p-8 max-w-sm">
              <div className="w-24 h-24 rounded-full bg-slate-800/60 border border-slate-700/50 flex items-center justify-center text-slate-100 text-3xl font-bold relative mb-6">
                <span className="relative z-10">{session.peerName[0]?.toUpperCase()}</span>
                <span className="absolute inset-x-0 inset-y-0 rounded-full bg-cyan-500/10 border border-cyan-500/20 scale-125 animate-ping" />
              </div>

              <h2 id="call-peer-name" className="text-2xl font-bold tracking-tight text-white mb-2">
                {session.peerName}
              </h2>

              <p className="text-slate-400 text-sm mb-8 flex items-center gap-1.5 justify-center">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                {session.status === "calling" 
                  ? "Outgoing cryptographic signal..." 
                  : session.status === "connecting"
                    ? "Establishing secure WebRTC channel..."
                    : "Incoming encrypted invitation request..."}
              </p>

              {/* Accept & decline triggers */}
              {session.status === "incoming" && (
                <div className="flex gap-4 flex-wrap justify-center">
                  <button
                    id="btn-accept-video"
                    onClick={() => onAnswer("video")}
                    className="flex flex-col items-center gap-2 p-4 min-w-[100px] rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg active:scale-95 transition-all text-xs font-semibold cursor-pointer"
                  >
                    <Video className="w-5 h-5" />
                    <span>Video Feed</span>
                  </button>

                  <button
                    id="btn-accept-audio"
                    onClick={() => onAnswer("audio")}
                    className="flex flex-col items-center gap-2 p-4 min-w-[100px] rounded-xl bg-sky-600 hover:bg-sky-500 text-white shadow-lg active:scale-95 transition-all text-xs font-semibold cursor-pointer"
                  >
                    <Mic className="w-5 h-5" />
                    <span>Voice Only</span>
                  </button>

                  <button
                    id="btn-decline-call"
                    onClick={onDecline}
                    className="flex flex-col items-center gap-2 p-4 min-w-[100px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-lg active:scale-95 transition-all text-xs font-semibold cursor-pointer"
                  >
                    <PhoneOff className="w-5 h-5" />
                    <span>Decline Invite</span>
                  </button>
                </div>
              )}

              {(session.status === "calling" || session.status === "connecting") && (
                <button
                  id="btn-cancel-call"
                  onClick={onHangup}
                  className="flex items-center gap-2 px-6 py-3 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-medium shadow-lg active:scale-95 transition-all cursor-pointer text-xs"
                >
                  <PhoneOff className="w-4 h-4" />
                  <span>Cancel Handshake Dial</span>
                </button>
              )}
            </div>
          )}

          {/* Active Calling Controller Panel */}
          {session.status === "connected" && (
            <div className="absolute bottom-6 flex items-center gap-3.5 bg-[#05060a]/90 backdrop-blur-md px-6 py-3 rounded-full border border-slate-700/30 shadow-2xl z-20 flex-wrap justify-center">
              
              {/* Mic Toggler */}
              <button
                id="btn-toggle-mute"
                onClick={onToggleMute}
                className={`p-3 rounded-full border transition-colors cursor-pointer ${
                  isMuted 
                    ? "bg-rose-600/20 border-rose-500/30 text-rose-450" 
                    : "bg-[#0a0c14] border-slate-800 text-slate-300 hover:bg-slate-800"
                }`}
                title={isMuted ? "Unmute system mic" : "Mute system mic"}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              {/* Cam Toggler */}
              {session.type === "video" && (
                <button
                  id="btn-toggle-cam"
                  onClick={onToggleCam}
                  className={`p-3 rounded-full border transition-colors cursor-pointer ${
                    isCamOff 
                      ? "bg-rose-600/20 border-rose-500/30 text-rose-450" 
                      : "bg-[#0a0c14] border-slate-800 text-slate-300 hover:bg-slate-800"
                  }`}
                  title={isCamOff ? "Turn video on" : "Turn video off"}
                >
                  {isCamOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </button>
              )}

              {/* Speaker Toggle Option */}
              <button
                onClick={() => setSpeakerEnabled(!speakerEnabled)}
                className={`p-3 rounded-full border transition-all cursor-pointer ${
                  !speakerEnabled 
                    ? "bg-amber-600/20 border-amber-505/30 text-amber-400" 
                    : "bg-[#0a0c14] border-slate-800 text-slate-300 hover:bg-slate-800"
                }`}
                title="Toggle Speakerphones"
              >
                {speakerEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </button>

              {/* Mobile Front/Back Camera swap indicator simulation */}
              {session.type === "video" && !isCamOff && (
                <button
                  onClick={() => setIsFrontCamera(!isFrontCamera)}
                  className="p-3 bg-slate-800 border border-slate-700/50 hover:bg-slate-705 text-slate-100 rounded-full transition cursor-pointer"
                  title="Switch camera focus (user vs. environment)"
                >
                  <RefreshCw className="w-5 h-5 animate-spin-slow" />
                </button>
              )}

              {/* Toggle Full Screen */}
              <button
                onClick={toggleFullScreen}
                className="p-3 bg-slate-800 border border-slate-700/50 hover:bg-slate-705 text-slate-100 rounded-full transition cursor-pointer"
                title="FullScreen Mode Toggle"
              >
                <Maximize2 className="w-5 h-5" />
              </button>

              {/* Toggle Picture-In-Picture */}
              {session.type === "video" && (
                <button
                  onClick={togglePictureInPicture}
                  className="p-3 bg-slate-800 border border-slate-700/50 hover:bg-slate-705 text-slate-100 rounded-full transition cursor-pointer"
                  title="Picture In Picture Stream Projection"
                >
                  <MonitorPlay className="w-5 h-5" />
                </button>
              )}

              {/* Red Disconnect Button */}
              <button
                id="btn-hangup"
                onClick={onHangup}
                className="p-3.5 bg-rose-650 hover:bg-rose-550 text-white rounded-full transition-colors shadow-lg active:scale-95 cursor-pointer ml-1.5"
                title="Disconnect call"
              >
                <PhoneOff className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* Right sub-telemetry log console */}
        <div id="call-logs-container" className="w-full md:w-80 flex flex-col bg-[#05060a]/80 border border-slate-800/40 md:border-l-0 rounded-2xl md:rounded-l-none md:rounded-r-2xl overflow-hidden p-4 text-[10px] font-mono h-44 md:h-auto">
          <div className="flex items-center justify-between border-b border-slate-850 pb-2 mb-3">
            <div className="flex items-center gap-1.5 text-slate-305 font-sans font-semibold">
              <Activity className="w-3.5 h-3.5 text-cyan-405 animate-pulse" />
              <span>Signaling Exchange protocol</span>
            </div>
            <span className="bg-cyan-500/10 text-cyan-404 px-2.5 py-0.5 rounded-full text-[8px] font-semibold border border-cyan-500/20 font-sans uppercase">
              {session.type} Link
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {connectionLogs.map((log, index) => {
              const isOk = log.includes("Success") || log.includes("connected") || log.includes("Active") || log.includes("descriptions");
              const isAlert = log.includes("Failed") || log.includes("Error") || log.includes("declined") || log.includes("rej");
              return (
                <div 
                  key={index} 
                  className={`p-1.5 rounded leading-relaxed border ${
                    isOk 
                      ? "bg-cyan-950/20 border-cyan-900/30 text-cyan-400" 
                      : isAlert 
                        ? "bg-rose-950/20 border-rose-900/30 text-rose-450" 
                        : "bg-slate-900/50 border-slate-800/65 text-slate-450"
                  }`}
                >
                  <span className="text-slate-500 select-none mr-1">[{new Date().toLocaleTimeString()}]</span>
                  {log}
                </div>
              );
            })}
            
            {session.status === "connected" && (
              <div className="p-1 px-2 border border-green-500/25 bg-green-950/20 rounded text-[9px] text-green-400 font-sans flex items-center gap-1.5 mt-2 animate-pulse">
                <span>●</span>
                <span>Camera swap constraints: default {isFrontCamera ? "User (Front) lens active" : "Environment (Rear) lens emulation"}</span>
              </div>
            )}

            {connectionLogs.length === 0 && (
              <div className="text-slate-600 text-center py-8">
                Awaiting direct stream verification...
              </div>
            )}
          </div>
        </div>

      </div>
    </AnimatePresence>
  );
}
