var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path2 = __toESM(require("path"), 1);
var import_fs2 = __toESM(require("fs"), 1);
var import_http = require("http");
var import_ws = require("ws");
var import_vite = require("vite");

// db-store.ts
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
var DB_FILE_PATH = import_path.default.join(process.cwd(), "database.json");
var DatabaseStore = class {
  constructor() {
    this.data = {
      users: [],
      friends: [],
      chats: [],
      calls: [],
      settings: []
    };
    this.writeQueue = Promise.resolve();
    this.load();
  }
  load() {
    try {
      if (import_fs.default.existsSync(DB_FILE_PATH)) {
        const raw = import_fs.default.readFileSync(DB_FILE_PATH, "utf8");
        this.data = JSON.parse(raw);
        this.data.users = this.data.users || [];
        this.data.friends = this.data.friends || [];
        this.data.chats = this.data.chats || [];
        this.data.calls = this.data.calls || [];
        this.data.settings = this.data.settings || [];
      } else {
        this.saveSync();
      }
    } catch (err) {
      console.error("Failed to load database.json, resetting...", err);
      this.saveSync();
    }
  }
  saveSync() {
    try {
      import_fs.default.writeFileSync(DB_FILE_PATH, JSON.stringify(this.data, null, 2), "utf8");
    } catch (err) {
      console.error("Failed to write database.json", err);
    }
  }
  triggerSave() {
    this.writeQueue = this.writeQueue.then(() => {
      return new Promise((resolve) => {
        import_fs.default.writeFile(DB_FILE_PATH, JSON.stringify(this.data, null, 2), "utf8", (err) => {
          if (err) {
            console.error("Async write to database.json failed:", err);
          }
          resolve();
        });
      });
    });
    return this.writeQueue;
  }
  // --- Users Operations ---
  getUsers() {
    return this.data.users;
  }
  getUserByEmail(email) {
    return this.data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }
  getUserById(userId) {
    return this.data.users.find((u) => u.userId === userId);
  }
  async createUser(user) {
    const newUser = {
      ...user,
      userId: "u-" + Math.random().toString(36).substring(2, 10),
      status: "offline",
      lastSeen: Date.now(),
      createdAt: Date.now()
    };
    this.data.users.push(newUser);
    const defaultSettings = {
      userId: newUser.userId,
      theme: "dark",
      soundNotifications: true,
      readReceipts: true
    };
    this.data.settings.push(defaultSettings);
    await this.triggerSave();
    return newUser;
  }
  async updateUserStatus(userId, status) {
    const user = this.getUserById(userId);
    if (user) {
      user.status = status;
      user.lastSeen = Date.now();
      await this.triggerSave();
    }
  }
  async updateUserProfile(userId, name, profileImage) {
    const user = this.getUserById(userId);
    if (user) {
      user.name = name;
      user.profileImage = profileImage;
      await this.triggerSave();
    }
    return user;
  }
  // --- Friends Operations ---
  getFriendsOfUser(userId) {
    return this.data.friends.filter((f) => f.userId === userId);
  }
  async sendFriendRequest(userId, contactUserId) {
    if (userId === contactUserId) return false;
    const existing = this.data.friends.find(
      (f) => f.userId === userId && f.contactUserId === contactUserId
    );
    if (existing) return false;
    const requestSent = {
      friendId: "fr-" + Math.random().toString(36).substring(2, 10),
      userId,
      contactUserId,
      status: "pending_sent",
      addedAt: Date.now()
    };
    const requestReceived = {
      friendId: "fr-" + Math.random().toString(36).substring(2, 10),
      userId: contactUserId,
      contactUserId: userId,
      status: "pending_received",
      addedAt: Date.now()
    };
    this.data.friends.push(requestSent, requestReceived);
    await this.triggerSave();
    return true;
  }
  async respondFriendRequest(userId, contactUserId, accept) {
    const pivotSend = this.data.friends.find((f) => f.userId === contactUserId && f.contactUserId === userId);
    const pivotReceive = this.data.friends.find((f) => f.userId === userId && f.contactUserId === contactUserId);
    if (!pivotSend || !pivotReceive) return false;
    if (accept) {
      pivotSend.status = "accepted";
      pivotReceive.status = "accepted";
    } else {
      this.data.friends = this.data.friends.filter(
        (f) => !(f.userId === userId && f.contactUserId === contactUserId) && !(f.userId === contactUserId && f.contactUserId === userId)
      );
    }
    await this.triggerSave();
    return true;
  }
  async removeFriend(userId, contactUserId) {
    const initialLen = this.data.friends.length;
    this.data.friends = this.data.friends.filter(
      (f) => !(f.userId === userId && f.contactUserId === contactUserId) && !(f.userId === contactUserId && f.contactUserId === userId)
    );
    if (this.data.friends.length !== initialLen) {
      await this.triggerSave();
      return true;
    }
    return false;
  }
  async blockUser(userId, contactUserId) {
    let f1 = this.data.friends.find((f) => f.userId === userId && f.contactUserId === contactUserId);
    if (!f1) {
      f1 = {
        friendId: "fr-" + Math.random().toString(36).substring(2, 10),
        userId,
        contactUserId,
        status: "blocked",
        addedAt: Date.now()
      };
      this.data.friends.push(f1);
    } else {
      f1.status = "blocked";
    }
    this.data.friends = this.data.friends.filter(
      (f) => !(f.userId === contactUserId && f.contactUserId === userId)
    );
    await this.triggerSave();
    return true;
  }
  // --- Chats Operations ---
  getMessagesBetween(u1, u2) {
    return this.data.chats.filter(
      (c) => c.senderId === u1 && c.receiverId === u2 || c.senderId === u2 && c.receiverId === u1
    ).sort((a, b) => a.timestamp - b.timestamp);
  }
  async insertMessage(msg) {
    const newChat = {
      ...msg,
      chatId: "m-" + Math.random().toString(36).substring(2, 10),
      timestamp: Date.now(),
      delivered: false,
      seen: false
    };
    this.data.chats.push(newChat);
    await this.triggerSave();
    return newChat;
  }
  async markMessagesAsDelivered(receiverId) {
    let changed = false;
    for (const chat of this.data.chats) {
      if (chat.receiverId === receiverId && !chat.delivered) {
        chat.delivered = true;
        changed = true;
      }
    }
    if (changed) {
      await this.triggerSave();
    }
  }
  async markMessagesAsSeen(senderId, receiverId) {
    let changed = false;
    for (const chat of this.data.chats) {
      if (chat.senderId === senderId && chat.receiverId === receiverId && !chat.seen) {
        chat.seen = true;
        chat.delivered = true;
        changed = true;
      }
    }
    if (changed) {
      await this.triggerSave();
    }
  }
  // --- Calls Logs ---
  getCallsHistory(userId) {
    return this.data.calls.filter((c) => c.callerId === userId || c.receiverId === userId).sort((a, b) => b.startTime - a.startTime);
  }
  async createCallLog(call) {
    const newCall = {
      ...call,
      callId: "c-" + Math.random().toString(36).substring(2, 10),
      startTime: Date.now(),
      endTime: 0
    };
    this.data.calls.push(newCall);
    await this.triggerSave();
    return newCall;
  }
  async endCallLog(callId, endTime, status) {
    const call = this.data.calls.find((c) => c.callId === callId);
    if (call) {
      call.endTime = endTime;
      call.status = status;
      await this.triggerSave();
    }
  }
  // --- User Settings ---
  getSettings(userId) {
    let set = this.data.settings.find((s) => s.userId === userId);
    if (!set) {
      set = {
        userId,
        theme: "dark",
        soundNotifications: true,
        readReceipts: true
      };
      this.data.settings.push(set);
      this.saveSync();
    }
    return set;
  }
  async updateSettings(userId, settings) {
    let set = this.data.settings.find((s) => s.userId === userId);
    if (!set) {
      set = {
        userId,
        theme: "dark",
        soundNotifications: true,
        readReceipts: true
      };
      this.data.settings.push(set);
    }
    Object.assign(set, settings);
    await this.triggerSave();
    return set;
  }
  async syncRestorePayload(payload) {
    const { user, friends, messages, calls, settings } = payload;
    let existingUser = this.getUserById(user.userId);
    if (!existingUser) {
      const passwordHash = user.passwordHash || Buffer.from("Password123").toString("base64");
      existingUser = {
        userId: user.userId,
        name: user.name,
        email: user.email,
        passwordHash,
        profileImage: user.profileImage,
        status: "online",
        lastSeen: Date.now(),
        createdAt: user.createdAt || Date.now()
      };
      this.data.users.push(existingUser);
    } else {
      existingUser.name = user.name;
      existingUser.profileImage = user.profileImage;
    }
    for (const f of friends) {
      const ownerId = user.userId;
      const contactUserId = f.contactUserId || f.userId;
      if (ownerId && contactUserId && ownerId !== contactUserId) {
        let contactUser = this.getUserById(contactUserId);
        if (!contactUser) {
          contactUser = {
            userId: contactUserId,
            name: f.name || "Unknown Friend",
            email: f.email || `${contactUserId}@securesync.net`,
            passwordHash: Buffer.from("Password123").toString("base64"),
            profileImage: f.profileImage || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(f.name || contactUserId)}`,
            status: "offline",
            lastSeen: f.lastSeen || Date.now(),
            createdAt: f.addedAt || Date.now()
          };
          this.data.users.push(contactUser);
        }
        const exists1 = this.data.friends.find(
          (target) => target.userId === ownerId && target.contactUserId === contactUserId || target.friendId === f.friendId
        );
        if (!exists1) {
          this.data.friends.push({
            friendId: f.friendId || "fr-" + Math.random().toString(36).substring(2, 10),
            userId: ownerId,
            contactUserId,
            status: f.status || "accepted",
            addedAt: f.addedAt || Date.now()
          });
        } else {
          exists1.status = f.status || exists1.status;
        }
        const exists2 = this.data.friends.find(
          (target) => target.userId === contactUserId && target.contactUserId === ownerId
        );
        if (!exists2) {
          this.data.friends.push({
            friendId: "fr-" + Math.random().toString(36).substring(2, 10),
            userId: contactUserId,
            contactUserId: ownerId,
            status: f.status === "accepted" ? "accepted" : f.status === "pending_sent" ? "pending_received" : "pending_sent",
            addedAt: f.addedAt || Date.now()
          });
        } else {
          exists2.status = f.status === "accepted" ? "accepted" : exists2.status;
        }
      }
    }
    for (const m of messages) {
      if (!this.data.chats.some((target) => target.chatId === m.chatId)) {
        this.data.chats.push({
          chatId: m.chatId,
          senderId: m.senderId,
          receiverId: m.receiverId,
          message: m.message,
          messageType: m.messageType || "text",
          timestamp: m.timestamp,
          delivered: m.delivered || false,
          seen: m.seen || false,
          mediaUrl: m.mediaUrl,
          fileName: m.fileName
        });
      }
    }
    for (const c of calls) {
      if (!this.data.calls.some((target) => target.callId === c.callId)) {
        this.data.calls.push({
          callId: c.callId,
          callerId: c.callerId,
          receiverId: c.receiverId,
          callType: c.callType,
          startTime: c.startTime,
          endTime: c.endTime,
          status: c.status
        });
      }
    }
    if (settings) {
      const idx = this.data.settings.findIndex((s) => s.userId === user.userId);
      const cleanedSettings = {
        userId: user.userId,
        theme: settings.theme || "dark",
        soundNotifications: settings.soundNotifications !== false,
        readReceipts: settings.readReceipts !== false
      };
      if (idx >= 0) {
        this.data.settings[idx] = cleanedSettings;
      } else {
        this.data.settings.push(cleanedSettings);
      }
    }
    await this.triggerSave();
    return true;
  }
};
var dbStore = new DatabaseStore();

// server.ts
var UPLOADS_DIR = import_path2.default.join(process.cwd(), "uploads");
if (!import_fs2.default.existsSync(UPLOADS_DIR)) {
  import_fs2.default.mkdirSync(UPLOADS_DIR, { recursive: true });
}
var activeSockets = /* @__PURE__ */ new Map();
var activeCalls = /* @__PURE__ */ new Map();
function sendToUserSocket(userId, data) {
  let sent = false;
  for (const [ws, info] of activeSockets.entries()) {
    if (info.userId === userId && ws.readyState === import_ws.WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
      sent = true;
    }
  }
  return sent;
}
function broadcastPresence(userId, status) {
  const payload = {
    type: "presence_change",
    userId,
    status,
    lastSeen: Date.now()
  };
  for (const [ws, info] of activeSockets.entries()) {
    if (ws.readyState === import_ws.WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }
}
async function startServer() {
  const app = (0, import_express.default)();
  const httpServer = (0, import_http.createServer)(app);
  app.use(import_express.default.json({ limit: "50mb" }));
  app.use(import_express.default.urlencoded({ limit: "50mb", extended: true }));
  app.use("/uploads", import_express.default.static(UPLOADS_DIR));
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
      const passwordHash = Buffer.from(password).toString("base64");
      const defaultAvatar = profileImage || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`;
      const user = await dbStore.createUser({
        name,
        email,
        passwordHash,
        profileImage: defaultAvatar
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
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
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
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { email, newPassword } = req.body;
      const user = dbStore.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ error: "User with this email not found" });
      }
      user.passwordHash = Buffer.from(newPassword).toString("base64");
      res.json({ success: true, message: "Password updated successfully" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
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
        settings
      });
      res.json({ success: true, syncResult });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/users/profile", async (req, res) => {
    try {
      const { userId, name, profileImage } = req.body;
      const updated = await dbStore.updateUserProfile(userId, name, profileImage);
      if (!updated) {
        return res.status(444).json({ error: "User not found" });
      }
      res.json({ success: true, user: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
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
  app.get("/api/users", (req, res) => {
    try {
      const currentUserId = req.query.currentUserId;
      const search = (req.query.q || "").toLowerCase();
      let allUsers = dbStore.getUsers().filter((u) => u.userId !== currentUserId).map((u) => ({
        userId: u.userId,
        name: u.name,
        email: u.email,
        profileImage: u.profileImage,
        status: u.status,
        lastSeen: u.lastSeen
      }));
      if (search) {
        allUsers = allUsers.filter(
          (u) => u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search)
        );
      }
      res.json(allUsers);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/friends/:userId", (req, res) => {
    try {
      const { userId } = req.params;
      const connections = dbStore.getFriendsOfUser(userId);
      const formattedFriends = connections.map((friend) => {
        const contact = dbStore.getUserById(friend.contactUserId);
        if (!contact) return null;
        const messages = dbStore.getMessagesBetween(userId, friend.contactUserId);
        const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
        const unreadCount = messages.filter((m) => m.senderId === friend.contactUserId && !m.seen).length;
        return {
          friendId: friend.friendId,
          userId: contact.userId,
          name: contact.name,
          email: contact.email,
          profileImage: contact.profileImage,
          status: friend.status,
          // "pending_sent" | "pending_received" | "accepted" | "blocked"
          onlineStatus: contact.status,
          // "online" | "offline"
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
      const sorted = formattedFriends.sort((a, b) => {
        if (a.status === "accepted" && b.status === "accepted") {
          const tA = a.lastMessage ? a.lastMessage.timestamp : 0;
          const tB = b.lastMessage ? b.lastMessage.timestamp : 0;
          return tB - tA;
        }
        return a.status.localeCompare(b.status);
      });
      res.json(sorted);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
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
      sendToUserSocket(targetUser.userId, {
        type: "incoming_friend_request",
        senderId: userId,
        notification: `New friend request from ${dbStore.getUserById(userId)?.name}`
      });
      res.json({ success: true, targetUser });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/friends/respond", async (req, res) => {
    try {
      const { userId, contactUserId, action } = req.body;
      const accept = action === "accept";
      const success = await dbStore.respondFriendRequest(userId, contactUserId, accept);
      if (!success) {
        return res.status(400).json({ error: "Handshake reference not found." });
      }
      if (accept) {
        sendToUserSocket(contactUserId, {
          type: "friend_request_accepted",
          userId,
          notification: `${dbStore.getUserById(userId)?.name} accepted your friend request!`
        });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/friends/remove", async (req, res) => {
    try {
      const { userId, contactUserId } = req.body;
      const success = await dbStore.removeFriend(userId, contactUserId);
      res.json({ success });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/friends/block", async (req, res) => {
    try {
      const { userId, contactUserId } = req.body;
      const success = await dbStore.blockUser(userId, contactUserId);
      res.json({ success });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/chats/:u1/:u2", (req, res) => {
    try {
      const { u1, u2 } = req.params;
      const msgs = dbStore.getMessagesBetween(u1, u2);
      res.json(msgs);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/chats/mark-seen", async (req, res) => {
    try {
      const { senderId, receiverId } = req.body;
      await dbStore.markMessagesAsSeen(senderId, receiverId);
      sendToUserSocket(senderId, {
        type: "messages_seen",
        viewerId: receiverId
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/upload", (req, res) => {
    try {
      const { fileName, fileData } = req.body;
      if (!fileName || !fileData) {
        return res.status(400).json({ error: "Missing uploaded parts" });
      }
      const buffer = Buffer.from(fileData, "base64");
      const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${fileName}`;
      const filePath = import_path2.default.join(UPLOADS_DIR, uniqueName);
      import_fs2.default.writeFileSync(filePath, buffer);
      const staticUrl = `/uploads/${uniqueName}`;
      res.json({ success: true, url: staticUrl });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/calls/log", async (req, res) => {
    try {
      const { callerId, receiverId, callType } = req.body;
      const log = await dbStore.createCallLog({ callerId, receiverId, callType, status: "ringing" });
      res.json({ success: true, callLog: log });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/calls/log/:id/end", async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      await dbStore.endCallLog(id, Date.now(), status);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/calls/history/:userId", (req, res) => {
    try {
      const { userId } = req.params;
      const list = dbStore.getCallsHistory(userId);
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/user/:userId/settings", (req, res) => {
    try {
      const settings = dbStore.getSettings(req.params.userId);
      res.json(settings);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/user/:userId/settings", async (req, res) => {
    try {
      const updated = await dbStore.updateSettings(req.params.userId, req.body);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", timestamp: Date.now() });
  });
  const wss = new import_ws.WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });
  wss.on("connection", (ws) => {
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
              broadcastPresence(userId, "online");
              await dbStore.markMessagesAsDelivered(userId);
            }
            break;
          }
          case "send_chat": {
            const { senderId, receiverId, message, messageType, mediaUrl, fileName } = payload;
            const dbChat = await dbStore.insertMessage({
              senderId,
              receiverId,
              message,
              messageType,
              mediaUrl,
              fileName
            });
            const isOnline = sendToUserSocket(receiverId, {
              type: "receive_chat",
              chat: dbChat
            });
            if (isOnline) {
              dbChat.delivered = true;
            }
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
            const { receiverId, callerId, answer, sdp, callType } = payload;
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
            const senderId = activeSockets.get(ws)?.userId;
            console.log(
              "[WEBRTC SIGNAL]",
              senderId,
              "->",
              targetId,
              signal?.type || "candidate"
            );
            sendToUserSocket(targetId, {
              type: "webrtc_signaling_forward",
              senderId,
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
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path2.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path2.default.join(distPath, "index.html"));
    });
  }
  const PORT = 3e3;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Live sync multi-user database server running on http://0.0.0.0:${PORT}`);
  });
}
startServer().catch((error) => {
  console.error("CRITICAL API SERVER BOOT ERROR:", error);
});
//# sourceMappingURL=server.cjs.map
