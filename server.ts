import express from "express";
import path from "path";
import fs from "fs";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { dbStore, DbUser, DbFriend, DbChat, DbCall, DbUserSettings } from "./db-store";

// Ensure upload directory exists
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

interface SocketClient {
  ws: WebSocket;
  userId: string;
}

const activeSockets = new Map<WebSocket, SocketClient>();
const activeCalls = new Map<string, string>(); // maps userId <-> partnerId for P2P teardown on socket disconnect

// Helper to push to target active user
function sendToUserSocket(userId: string, data: any): boolean {
  let sent = false;
  for (const [ws, info] of activeSockets.entries()) {
    if (info.userId === userId && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
      sent = true;
    }
  }
  return sent;
}

// Broadcaster to all online users to notify presence / state
function broadcastPresence(userId: string, status: "online" | "offline") {
  const payload = {
    type: "presence_change",
    userId,
    status,
    lastSeen: Date.now()
  };
  for (const [ws, info] of activeSockets.entries()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  
  // Parse body: support large base64 uploads easily
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Static serving for uploaded user files
  app.use("/uploads", express.static(UPLOADS_DIR));

  // --- REST API ENDPOINTS ---

  // Auth: Sign Up
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { name, email, password, profileImage } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const existingUser = dbStore.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: "Email already registered" });
      }

      // Simple password encryption for this level of standard application
      const passwordHash = Buffer.from(password).toString("base64");
      
      const defaultAvatar = profileImage || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`;
      
      const user = await dbStore.createUser({
        name,
        email,
        passwordHash,
        profileImage: defaultAvatar,
      });

      res.status(201).json({
        success: true,
        user: {
          userId: user.userId,
          name: user.name,
          email: user.email,
          profileImage: user.profileImage,
          createdAt: user.createdAt
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Auth: Login
  app.post("/api/auth/login", (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Missing email or password" });
      }

      const user = dbStore.getUserByEmail(email);
      if (!user) {
        return res.status(400).json({ error: "Invalid credentials" });
      }

      const passwordHash = Buffer.from(password).toString("base64");
      if (user.passwordHash !== passwordHash) {
        return res.status(400).json({ error: "Invalid credentials" });
      }

      res.json({
        success: true,
        user: {
          userId: user.userId,
          name: user.name,
          email: user.email,
          profileImage: user.profileImage,
          createdAt: user.createdAt
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Auth: Password Reset Code
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { email, newPassword } = req.body;
      const user = dbStore.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ error: "User with this email not found" });
      }

      user.passwordHash = Buffer.from(newPassword).toString("base64");
      res.json({ success: true, message: "Password updated successfully" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Auth: Session Restoration and Sync Sync
  app.post("/api/auth/sync", async (req, res) => {
    try {
      const { user, friends, messages, calls, settings } = req.body;
      if (!user || !user.userId) {
        return res.status(400).json({ error: "Missing sync user payload" });
      }

      const syncResult = await dbStore.syncRestorePayload({
        user,
        friends: friends || [],
        messages: messages || [],
        calls: calls || [],
        settings: settings
      });

      res.json({ success: true, syncResult });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // User Profile edit
  app.post("/api/users/profile", async (req, res) => {
    try {
      const { userId, name, profileImage } = req.body;
      const updated = await dbStore.updateUserProfile(userId, name, profileImage);
      if (!updated) {
        return res.status(444).json({ error: "User not found" });
      }
      res.json({ success: true, user: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get User Profile
  app.get("/api/users/profile/:userId", (req, res) => {
  console.log(
    "[PROFILE REQUEST]",
    req.params.userId,
    "FOUND:",
    !!dbStore.getUserById(req.params.userId)
  );

  const user = dbStore.getUserById(req.params.userId);

  if (!user) {
    console.log("[PROFILE MISSING]", req.params.userId);
    return res.status(404).json({ error: "User not found" });
  }

  res.json(user);
});

  // Fetch Users to search/add
  app.get("/api/users", (req, res) => {
    try {
      const currentUserId = req.query.currentUserId as string;
      const search = (req.query.q as string || "").toLowerCase();
      
      let allUsers = dbStore.getUsers()
        .filter(u => u.userId !== currentUserId)
        .map(u => ({
          userId: u.userId,
          name: u.name,
          email: u.email,
          profileImage: u.profileImage,
          status: u.status,
          lastSeen: u.lastSeen
        }));

      if (search) {
        allUsers = allUsers.filter(u => 
          u.name.toLowerCase().includes(search) || 
          u.email.toLowerCase().includes(search)
        );
      }

      res.json(allUsers);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Fetch complete Friend entries & details with last message & metrics
  app.get("/api/friends/:userId", (req, res) => {
    try {
      const { userId } = req.params;
      const connections = dbStore.getFriendsOfUser(userId);
      
      const formattedFriends = connections.map(friend => {
        const contact = dbStore.getUserById(friend.contactUserId);
        if (!contact) return null;

        const messages = dbStore.getMessagesBetween(userId, friend.contactUserId);
        const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
        const unreadCount = messages.filter(m => m.senderId === friend.contactUserId && !m.seen).length;

        return {
          friendId: friend.friendId,
          userId: contact.userId,
          name: contact.name,
          email: contact.email,
          profileImage: contact.profileImage,
          status: friend.status, // "pending_sent" | "pending_received" | "accepted" | "blocked"
          onlineStatus: contact.status, // "online" | "offline"
          lastSeen: contact.lastSeen,
          lastMessage: lastMsg ? {
            message: lastMsg.message,
            messageType: lastMsg.messageType,
            timestamp: lastMsg.timestamp,
            senderId: lastMsg.senderId,
            seen: lastMsg.seen,
            delivered: lastMsg.delivered
          } : null,
          unreadMessageCount: unreadCount,
          addedAt: friend.addedAt
        };
      }).filter(Boolean);

      // Sort friends:
      // 1. Accepted friends sorted by latest conversation timestamp
      // 2. Pending and others below
      const sorted = formattedFriends.sort((a, b) => {
        if (a!.status === "accepted" && b!.status === "accepted") {
          const tA = a!.lastMessage ? a!.lastMessage.timestamp : 0;
          const tB = b!.lastMessage ? b!.lastMessage.timestamp : 0;
          return tB - tA; // latest first
        }
        return a!.status.localeCompare(b!.status);
      });

      res.json(sorted);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Handle Send Friend Request
  app.post("/api/friends/request", async (req, res) => {
    try {
      const { userId, contactEmail } = req.body;
      const targetUser = dbStore.getUserByEmail(contactEmail);
      if (!targetUser) {
        return res.status(404).json({ error: "User with this email does not exist." });
      }

      const success = await dbStore.sendFriendRequest(userId, targetUser.userId);
      if (!success) {
        return res.status(400).json({ error: "Friend request already exists or is pending." });
      }

      // Live notify target user if online
      sendToUserSocket(targetUser.userId, {
        type: "incoming_friend_request",
        senderId: userId,
        notification: `New friend request from ${dbStore.getUserById(userId)?.name}`
      });

      res.json({ success: true, targetUser });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Respond Friend Request
  app.post("/api/friends/respond", async (req, res) => {
    try {
      const { userId, contactUserId, action } = req.body; // action: "accept" or "reject"
      const accept = action === "accept";

      const success = await dbStore.respondFriendRequest(userId, contactUserId, accept);
      if (!success) {
        return res.status(400).json({ error: "Handshake reference not found." });
      }

      if (accept) {
        // Send updates
        sendToUserSocket(contactUserId, {
          type: "friend_request_accepted",
          userId: userId,
          notification: `${dbStore.getUserById(userId)?.name} accepted your friend request!`
        });
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Remove Friend
  app.post("/api/friends/remove", async (req, res) => {
    try {
      const { userId, contactUserId } = req.body;
      const success = await dbStore.removeFriend(userId, contactUserId);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Block User
  app.post("/api/friends/block", async (req, res) => {
    try {
      const { userId, contactUserId } = req.body;
      const success = await dbStore.blockUser(userId, contactUserId);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Fetch Message History
  app.get("/api/chats/:u1/:u2", (req, res) => {
    try {
      const { u1, u2 } = req.params;
      const msgs = dbStore.getMessagesBetween(u1, u2);
      res.json(msgs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Mark Chat seen status
  app.post("/api/chats/mark-seen", async (req, res) => {
    try {
      const { senderId, receiverId } = req.body;
      await dbStore.markMessagesAsSeen(senderId, receiverId);
      
      // Notify sender that they were read
      sendToUserSocket(senderId, {
        type: "messages_seen",
        viewerId: receiverId
      });

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Pure Base64 File Uploader (Requires NO packages, 100% reliable)
  app.post("/api/upload", (req, res) => {
    try {
      const { fileName, fileData } = req.body;
      if (!fileName || !fileData) {
        return res.status(400).json({ error: "Missing uploaded parts" });
      }

      const buffer = Buffer.from(fileData, "base64");
      const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${fileName}`;
      const filePath = path.join(UPLOADS_DIR, uniqueName);

      fs.writeFileSync(filePath, buffer);

      const staticUrl = `/uploads/${uniqueName}`;
      res.json({ success: true, url: staticUrl });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Fetch & update call logs
  app.post("/api/calls/log", async (req, res) => {
    try {
      const { callerId, receiverId, callType } = req.body;
      const log = await dbStore.createCallLog({ callerId, receiverId, callType, status: "ringing" });
      res.json({ success: true, callLog: log });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/calls/log/:id/end", async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      await dbStore.endCallLog(id, Date.now(), status);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/calls/history/:userId", (req, res) => {
    try {
      const { userId } = req.params;
      const list = dbStore.getCallsHistory(userId);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // User Settings Manager
  app.get("/api/user/:userId/settings", (req, res) => {
    try {
      const settings = dbStore.getSettings(req.params.userId);
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/user/:userId/settings", async (req, res) => {
    try {
      const updated = await dbStore.updateSettings(req.params.userId, req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", timestamp: Date.now() });
  });

  // Setup WS signalling server
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws: WebSocket) => {
    activeSockets.set(ws, { ws, userId: "" });

    ws.on("message", async (msgString) => {
      try {
        const payload = JSON.parse(msgString.toString());
        const { type } = payload;

        switch (type) {
          case "register": {
            const { userId } = payload;
            const updatedClient = activeSockets.get(ws);
            if (updatedClient) {
              updatedClient.userId = userId;
              await dbStore.updateUserStatus(userId, "online");
              
              // Broadcast user presence online
              broadcastPresence(userId, "online");

              // Auto deliver pending messages
              await dbStore.markMessagesAsDelivered(userId);
            }
            break;
          }

          case "send_chat": {
            const { senderId, receiverId, message, messageType, mediaUrl, fileName } = payload;
            
            // Write to database
            const dbChat = await dbStore.insertMessage({
              senderId,
              receiverId,
              message,
              messageType,
              mediaUrl,
              fileName,
            });

            const isOnline = sendToUserSocket(receiverId, {
              type: "receive_chat",
              chat: dbChat
            });

            if (isOnline) {
              dbChat.delivered = true;
            }

            // Sync back to sender (to assure database ID mapping)
            ws.send(JSON.stringify({
              type: "sent_ack",
              chat: dbChat
            }));
            break;
          }

          case "typing": {
            const { senderId, receiverId, isTyping } = payload;
            sendToUserSocket(receiverId, {
              type: "typing_broadcast",
              senderId,
              isTyping
            });
            break;
          }

          case "invite_call": {
            console.log("[CALL INVITE]", payload);
            const { callerId, callerName, receiverId, callType, callId } = payload;
            console.log(`[P2P] call invitation sent from ${callerId} (${callerName}) to ${receiverId}`);
            activeCalls.set(callerId, receiverId);
            activeCalls.set(receiverId, callerId);
            const sent = sendToUserSocket(receiverId, {
  type: "incoming_call_request",
  callerId,
  callerName,
  callType,
  callId
});

console.log(
  "[CALL INVITE SENT]",
  receiverId,
  sent ? "SUCCESS" : "FAILED"
);
            break;
          }

          case "respond_call": {
            console.log("[CALL RESPONSE]", payload);
            const { receiverId, callerId, answer, sdp, callType } = payload; // answer: "accept" | "reject" | "busy"
            console.log(`[P2P] call invitation response by ${receiverId} is ${answer}`);
            if (answer !== "accept") {
              activeCalls.delete(callerId);
              activeCalls.delete(receiverId);
            }
            const sent = sendToUserSocket(callerId, {
  type: "call_invitation_response",
  receiverId,
  answer,
  sdp,
  callType
});

console.log(
  "[CALL RESPONSE SENT]",
  callerId,
  sent ? "SUCCESS" : "FAILED"
);
            break;
          }

        case "webrtc_signaling": {
     const { targetId, signal } = payload;

  console.log(
    `[WEBRTC SIGNAL] ${activeSockets.get(ws)?.userId} -> ${targetId}`,
    signal.type || "ICE"
  );

  sendToUserSocket(targetId, {
    type: "webrtc_signaling_forward",
    senderId: activeSockets.get(ws)?.userId,
    signal
  });

  break;
}

          case "hangup_call": {
            const { partnerId } = payload;
            console.log(`[P2P] call hangup requested by active client targeting ${partnerId}`);
            const myClient = activeSockets.get(ws);
            if (myClient && myClient.userId) {
              activeCalls.delete(myClient.userId);
            }
            if (partnerId) {
              activeCalls.delete(partnerId);
            }
            sendToUserSocket(partnerId, {
              type: "partner_hangup"
            });
            break;
          }
        }

      } catch (err) {
        console.error("Error managing socket message payload:", err);
      }
    });

    ws.on("close", async () => {
      const client = activeSockets.get(ws);
      if (client && client.userId) {
        console.log(`[REALTIME] Socket closed for userId: ${client.userId}`);
        await dbStore.updateUserStatus(client.userId, "offline");
        broadcastPresence(client.userId, "offline");

        // Disconnect calling partner if currently in call
        const partnerId = activeCalls.get(client.userId);
        if (partnerId) {
          console.log(`[P2P] notifying active partner ${partnerId} about connection loss of ${client.userId}`);
          sendToUserSocket(partnerId, {
            type: "partner_hangup"
          });
          activeCalls.delete(client.userId);
          activeCalls.delete(partnerId);
        }

        activeSockets.delete(ws);
      }
    });

    ws.on("error", (err) => {
      console.error("Socket socket-lifecycle error:", err);
    });
  });

  // Serve Vite assets in development or build outputs in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Live sync multi-user database server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("CRITICAL API SERVER BOOT ERROR:", error);
});
