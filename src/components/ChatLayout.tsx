import React, { useState, useRef, useEffect } from "react";
import { 
  Send, Shield, Lock, Users, Phone, Video, LogOut, Search, Plus, 
  Settings, Key, Image, Paperclip, Smile, Eye, Check, CheckCheck, 
  Activity, Bell, Trash2, X, CheckSquare, ShieldCheck, Moon, Sun, Volume2, VolumeX, Menu, MessageSquare
} from "lucide-react";
import { FriendContact, Message, CallType, UserSession } from "../types";
import { motion, AnimatePresence } from "motion/react";
import SecurityConsole from "./SecurityConsole";

interface ChatLayoutProps {
  user: UserSession;
  socket: WebSocket | null;
  onLogout: () => void;
  onStartCall: (peerId: string, peerName: string, type: CallType) => void;
}

export default function ChatLayout({
  user,
  socket,
  onLogout,
  onStartCall
}: ChatLayoutProps) {
  // Navigation & list states
  const [friends, setFriends] = useState<FriendContact[]>([]);
  const [activeFriend, setActiveFriend] = useState<FriendContact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [searchErrorMsg, setSearchErrorMsg] = useState("");
  const [searchSuccessMsg, setSearchSuccessMsg] = useState("");
  
  // Filtering chats locally
  const [chatSearchText, setChatSearchText] = useState("");

  // Indicators mapping
  const [typingPeerId, setTypingPeerId] = useState<string | null>(null);
  const [typedValue, setTypedValue] = useState(false);

  // Settings state
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(true);
  const [newPassword, setNewPassword] = useState("");

  // Drawers & Modals
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);
  const [showSecurityDrawer, setShowSecurityDrawer] = useState(false);
  const [showEmojiPanel, setShowEmojiPanel] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // File uploading loader
  const [uploading, setUploading] = useState(false);

  // Profile Customizer
  const [customName, setCustomName] = useState(user.name);
  const [customAvatar, setCustomAvatar] = useState(user.profileImage);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const typingTimeoutRef = useRef<any | null>(null);

  // Inline Hot Emojis
  const standardEmojis = [
    "😀", "😂", "🥰", "😍", "👍", "🔥", "🎉", "❤️", "🙌", "🚀", "💡", "🤔", "👏", "✔️", "👀"
  ];

  // Fetch Friends and Requests list
  const fetchFriends = async () => {
    try {
      if (!user || !user.userId) return;
      const res = await fetch(`/api/friends/${user.userId}`);
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          setFriends(data);
          
          // Cache friends in local storage
          if (data && data.length > 0) {
            localStorage.setItem(`securesync_friends_${user.userId}`, JSON.stringify(data));
          }
          
          // If there was an active friend, find their updated object
          if (activeFriend) {
            const fresh = data.find((f: FriendContact) => f.userId === activeFriend.userId);
            if (fresh) setActiveFriend(fresh);
          }
        } else {
          console.warn("Invalid content-type from fetchFriends:", contentType);
        }
      }
    } catch (err) {
      console.error("Error loading friends:", err);
    }
  };

  // Fetch Thread Messages
  const fetchMessages = async (contactId: string) => {
    try {
      if (!user || !user.userId || !contactId) return;
      const res = await fetch(`/api/chats/${user.userId}/${contactId}`);
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          setMessages(data);
          
          // Cache messages in local storage
          if (data && data.length > 0) {
            localStorage.setItem(`securesync_msgs_${user.userId}_${contactId}`, JSON.stringify(data));
          }
          
          // Auto mark seen if currently looking at this window
          await fetch("/api/chats/mark-seen", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ senderId: contactId, receiverId: user.userId })
          });
          
          // Refresh DMs immediately to flush unread badges
          fetchFriends();
        } else {
          console.warn("Invalid content-type from fetchMessages:", contentType);
        }
      }
    } catch (err) {
      console.error("Error loading chat messages:", err);
    }
  };

  // Auto poll & refresh friends and current thread details safely
  useEffect(() => {
    fetchFriends();
    const inv = setInterval(() => {
      fetchFriends();
      if (activeFriend) {
        fetchMessages(activeFriend.userId);
      }
    }, 4500);

    return () => clearInterval(inv);
  }, [activeFriend]);

  // Handle incoming webSocket events
  useEffect(() => {
    if (!socket) return;

    const handleSocketMessage = async (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        const { type } = data;

        if (type === "receive_chat") {
          const chat: Message = data.chat;
          
          // Sound notifier if enabled and not currently looking at thread
          if (soundEnabled && chat.senderId !== user.userId) {
            playNotifyChime();
          }

          if (activeFriend && (chat.senderId === activeFriend.userId || chat.receiverId === activeFriend.userId)) {
            setMessages(prev => {
              if (prev.some(m => m.chatId === chat.chatId)) return prev;
              return [...prev, chat];
            });
            
            // Mark immediately as read
            await fetch("/api/chats/mark-seen", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ senderId: activeFriend.userId, receiverId: user.userId })
            });
          }
          fetchFriends();
        } 
        else if (type === "typing_broadcast") {
          const { senderId, isTyping } = data;
          if (activeFriend && activeFriend.userId === senderId) {
            setTypingPeerId(isTyping ? senderId : null);
          }
        }
        else if (type === "presence_change") {
          const { userId, status } = data;
          setFriends(prev => prev.map(f => {
            if (f.userId === userId) {
              return { ...f, onlineStatus: status, lastSeen: Date.now() };
            }
            return f;
          }));
          if (activeFriend && activeFriend.userId === userId) {
            setActiveFriend(prev => prev ? { ...prev, onlineStatus: status, lastSeen: Date.now() } : null);
          }
        }
        else if (type === "messages_seen") {
          const { viewerId } = data;
          if (activeFriend && activeFriend.userId === viewerId) {
            setMessages(prev => prev.map(m => {
              if (m.receiverId === viewerId) {
                return { ...m, seen: true, delivered: true };
              }
              return m;
            }));
          }
        }
        else if (type === "sent_ack") {
          // Message persisted successfully
          const chat: Message = data.chat;
          setMessages(prev => {
            if (prev.some(m => m.chatId === chat.chatId)) return prev;
            return [...prev, chat];
          });
          fetchFriends();
        }
        else if (type === "incoming_friend_request" || type === "friend_request_accepted") {
          if (soundEnabled) playNotifyChime();
          fetchFriends();
        }
      } catch (err) {
        console.error("Socket dispatcher error:", err);
      }
    };

    socket.addEventListener("message", handleSocketMessage);
    return () => {
      socket.removeEventListener("message", handleSocketMessage);
    };
  }, [socket, activeFriend, soundEnabled]);

  // Scroll to bottom helper
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingPeerId]);

  // Reset local typing indicator state when switching active conversations
  useEffect(() => {
    setTypingPeerId(null);
    setTypedValue(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  }, [activeFriend]);

  // Apply dark/light theme classes on change
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light-theme");
      root.style.setProperty("--bg-color", "#f8fafc");
      root.style.setProperty("--text-color", "#0f172a");
    } else {
      root.classList.remove("light-theme");
      root.style.setProperty("--bg-color", "#05060a");
      root.style.setProperty("--text-color", "#cbd5e1");
    }
  }, [theme]);

  // Simple Notification tone generator using AudioContext (100% reliable)
  const playNotifyChime = () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5 key note
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5 key note
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch {}
  };

  // Keyboard trigger for typings
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    
    if (socket && activeFriend) {
      if (!typedValue) {
        setTypedValue(true);
        socket.send(JSON.stringify({
          type: "typing",
          senderId: user.userId,
          receiverId: activeFriend.userId,
          isTyping: true
        }));
      }

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        setTypedValue(false);
        socket.send(JSON.stringify({
          type: "typing",
          senderId: user.userId,
          receiverId: activeFriend.userId,
          isTyping: false
        }));
      }, 2500);
    }
  };

  // Execute text message send
  const handleSendTextMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeFriend || !socket) return;

    socket.send(JSON.stringify({
      type: "send_chat",
      senderId: user.userId,
      receiverId: activeFriend.userId,
      message: inputText.trim(),
      messageType: "text"
    }));

    setInputText("");
    setShowEmojiPanel(false);

    // Stop typing notification
    setTypedValue(false);
    socket.send(JSON.stringify({
      type: "typing",
      senderId: user.userId,
      receiverId: activeFriend.userId,
      isTyping: false
    }));
  };

  // Handles real dynamic image & document uploads
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "image" | "file") => {
    const file = e.target.files?.[0];
    if (!file || !activeFriend || !socket) return;

    console.log("[MESSAGE_SEND] Initiating file conversion & upload for:", file.name);

    // Reset input value so uploading the same file again triggers onChange
    e.target.value = "";
    setUploading(true);

    try {
      const resultUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const rawBase = reader.result as string;
            const b64Data = rawBase.split(",")[1]; // extract base64 segment

            console.log("[MESSAGE_SEND] Binary file read completed, uploading payload to server...");
            const res = await fetch("/api/upload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fileName: file.name, fileData: b64Data }),
            });

            if (res.ok) {
              const result = await res.json();
              console.log("[MESSAGE_SEND] Upload succeeded, static url:", result.url);
              resolve(result.url);
            } else {
              const errData = await res.json().catch(() => ({}));
              reject(new Error(errData.error || `Upload server returned code ${res.status}`));
            }
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(new Error("Local file system reading failed."));
        reader.readAsDataURL(file);
      });

      console.log("[MESSAGE_SEND] Dispatching attachment payload over active secure WS channel...");
      socket.send(JSON.stringify({
        type: "send_chat",
        senderId: user.userId,
        receiverId: activeFriend.userId,
        message: file.name,
        messageType: type,
        mediaUrl: resultUrl,
        fileName: file.name
      }));
    } catch (err: any) {
      console.error("[MESSAGE_SEND] File upload pipeline crashed:", err);
      alert(err.message || "Failed to process and transmit file.");
    } finally {
      setUploading(false);
    }
  };

  // Searching Users in modal
  const handleSearchUsers = async () => {
    if (!userSearchTerm.trim()) {
      setSearchErrorMsg("Please enter a search query.");
      setSearchSuccessMsg("");
      return;
    }

    console.log("[QUERY_NODE] Initiating query with searchTerm:", userSearchTerm);
    setIsSearchingUsers(true);
    setSearchErrorMsg("");
    setSearchSuccessMsg("");
    setUserSearchResults([]);

    try {
      const res = await fetch(`/api/users?currentUserId=${user.userId}&q=${encodeURIComponent(userSearchTerm)}`);
      
      console.log("[QUERY_NODE] Response received, status:", res.status);
      
      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await res.json();
        console.log("[QUERY_NODE] JSON payload parsed successfully, matching users count:", data.length);
        
        setUserSearchResults(data);
        if (data.length > 0) {
          setSearchSuccessMsg(`Successfully identified ${data.length} active secure nodes.`);
          setSearchErrorMsg("");
        } else {
          setSearchErrorMsg("No active secure node matched this name or email.");
          setSearchSuccessMsg("");
        }
      } else {
        console.error("[QUERY_NODE] Invalid content-type received:", contentType);
        throw new Error("Invalid format received from network node.");
      }
    } catch (err: any) {
      console.error("[QUERY_NODE] Search operations crashed:", err);
      setSearchErrorMsg(err.message || "Failed to contact secure synchronization nodes.");
      setSearchSuccessMsg("");
    } finally {
      setIsSearchingUsers(false);
    }
  };

  // Friends Actions Handlers: Add friend
  const handleAddFriend = async (emailToRequest: string) => {
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.userId, contactEmail: emailToRequest })
      });
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await res.json();
        if (res.ok) {
          setUserSearchTerm("");
          setUserSearchResults([]);
          setShowAddFriendModal(false);
          fetchFriends();
          alert("Encrypted Friend Handshake sent safely!");
        } else {
          alert(data.error || "Could not send request.");
        }
      } else {
        alert("Unexpected response format from the server. Please try again.");
      }
    } catch (err) {
      alert("Database link failed.");
    }
  };

  // Accept/Reject Requests
  const handleFriendResponse = async (contactUserId: string, action: "accept" | "reject") => {
    try {
      const res = await fetch("/api/friends/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.userId, contactUserId, action })
      });
      if (res.ok) {
        fetchFriends();
      }
    } catch (err) {
      console.error("Response handoff failed", err);
    }
  };

  // Block contact
  const handleBlockUser = async (contactUserId: string) => {
    try {
      const res = await fetch("/api/friends/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.userId, contactUserId })
      });
      if (res.ok) {
        alert("Contact blocked successfully.");
        setActiveFriend(null);
        fetchFriends();
      }
    } catch (err) {
      console.error("Blocking failed", err);
    }
  };

  // Delete relationship
  const handleRemoveFriend = async (contactUserId: string) => {
    if (!window.confirm("Are you sure you want to remove this contact?")) return;
    try {
      const res = await fetch("/api/friends/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.userId, contactUserId })
      });
      if (res.ok) {
        setActiveFriend(null);
        fetchFriends();
      }
    } catch (err) {
      console.error("Removal failed", err);
    }
  };

  // Edit Settings/Profiles
  const handleSaveProfileAndSettings = async () => {
    try {
      // 1. Save profile edit
      await fetch("/api/users/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.userId, name: customName, profileImage: customAvatar })
      });

      // 2. Save Settings payload
      await fetch(`/api/user/${user.userId}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme, soundNotifications: soundEnabled, readReceipts: readReceiptsEnabled })
      });

      // 3. Save password if typed
      if (newPassword.trim()) {
        await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email, newPassword })
        });
      }

      setShowSettingsModal(false);
      alert("Settings successfully encrypted!");
      window.location.reload(); // reboot to cleanly refresh core configs
    } catch (err) {
      alert("Could not update local node settings.");
    }
  };

  // Filter conversations
  const filteredFriends = friends.filter(col => 
    col.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter messages dynamically inside thread
  const filteredMessages = messages.filter(m => 
    m.message.toLowerCase().includes(chatSearchText.toLowerCase())
  );

  return (
    <div className={`flex flex-col h-screen ${theme === "light" ? "bg-slate-50 text-slate-800" : "bg-[#05060a] text-slate-300"} overflow-hidden font-sans transition-colors duration-200`}>
      
      {/* Primary Header Component */}
      <header className={`flex items-center justify-between px-6 py-4 border-b ${theme === "light" ? "bg-white border-slate-200" : "bg-[#05060a]/80 backdrop-blur-md border-slate-800/30"} shrink-0 z-10 shadow-lg`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center p-2.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-xl shadow-inner shadow-cyan-500/5">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className={`text-base font-semibold tracking-tight ${theme === "light" ? "text-slate-900" : "text-white"} font-sans`}>
                SecureSync Platform
              </h2>
              <span className="hidden sm:inline-flex items-center gap-1 bg-cyan-500/10 text-cyan-400 font-mono text-[9px] px-2.5 py-0.5 rounded-full border border-cyan-500/20 uppercase tracking-widest font-semibold secure-glow">
                <Lock className="w-2.5 h-2.5" />
                Active Database DMs
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Securely syncs real-time messages & contacts with persistent cloud architecture
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Mobile responsive toggle */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
            className="p-2 md:hidden hover:bg-slate-800/50 rounded-lg text-slate-400"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Theme customizer button */}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className={`p-2 rounded-lg border cursor-pointer border-slate-800/40 text-slate-400 hover:bg-slate-800/50 hover:text-white transition-colors`}
            title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Global settings button */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-2 rounded-lg border border-slate-800/40 text-slate-400 hover:bg-slate-800/50 hover:text-white transition-colors cursor-pointer"
            title="Account & Subsystem Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Key verification inspector drawer toggle */}
          <button
            onClick={() => setShowSecurityDrawer(!showSecurityDrawer)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition-colors flex items-center gap-1.5 ${
              showSecurityDrawer 
                ? "bg-cyan-600 border-cyan-500 text-white shadow-lg shadow-cyan-500/15" 
                : "bg-slate-850/50 border-slate-800/40 text-slate-300 hover:bg-slate-800/60"
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Cryptographic Console</span>
          </button>

          <button
            onClick={onLogout}
            className="p-2 border border-rose-500/20 text-rose-450 hover:bg-rose-500/10 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1 shadow-md cursor-pointer"
            title="Lock current node"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Lock Session</span>
          </button>
        </div>
      </header>

      {/* Main split-view Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Left Dashboard Panel: Profiles list & Searches (collapsible on mobile) */}
        <aside className={`${mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"} w-80 border-r ${theme === "light" ? "bg-slate-10" : "bg-[#08090f]"} p-4 flex flex-col shrink-0 absolute md:relative inset-y-0 left-0 z-20 md:z-10 transition-transform duration-300`}>
          
          {/* Current login user profile badge */}
          <div className="flex items-center justify-between p-3 bg-slate-800/10 border border-slate-800/30 rounded-2xl mb-4">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <img
                  src={user.profileImage}
                  alt={user.name}
                  referrerPolicy="no-referrer"
                  className="w-9 h-9 rounded-full bg-cyan-700 p-0.5 border border-cyan-500/45 object-cover"
                />
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-[#08090f] rounded-full" />
              </div>
              <div>
                <div className="text-sm font-semibold max-w-[120px] truncate">{user.name}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-tight">Active Node</div>
              </div>
            </div>
            
            <button
              onClick={() => setShowAddFriendModal(true)}
              className="p-1.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/25 rounded-lg cursor-pointer flex items-center gap-1 text-[11px] font-semibold"
              title="Add New Friend"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>

          {/* Live search filters inside chats list */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Filter contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0a0c14] border border-slate-800/50 rounded-xl py-2 pl-9 pr-4 text-xs focus:outline-none focus:border-cyan-500 text-slate-200 placeholder-slate-600"
            />
          </div>

          {/* Sections: Request approvals pending */}
          {friends.some(f => f.status === "pending_received") && (
            <div className="mb-4">
              <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-2 px-1">
                <Bell className="w-3.5 h-3.5 text-amber-400 animate-swing" />
                <span>Friend Invitations Incoming ({friends.filter(f => f.status === "pending_received").length})</span>
              </div>
              <div className="space-y-2">
                {friends.filter(f => f.status === "pending_received").map(peer => (
                  <div key={peer.userId} className="p-2.5 bg-amber-500/5 border border-amber-500/15 rounded-xl flex items-center justify-between text-xs transition duration-150">
                    <div className="flex items-center gap-2">
                      <img src={peer.profileImage} alt={peer.name} referrerPolicy="no-referrer" className="w-7 h-7 rounded-full object-cover" />
                      <span className="font-semibold max-w-[100px] truncate">{peer.name}</span>
                    </div>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => handleFriendResponse(peer.userId, "accept")}
                        className="px-2 py-1 bg-cyan-600 text-white font-semibold rounded text-[10px] hover:bg-cyan-500 cursor-pointer"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleFriendResponse(peer.userId, "reject")}
                        className="px-2 py-1 bg-rose-950 border border-rose-900 text-rose-350 rounded text-[10px] hover:bg-rose-900 cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Core Friends thread roster sorted by conversation relevance */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3 px-1">
              <Users className="w-4 h-4 text-cyan-400" />
              <span>Verified Friends ({friends.filter(f => f.status === "accepted").length})</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 py-1">
              {filteredFriends.filter(f => f.status === "accepted").map((peer) => {
                const isSelected = activeFriend && activeFriend.userId === peer.userId;
                return (
                  <div
                    key={peer.userId}
                    onClick={() => {
                      setActiveFriend(peer);
                      fetchMessages(peer.userId);
                      setMobileMenuOpen(false);
                    }}
                    className={`p-3 rounded-xl flex items-center justify-between transition-all duration-150 cursor-pointer border ${
                      isSelected 
                        ? "bg-cyan-500/15 border-cyan-500/25 shadow-md" 
                        : "bg-slate-800/10 hover:bg-slate-800/30 border-slate-800/10"
                    }`}
                  >
                    <div className="flex items-center gap-3 w-full overflow-hidden">
                      <div className="relative shrink-0">
                        <img
                          src={peer.profileImage}
                          alt={peer.name}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-full border border-slate-800/50 object-cover"
                        />
                        <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 ${
                          peer.onlineStatus === "online" ? "bg-green-500 border-black" : "bg-slate-600 border-black"
                        }`} />
                      </div>
                      
                      <div className="flex-1 min-w-0 pr-1">
                        <div className="flex justify-between items-baseline mb-0.5">
                          <h4 className={`text-sm font-semibold truncate ${isSelected ? "text-cyan-300" : "text-slate-100"}`}>
                            {peer.name}
                          </h4>
                          {peer.lastMessage && (
                            <span className="text-[9px] text-slate-500">
                              {new Date(peer.lastMessage.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                        
                        <p className="text-xs text-slate-505 truncate">
                          {peer.lastMessage ? (
                            peer.lastMessage.messageType === "text" 
                              ? peer.lastMessage.message 
                              : `📁 attachment: ${peer.lastMessage.message}`
                          ) : (
                            <span className="text-slate-600 italic">No message transactions</span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Unread count pill and delivery indicators */}
                    <div className="flex flex-col items-end gap-1 shrink-0 ml-1.5">
                      {peer.unreadMessageCount > 0 && (
                        <span className="bg-cyan-500 text-white font-extrabold text-[9px] w-4.5 h-4.5 rounded-full flex items-center justify-center animate-pulse">
                          {peer.unreadMessageCount}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {friends.filter(f => f.status === "accepted").length === 0 && (
                <div className="text-center py-10 px-4 border border-dashed border-slate-800/30 rounded-2xl text-slate-500 text-xs">
                  Awaiting friend profiles to start live cryptographic communications... Try adding a contact above!
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Center Canvas: Active conversation messages console */}
        <main className="flex-1 flex flex-col bg-[#05060a] overflow-hidden">
          {activeFriend ? (
            <>
              {/* Active Conversation Top Header bar */}
              <div className={`flex items-center justify-between px-6 py-3 border-b border-slate-800/20 shadow-md ${theme === "light" ? "bg-white" : "bg-[#05060a]"}`}>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <img
                      src={activeFriend.profileImage}
                      alt={activeFriend.name}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full border border-slate-850 object-cover"
                    />
                    <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 ${
                      activeFriend.onlineStatus === "online" ? "bg-green-500 border-black" : "bg-slate-600 border-black"
                    }`} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">{activeFriend.name}</h3>
                    <p className="text-[10px] text-slate-500">
                      {activeFriend.onlineStatus === "online" 
                        ? "Active now inside Encrypted Direct Bridge" 
                        : `Last active: ${new Date(activeFriend.lastSeen).toLocaleTimeString()}`
                      }
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Chat Search Input */}
                  <div className="relative hidden lg:block mr-2">
                    <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search messages..."
                      value={chatSearchText}
                      onChange={(e) => setChatSearchText(e.target.value)}
                      className="bg-[#0a0c14] border border-slate-800/40 rounded-lg py-1 pl-7 pr-3 text-xs w-44 text-slate-300 pointer-events-auto"
                    />
                  </div>

                  {/* Call Panel WebRTC connectors */}
                  <button
                    onClick={() => onStartCall(activeFriend.userId, activeFriend.name, "audio")}
                    className="p-2.5 bg-[#0a0c14] hover:bg-cyan-600/20 text-slate-400 hover:text-cyan-400 rounded-lg border border-slate-800/60 transition-colors cursor-pointer"
                    title={`Initiate voice handshake with ${activeFriend.name}`}
                  >
                    <Phone className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onStartCall(activeFriend.userId, activeFriend.name, "video")}
                    className="p-2.5 bg-[#0a0c14] hover:bg-cyan-600/20 text-slate-400 hover:text-cyan-400 rounded-lg border border-slate-800/60 transition-colors cursor-pointer"
                    title={`Initiate video handshake with ${activeFriend.name}`}
                  >
                    <Video className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleRemoveFriend(activeFriend.userId)}
                    className="p-2.5 bg-slate-850 hover:bg-red-500/10 border border-slate-800/60 hover:border-red-500/25 text-slate-400 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                    title="Remove Contact"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleBlockUser(activeFriend.userId)}
                    className="px-2 py-1 bg-red-950 border border-red-900 text-rose-350 hover:bg-rose-900 duration-150 text-[10px] font-bold rounded cursor-pointer uppercase tracking-tight"
                  >
                    Block User
                  </button>
                </div>
              </div>

              {/* Chat messages canvas feed */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {filteredMessages.map((msg) => {
                  const isMe = msg.senderId === user.userId;
                  return (
                    <div 
                      key={msg.chatId} 
                      className={`flex ${isMe ? "justify-end" : "justify-start"} animate-fade-in`}
                    >
                      <div className="max-w-[75%] space-y-1">
                        
                        {/* Header metadata */}
                        <div className={`text-[10px] text-slate-500 flex items-center gap-1.5 px-1 ${isMe ? "justify-end" : "justify-start"}`}>
                          <span className="font-semibold text-slate-400">
                            {isMe ? "You" : activeFriend.name}
                          </span>
                          <span>·</span>
                          <span>
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>

                        {/* Interactive Message Bubble */}
                        <div className={`relative px-4 py-3 rounded-2xl text-[13px] md:text-[14px] border ${
                          isMe 
                            ? "bg-blue-600/20 border-blue-500/30 text-blue-100 rounded-tr-none shadow-lg shadow-blue-500/5" 
                            : "bg-slate-800/40 border-slate-700/30 text-slate-200 rounded-tl-none shadow-lg shadow-slate-950/20"
                        }`}>
                          
                          {/* Rich attachment rendering */}
                          {msg.messageType === "image" && msg.mediaUrl ? (
                            <div className="mb-2 rounded-lg overflow-hidden border border-slate-800">
                              <img 
                                src={msg.mediaUrl} 
                                alt="Shared Image attachment" 
                                referrerPolicy="no-referrer"
                                className="max-h-64 object-contain max-w-full hover:scale-105 duration-200" 
                              />
                            </div>
                          ) : msg.messageType === "file" && msg.mediaUrl ? (
                            <div className="mb-2 p-2.5 rounded-lg bg-[#05060a] border border-slate-800 flex items-center gap-2">
                              <Paperclip className="w-5 h-5 text-cyan-400 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs text-white font-medium truncate">{msg.fileName}</p>
                                <span className="text-[10px] text-slate-500">Document file</span>
                              </div>
                              <a 
                                href={msg.mediaUrl} 
                                download={msg.fileName}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1 px-2.5 bg-cyan-600 text-white hover:bg-cyan-500 transition font-bold rounded text-[10px] shrink-0"
                              >
                                Download
                              </a>
                            </div>
                          ) : null}

                          <p className="leading-relaxed break-words whitespace-pre-wrap">{msg.message}</p>
                          
                          {/* Footer seen/delivered ticket */}
                          <div className="flex items-center justify-between gap-1 mt-1.5 pt-1.5 border-t border-slate-800/30 text-[9px]">
                            <span className="text-cyan-400 flex items-center gap-1 font-mono font-medium">
                              <Lock className="w-2.5 h-2.5" />
                              Encrypted DB Payload
                            </span>
                            
                            {isMe && (
                              <span className="flex items-center gap-0.5" title={msg.seen ? "Seen by contact" : "Delivered safely"}>
                                {msg.seen ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-blue-450" />
                                ) : (
                                  <Check className="w-3.5 h-3.5 text-slate-500" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>

                      </div>
                    </div>
                  );
                })}

                {typingPeerId && (
                  <div className="flex justify-start items-center gap-2 text-slate-500 text-xs italic pl-2">
                    <span className="inline-flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" />
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce delay-150" />
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce delay-300" />
                    </span>
                    <span>{activeFriend.name} is typing secure payload...</span>
                  </div>
                )}

                {filteredMessages.length === 0 && (
                  <div className="text-center py-10 text-slate-600 italic text-xs">
                    {chatSearchText ? "No matching messages found." : "Secure room thread initialized."}
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input controls footer panel with rich additions */}
              <footer className="p-4 bg-[#05060a] border-t border-slate-800/30 shrink-0 relative">
                
                {/* Visual Emoji expander */}
                <AnimatePresence>
                  {showEmojiPanel && (
                    <motion.div 
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 15 }}
                      className="absolute bottom-20 left-4 bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-xl z-20 flex flex-wrap gap-2.5 max-w-xs"
                    >
                      {standardEmojis.map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => setInputText(prev => prev + em)}
                          className="hover:scale-125 text-lg p-1 transition cursor-pointer"
                        >
                          {em}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                <form onSubmit={handleSendTextMessage} className="flex gap-3 items-center bg-[#0a0c14] border border-slate-800/50 rounded-2xl p-2.5">
                  <div className="flex items-center gap-2 pl-1 shrink-0">
                    
                    {/* Emoji trigger */}
                    <button
                      type="button"
                      onClick={() => setShowEmojiPanel(!showEmojiPanel)}
                      className="text-slate-500 hover:text-cyan-400 transition cursor-pointer"
                      title="Insert emoji"
                    >
                      <Smile className="w-5 h-5" />
                    </button>

                    {/* Image Attachment Trigger */}
                    <label className="text-slate-500 hover:text-cyan-450 transition cursor-pointer relative">
                      <Image className="w-5 h-5" />
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={(e) => handleFileUpload(e, "image")}
                        className="hidden" 
                      />
                    </label>

                    {/* Document Upload Trigger */}
                    <label className="text-slate-500 hover:text-cyan-450 transition cursor-pointer relative">
                      <Paperclip className="w-5 h-5" />
                      <input 
                        type="file" 
                        onChange={(e) => handleFileUpload(e, "file")}
                        className="hidden" 
                      />
                    </label>
                  </div>

                  <div className="relative flex-1 flex items-center">
                    <input
                      type="text"
                      placeholder={uploading ? "Uploading attachment..." : `Secure message ${activeFriend.name}...`}
                      disabled={uploading}
                      value={inputText}
                      onChange={handleInputChange}
                      className="w-full bg-transparent border-0 ring-0 focus:ring-0 focus:outline-none py-1.5 pl-2 pr-2 text-xs md:text-sm text-slate-100 placeholder-slate-500"
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="submit"
                      disabled={!inputText.trim() || uploading}
                      className="w-9 h-9 bg-cyan-500 hover:bg-cyan-450 disabled:bg-slate-800 text-white rounded-lg flex items-center justify-center transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-45"
                      title="Dispatch message"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              </footer>
            </>
          ) : (
            // Idle dashboard visualization
            <div className="flex-1 flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-4">
              <div className="p-4 rounded-full bg-slate-900/40 border border-slate-800/30 text-slate-500 shadow-inner shadow-cyan-500/5">
                <MessageSquare className="w-8 h-8 text-cyan-500" />
              </div>
              <div className="space-y-1">
                <h3 className="text-white font-semibold">Active direct chat required</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Select a contact on the left dashboard sidebar to initiate a secure encrypted chat, file sharing, and voice/video calling.
                </p>
              </div>
            </div>
          )}
        </main>

        {/* Right drawer: live telemetry from Cryptography subsystem */}
        {showSecurityDrawer && (
          <aside className="w-80 border-l border-slate-800/30 bg-[#08090f] p-4 shrink-0 overflow-y-auto animate-slide-in">
            <SecurityConsole
              myId={user.userId}
              myName={user.name}
              peers={friends.filter(f => f.status === "accepted").map(f => ({
                id: f.userId,
                name: f.name
              }))}
            />
          </aside>
        )}

      </div>

      {/* MODAL: ADD FRIEND / COMPANION SEARCH FORM */}
      <AnimatePresence>
        {showAddFriendModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-[#08090f] border border-slate-800/80 rounded-2xl p-6 shadow-2xl space-y-4"
            >
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-cyan-400" />
                  Request Encrypted Peer Connection
                </h3>
                <button 
                  onClick={() => { 
                    setShowAddFriendModal(false); 
                    setUserSearchResults([]); 
                    setUserSearchTerm(""); 
                    setSearchErrorMsg("");
                    setSearchSuccessMsg("");
                  }} 
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-slate-400">
                  Search other active secure nodes by identity name or email address to swap handshake credentials:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter email e.g., bob@securesync.net"
                    value={userSearchTerm}
                    onChange={(e) => setUserSearchTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !isSearchingUsers) {
                        e.preventDefault();
                        handleSearchUsers();
                      }
                    }}
                    disabled={isSearchingUsers}
                    className="flex-1 bg-[#0a0c14] border border-slate-800 text-xs text-white rounded-lg p-2.5 focus:outline-none focus:border-cyan-400 disabled:opacity-50"
                  />
                  <button 
                    onClick={handleSearchUsers}
                    disabled={isSearchingUsers}
                    className="px-3 py-1.5 bg-cyan-600 font-bold hover:bg-cyan-500 text-white rounded-lg text-xs cursor-pointer disabled:opacity-50 flex items-center gap-1"
                  >
                    {isSearchingUsers ? "Querying..." : "Query Node"}
                  </button>
                </div>
              </div>

              {/* Loader, Success, and Error cues */}
              {isSearchingUsers && (
                <div className="text-center py-2 text-xs text-slate-400 flex items-center justify-center gap-2">
                  <div className="w-3 h-3 border-2 border-t-amber-400 border-cyan-400/20 rounded-full animate-spin"></div>
                  <span>Searching the secure ledger net...</span>
                </div>
              )}

              {searchErrorMsg && (
                <p className="text-xs text-rose-400 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                  ⚠️ {searchErrorMsg}
                </p>
              )}

              {searchSuccessMsg && (
                <p className="text-xs text-emerald-400 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                  ✓ {searchSuccessMsg}
                </p>
              )}

              {/* Search results list */}
              {userSearchResults.length > 0 && (
                <div className="border border-slate-800 rounded-xl max-h-48 overflow-y-auto p-2 bg-slate-950 space-y-1.5">
                  {userSearchResults.map((usr) => (
                    <div key={usr.userId} className="p-2 bg-slate-900 border border-slate-850 rounded-lg flex items-center justify-between text-xs animate-fade-in">
                      <div className="flex items-center gap-2">
                        <img src={usr.profileImage} alt={usr.name} referrerPolicy="no-referrer" className="w-8 h-8 rounded-full object-cover" />
                        <div>
                          <p className="font-semibold text-white">{usr.name}</p>
                          <p className="text-[10px] text-slate-500">{usr.email}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleAddFriend(usr.email)}
                        className="p-1 px-2 bg-cyan-600 hover:bg-cyan-500 font-bold text-[10px] text-white rounded cursor-pointer"
                      >
                        Request Add
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: ACCOUNT & CHIP CONFIGURATOR */}
      <AnimatePresence>
        {showSettingsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg bg-[#08090f] border border-slate-800/80 rounded-3xl p-6 shadow-2xl space-y-5"
            >
              <div className="flex justify-between items-center border-b border-warm-gray-200 border-slate-850 pb-3">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-cyan-400 animate-spin-slow" />
                  Account & Subsystem Configurations
                </h3>
                <button onClick={() => setShowSettingsModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                
                {/* Profile editor column */}
                <div className="space-y-3 border-r border-slate-800/30 pr-0 md:pr-4">
                  <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-widest">General Identity Profile</h4>
                  
                  <div>
                    <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Nickname</label>
                    <input
                      type="text"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      className="w-full bg-[#0a0c14] border border-slate-800 rounded-lg p-2.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 font-bold uppercase block mb-2">Avatar Source URL</label>
                    <input
                      type="text"
                      value={customAvatar}
                      onChange={(e) => setCustomAvatar(e.target.value)}
                      className="w-full bg-[#0a0c14] border border-slate-800 rounded-lg p-2.5 text-white font-mono text-[10px]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Change Keycode credentials</label>
                    <input
                      type="password"
                      placeholder="Leave empty to keep current"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full bg-[#0a0c14] border border-slate-800 rounded-lg p-2.5 text-white placeholder-slate-650"
                    />
                  </div>
                </div>

                {/* Subsystem settings column */}
                <div className="space-y-3.5 pl-0 md:pl-2">
                  <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-widest">Environment Variables</h4>
                  
                  <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-slate-850">
                    <span className="flex items-center gap-2">
                      {soundEnabled ? <Volume2 className="w-4 h-4 text-green-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
                      <span>Audio Notifiers</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={soundEnabled}
                      onChange={(e) => setSoundEnabled(e.target.checked)}
                      className="w-4 h-4 text-cyan-500 rounded focus:ring-cyan-400 bg-slate-950 border-slate-800"
                    />
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-slate-850">
                    <span className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-blue-400" />
                      <span>Read Receipts</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={readReceiptsEnabled}
                      onChange={(e) => setReadReceiptsEnabled(e.target.checked)}
                      className="w-4 h-4 text-cyan-500 rounded focus:ring-cyan-400 bg-slate-950 border-slate-800"
                    />
                  </div>

                  <div className="p-3 bg-cyan-950/25 border border-cyan-900/40 rounded-xl space-y-1 text-cyan-400 text-[10px]">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    <p className="font-semibold text-cyan-200">Session Handshake:</p>
                    <code className="font-mono block truncate">{user.userId}</code>
                    <p className="text-[9px]">Registered in local Database cluster sync matrix.</p>
                  </div>
                </div>

              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800/40">
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:text-white transition rounded-xl font-semibold text-xs cursor-pointer"
                >
                  Discard
                </button>
                <button
                  onClick={handleSaveProfileAndSettings}
                  className="px-4 py-2 bg-cyan-600 text-white font-semibold hover:bg-cyan-500 transition rounded-xl text-xs cursor-pointer"
                >
                  Decrypt & Persist Changes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
