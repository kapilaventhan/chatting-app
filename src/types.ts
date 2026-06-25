export interface UserSession {
  userId: string;
  name: string;
  email: string;
  profileImage: string;
  createdAt: number;
}

export interface FriendContact {
  userId: string;
  name: string;
  email: string;
  profileImage: string;
  status: "pending_sent" | "pending_received" | "accepted" | "blocked";
  onlineStatus: "online" | "offline";
  lastSeen: number;
  lastMessage: {
    message: string;
    messageType: "text" | "image" | "file";
    timestamp: number;
    senderId: string;
    seen: boolean;
    delivered: boolean;
  } | null;
  unreadMessageCount: number;
}

export interface Message {
  chatId: string;
  senderId: string;
  receiverId: string;
  message: string;
  messageType: "text" | "image" | "file";
  timestamp: number;
  delivered: boolean;
  seen: boolean;
  mediaUrl?: string;
  fileName?: string;
}

export interface CallLog {
  callId: string;
  callerId: string;
  receiverId: string;
  callType: "audio" | "video";
  startTime: number;
  endTime: number;
  status: "ringing" | "connected" | "missed" | "rejected" | "ended";
}

export interface UserSettings {
  userId: string;
  theme: "dark" | "light";
  soundNotifications: boolean;
  readReceipts: boolean;
}

export interface PeerInfo {
  id: string;
  name: string;
  publicKeyJwk?: JsonWebKey | null;
}

export type CallType = 'audio' | 'video';
export type CallStatus = 'idle' | 'calling' | 'incoming' | 'connecting' | 'connected' | 'declined' | 'busy' | 'ended';

export interface CallSession {
  callId?: string;
  peerId: string;
  peerName: string;
  type: CallType;
  status: CallStatus;
  isInitiator: boolean;
}
