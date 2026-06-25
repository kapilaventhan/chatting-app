import { useState, useEffect, useRef } from "react";
import { Loader2, Shield } from "lucide-react";
import { UserSession, CallSession, CallType, CallStatus } from "./types";
import AuthPanel from "./components/AuthPanel";
import ChatLayout from "./components/ChatLayout";
import CallPanel from "./components/CallPanel";
import { generateKeyPair, exportPublicKey } from "./utils/crypto";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  const [stage, setStage] = useState<"auth" | "generating_keys" | "chat">("auth");
  const [user, setUser] = useState<UserSession | null>(null);

  // Cryptographic Keys
  const [myKeyPair, setMyKeyPair] = useState<CryptoKeyPair | null>(null);
  const [myPublicKeyJwk, setMyPublicKeyJwk] = useState<JsonWebKey | null>(null);

  // WebRTC Calling Session States
  const [callSession, _setCallSession] = useState<CallSession>({
    peerId: "",
    peerName: "",
    type: "video",
    status: "idle",
    isInitiator: false
  });
  const callSessionRef = useRef<CallSession>(callSession);
  const setCallSession = (val: CallSession | ((curr: CallSession) => CallSession)) => {
    _setCallSession(curr => {
      const next = typeof val === "function" ? val(curr) : val;
      callSessionRef.current = next;
      return next;
    });
  };

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [connectionLogs, setConnectionLogs] = useState<string[]>([]);
  const [activeCallLogId, _setActiveCallLogId] = useState<string | null>(null);
  const activeCallLogIdRef = useRef<string | null>(null);
  const setActiveCallLogId = (id: string | null) => {
    _setActiveCallLogId(id);
    activeCallLogIdRef.current = id;
  };

  // Refs
  const socketRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const iceCandidatesBufferRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Check the browser's localStorage on load to see if a valid session exists
  useEffect(() => {
    const savedUser = localStorage.getItem("securesync_session");
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      handleAuthSuccess(parsed);
    }
  }, []);

  // Sync to database websocket whenever user registration completes
  useEffect(() => {
    if (!user) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socketUrl = `${protocol}//${window.location.host}`;
    
    console.log(`Synchronising Socket Tunnel: ${socketUrl}`);
    const socket = new WebSocket(socketUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log("Registered WS session...");
      socket.send(JSON.stringify({
        type: "register",
        userId: user.userId
      }));
    };

    socket.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        const { type } = data;

        if (type === "incoming_call_request") {
          const { callerId, callerName, callType, callId } = data;
          
          setCallSession(curr => {
            // Auto reject if already busy
            if (curr.status !== "idle" && curr.status !== "ended") {
              sendCallResponse(callerId, "busy", callType);
              return curr;
            }

            addLog(`Incoming call invite from ${callerName}`);
            return {
              callId,
              peerId: callerId,
              peerName: callerName,
              type: callType,
              status: "incoming",
              isInitiator: false
            };
          });
        } 
        else if (type === "call_invitation_response") {
          const { receiverId, answer, sdp, callType } = data;
          
          if (answer === "accept") {
            addLog("P2P call accepted!");
            
            // Transition status to connecting
            setCallSession(curr => ({
              ...curr,
              status: "connecting"
            }));

            // Initialize caller peer connection and send offer
            if (localStreamRef.current) {
              const pc = setupPeerConnection(receiverId, localStreamRef.current);
              try {
                const offer = await pc.createOffer();
                console.log("CALLER CREATED OFFER");
                await pc.setLocalDescription(offer);
                
                console.log("TARGET PEER:", callSessionRef.current.peerId);
                sendWebrtcSignal(receiverId, offer);
                console.log("CALLER SENT OFFER");
                addLog("SDP Offer dispatched.");
              } catch (err) {
                console.error("SDP offer creation failed:", err);
              }
            }
          }
          else if (answer === "reject") {
            addLog("Active handshakes declined.");
            
            if (activeCallLogIdRef.current) {
              await fetch(`/api/calls/log/${activeCallLogIdRef.current}/end`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "rejected" })
              });
            }

            cleanupCall();
            setCallSession(curr => ({ ...curr, status: "declined" }));
            setTimeout(() => resetCallSessionState(), 3000);
          } 
          else if (answer === "busy") {
            addLog(`${callSessionRef.current.peerName || "Partner"} is currently line busy.`);
            
            if (activeCallLogIdRef.current) {
              await fetch(`/api/calls/log/${activeCallLogIdRef.current}/end`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "rejected" })
              });
            }

            cleanupCall();
            setCallSession(curr => ({ ...curr, status: "busy" }));
            setTimeout(() => resetCallSessionState(), 3000);
          }
        } 
        else if (type === "webrtc_signaling_forward") {
          const { signal } = data;
          if (pcRef.current) {
            try {
              if (signal.candidate) {
                if (callSessionRef.current.isInitiator) {
                  console.log("CALLER RECEIVED ICE");
                } else {
                  console.log("RECEIVER RECEIVED ICE");
                }

                const candidate = new RTCIceCandidate(signal.candidate);
                if (pcRef.current.remoteDescription) {
                  await pcRef.current.addIceCandidate(candidate);
                } else {
                  console.log("Buffering incoming ICE candidate (remoteDescription is not set yet)");
                  iceCandidatesBufferRef.current.push(signal.candidate);
                }
              } else if (signal.sdp) {
                if (signal.type === "offer") {
                  if (pcRef.current.signalingState !== "stable") {
                    console.warn("Receiver already processing an offer, signalingState is:", pcRef.current.signalingState);
                    return;
                  }
                  console.log("RECEIVER GOT OFFER");
                  await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal));
                  
                  // Process buffered ICE candidates
                  console.log(`Processing ${iceCandidatesBufferRef.current.length} buffered ICE candidates`);
                  for (const candidate of iceCandidatesBufferRef.current) {
                    await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
                  }
                  iceCandidatesBufferRef.current = [];

                  console.log("RECEIVER CREATED ANSWER");
                  const answer = await pcRef.current.createAnswer();
                  await pcRef.current.setLocalDescription(answer);
                  
                  console.log("TARGET PEER:", callSessionRef.current.peerId);
                  sendWebrtcSignal(callSessionRef.current.peerId, answer);
                  console.log("RECEIVER SENT ANSWER");
                  addLog("SDP Answer dispatched.");
                } 
                else if (signal.type === "answer") {
                  console.log("CALLER RECEIVED ANSWER");
                  await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal));
                  console.log("Caller successfully applied remote answer SDP!");
                  
                  // Process buffered ICE candidates
                  console.log(`Processing ${iceCandidatesBufferRef.current.length} buffered ICE candidates`);
                  for (const candidate of iceCandidatesBufferRef.current) {
                    await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
                  }
                  iceCandidatesBufferRef.current = [];
                }
              }
            } catch (err) {
              console.error("Signaling stream injection broke:", err);
            }
          } else {
            // Buffer candidate if pcRef.current is not ready yet
            if (signal.candidate) {
              console.log("Buffering ICE candidate because pcRef.current is null");
              iceCandidatesBufferRef.current.push(signal.candidate);
            } else if (signal.sdp && signal.type === "offer") {
              console.log("Warning: Received SDP offer but pcRef.current is null. Under the new flow this should not occur.");
            }
          }
        } 
        else if (type === "partner_hangup") {
          addLog("Call disconnected by partner.");
          
          if (activeCallLogIdRef.current) {
            fetch(`/api/calls/log/${activeCallLogIdRef.current}/end`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "ended" })
            }).catch(() => {});
          }

          cleanupCall();
          setCallSession(curr => ({ ...curr, status: "ended" }));
          setTimeout(() => resetCallSessionState(), 2000);
        }
      } catch (err) {
        console.error("Socket message orchestrator failed:", err);
      }
    };

    socket.onclose = () => {
      console.log("WebSocket stream closed");
    };

    return () => {
      socket.close();
    };
  }, [user]);

  // AuthSuccess handler: launches key pair generation to simulate premium cryptographics
  const handleAuthSuccess = async (authenticatedUser: UserSession) => {
    if (!authenticatedUser || !authenticatedUser.userId) {
      console.warn("handleAuthSuccess: authenticatedUser or userId is missing");
      setStage("auth");
      return;
    }
    setUser(authenticatedUser);
    localStorage.setItem("securesync_session", JSON.stringify(authenticatedUser));
    
    setStage("generating_keys");

    // Self-healing: verify database state and restore if wiped on container reboot
    try {
      const checkRes = await fetch(`/api/users/profile/${authenticatedUser.userId}`);
      if (!checkRes.ok) {
        console.log("Database reset or ephemeral wipe detected! Restoring local browser cache securely...");
        const friendsCache = JSON.parse(localStorage.getItem(`securesync_friends_${authenticatedUser.userId}`) || "[]");
        const messagesCache: any[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(`securesync_msgs_${authenticatedUser.userId}_`)) {
            const list = JSON.parse(localStorage.getItem(key) || "[]");
            messagesCache.push(...list);
          }
        }
        const settingsCache = {
          theme: localStorage.getItem(`securesync_theme_${authenticatedUser.userId}`) || "dark",
          soundNotifications: true,
          readReceipts: true
        };

        await fetch("/api/auth/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user: authenticatedUser,
            friends: friendsCache,
            messages: messagesCache,
            calls: [],
            settings: settingsCache
          })
        });
        console.log("State recovery complete!");
      }
    } catch (err) {
      console.warn("Autorecovery check bypassed", err);
    }

    try {
      const keys = await generateKeyPair();
      setMyKeyPair(keys);

      const exported = await exportPublicKey(keys.publicKey);
      setMyPublicKeyJwk(exported);
      
      setStage("chat");
    } catch (err) {
      console.warn("Local crypto key creation bypassed, starting in fallback mode", err);
      setStage("chat");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("securesync_session");
    cleanupCall();
    if (socketRef.current) socketRef.current.close();
    setUser(null);
    setMyKeyPair(null);
    setMyPublicKeyJwk(null);
    setStage("auth");
  };

  // --- WebRTC Logic ---

  const addLog = (msg: string) => {
    setConnectionLogs(prev => [...prev.slice(-30), msg]);
  };

  const resetCallSessionState = () => {
    setCallSession({
      peerId: "",
      peerName: "",
      type: "video",
      status: "idle",
      isInitiator: false
    });
    setConnectionLogs([]);
    setActiveCallLogId(null);
  };

  const sendCallResponse = (callerId: string, answer: "accept" | "reject" | "busy", callType: CallType, sdp?: any) => {
    console.log("TARGET PEER:", callSessionRef.current.peerId);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "respond_call",
        receiverId: user?.userId,
        callerId,
        answer,
        sdp,
        callType
      }));
    }
  };

  const sendWebrtcSignal = (targetId: string, signal: any) => {
    console.log("TARGET PEER:", callSessionRef.current.peerId);
    console.log(
      "[SEND SIGNAL]",
      signal.type || "ICE",
      "TO",
      targetId
    );

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "webrtc_signaling",
        targetId,
        signal
      }));
    }
  };

  // Safe device stream grabber fallback
  const acquireMedia = async (type: CallType): Promise<MediaStream> => {
    try {
      const constraints = {
        audio: true,
        video: type === "video"
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      addLog("Local mic/camera systems successfully linked.");
      return stream;
    } catch (err) {
      addLog("Device access blocked in sandbox frame. Elevating to simulation stream...");
      
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d")!;
      
      let angle = 0;
      const interval = setInterval(() => {
        ctx.fillStyle = "#0c1524";
        ctx.fillRect(0, 0, 640, 480);
        
        ctx.translate(320, 240);
        ctx.rotate(angle);
        
        const grad = ctx.createLinearGradient(-150, -150, 150, 150);
        grad.addColorStop(0, "#06b6d4");
        grad.addColorStop(0.5, "#3b82f6");
        grad.addColorStop(1, "#8b5cf6");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, 120 + Math.sin(angle * 2.5) * 12, 0, Math.PI * 2);
        ctx.stroke();

        ctx.rotate(-angle);
        ctx.translate(-320, -240);
        
        ctx.fillStyle = "#f8fafc";
        ctx.font = "bold 16px Inter, sans-serif";
        ctx.fillText("SECURESYNC CRYPTO STREAM", 200, 220);
        
        ctx.fillStyle = "#64748b";
        ctx.font = "12px JetBrains Mono, monospace";
        ctx.fillText(`Sender ID: ${user?.name.toUpperCase()}`, 200, 255);
        ctx.fillText(`Encryption: AES-256 Symmetric Seal`, 175, 280);
        
        angle += 0.06;
      }, 55);

      const canvasStream = (canvas as any).captureStream(30);
      
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const dest = audioCtx.createMediaStreamDestination();
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      osc.connect(gainNode);
      gainNode.connect(dest);
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, audioCtx.currentTime); 
      gainNode.gain.setValueAtTime(0.0001, audioCtx.currentTime); // maintain silent hum
      osc.start();

      const combinedTracks = [...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()];
      const mockStream = new MediaStream(combinedTracks);
      
      (mockStream as any)._cleanup = () => {
        clearInterval(interval);
        try {
          osc.stop();
          audioCtx.close();
        } catch {}
      };

      return mockStream;
    }
  };

  const setupPeerConnection = (targetId: string, stream: MediaStream) => {  
    addLog("Configuring peer WebRTC connections with active ICE bridges...");
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
      ]
    });
    pcRef.current = pc;

    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    pc.ontrack = (event) => {
      addLog("Remote audio/video stream mapped successfully.");
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("TARGET PEER:", callSessionRef.current.peerId);
        sendWebrtcSignal(targetId, { candidate: event.candidate });
      }
    };

    pc.onsignalingstatechange = () => {
      console.log("SIGNAL STATE", pc.signalingState);
      addLog(`Signaling State: ${pc.signalingState}`);
    };

    pc.onconnectionstatechange = () => {
      console.log("CONNECTION STATE", pc.connectionState);
      addLog(`WebRTC State: ${pc.connectionState}`);

      if (pc.connectionState === "connected") {
        addLog("P2P E2EE Connection established successfully!");
        setCallSession(curr => ({
          ...curr,
          status: "connected"
        }));
      }

      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        console.error("WebRTC connection failed");
        addLog("WebRTC connection failed or disconnected.");
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("ICE STATE", pc.iceConnectionState);
      if (pc.iceConnectionState === "failed") {
        console.error("ICE negotiation failed");
      }
    };

    return pc;
  };

  // Initiating call
  const onStartCall = async (peerId: string, peerName: string, type: CallType) => {
    setConnectionLogs([]);
    addLog(`Dials cryptographically to ${peerName}...`);
    
    // Save record to DB
    try {
      const logRes = await fetch("/api/calls/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callerId: user?.userId, receiverId: peerId, callType: type })
      });
      if (logRes.ok) {
        const payload = await logRes.json();
        setActiveCallLogId(payload.callLog.callId);
      }
    } catch {}

    setCallSession({
      peerId,
      peerName,
      type,
      status: "calling",
      isInitiator: true
    });

    const acquired = await acquireMedia(type);
    setLocalStream(acquired);
    localStreamRef.current = acquired;

    // Dispatch invitation over signaling WebSocket, caller does NOT create peer connection yet
    console.log("TARGET PEER:", callSessionRef.current.peerId);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "invite_call",
        callerId: user?.userId,
        callerName: user?.name,
        receiverId: peerId,
        callType: type
      }));
    }
    
    addLog("Call invitation dispatched. Awaiting partner response...");
  };

  // Answering incoming invite
  const onAnswer = async (type: CallType) => {
    addLog("Analyzing invitation... Launching secure codec session...");

    setCallSession(curr => ({
      ...curr,
      status: "connecting",
      type
    }));

    const acquired = await acquireMedia(type);
    setLocalStream(acquired);
    localStreamRef.current = acquired;

    const peerId = callSessionRef.current.peerId;
    if (!peerId) {
      console.error("onAnswer: peerId is missing!");
      addLog("Error answering call: Peer ID is missing.");
      return;
    }

    setupPeerConnection(peerId, acquired);

    // Send call response to indicate we accepted, caller will initiate the SDP offer
    sendCallResponse(peerId, "accept", type);
    addLog("Call accepted, awaiting SDP offer...");
  };

  const onDecline = () => {
    sendCallResponse(callSession.peerId, "reject", callSession.type);
    resetCallSessionState();
  };

  const onHangup = () => {
    if (callSession.peerId && socketRef.current) {
      socketRef.current.send(JSON.stringify({
        type: "hangup_call",
        partnerId: callSession.peerId
      }));
    }
    
    if (activeCallLogId) {
      fetch(`/api/calls/log/${activeCallLogId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ended" })
      }).catch(() => {});
    }

    cleanupCall();
    resetCallSessionState();
  };

  const cleanupCall = () => {
    addLog("Releasing camera, microphone and peer connections...");
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      if ((localStreamRef.current as any)._cleanup) {
        (localStreamRef.current as any)._cleanup();
      }
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
  };

  const onToggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = isMuted; 
      });
      setIsMuted(!isMuted);
      addLog(isMuted ? "Microphone enabled" : "Microphone muted");
    }
  };

  const onToggleCam = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = isCamOff; 
      });
      setIsCamOff(!isCamOff);
      addLog(isCamOff ? "Video camera enabled" : "Video camera disabled");
    }
  };

  return (
    <div className="min-h-screen bg-[#05060a] font-sans antialiased text-slate-100 relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#0c101c] via-[#05060a] to-black pointer-events-none opacity-60" />

      <AnimatePresence mode="wait">
        {stage === "auth" && (
          <motion.div
            key="auth"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10"
          >
            <AuthPanel onSuccess={handleAuthSuccess} />
          </motion.div>
        )}

        {stage === "generating_keys" && (
          <motion.div
            key="generator"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-[#05060a] text-center"
          >
            <div className="space-y-6 max-w-sm">
              <div className="relative inline-flex items-center justify-center">
                <Loader2 className="w-16 h-16 text-cyan-404 animate-spin" />
                <Shield className="w-6 h-6 text-cyan-500 absolute" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold tracking-tight text-white flex items-center gap-1.5 justify-center">
                  Decrypting Device Profile
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                </h3>
                <p className="text-slate-400 text-xs leading-relaxed max-w-xs font-sans">
                  Spinning up/retrieving local <strong>RSA-2048 Bit Cryptographic Keypair</strong> using your native WebCrypto engine. No private keys are sent online.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {stage === "chat" && user && (
          <motion.div
            key="chat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative z-10"
          >
            <ChatLayout
              user={user}
              socket={socketRef.current}
              onLogout={handleLogout}
              onStartCall={onStartCall}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Primary Voice/Video overlay */}
      {callSession.status !== "idle" && (
        <CallPanel
          session={callSession}
          localStream={localStream}
          remoteStream={remoteStream}
          remoteVideoRef={remoteVideoRef}
          onAnswer={onAnswer}
          onDecline={onDecline}
          onHangup={onHangup}
          isMuted={isMuted}
          isCamOff={isCamOff}
          onToggleMute={onToggleMute}
          onToggleCam={onToggleCam}
          connectionLogs={connectionLogs}
        />
      )}
    </div>
  );
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
