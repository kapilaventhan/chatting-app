import fs from "fs";
import path from "path";

export interface DbUser {
  userId: string;
  name: string;
  email: string;
  passwordHash: string;
  profileImage: string;
  status: "online" | "offline";
  lastSeen: number;
  createdAt: number;
}

export interface DbFriend {
  friendId: string;
  userId: string;
  contactUserId: string;
  status: "pending_sent" | "pending_received" | "accepted" | "blocked"; // customized friendship states
  addedAt: number;
}

export interface DbChat {
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

export interface DbCall {
  callId: string;
  callerId: string;
  receiverId: string;
  callType: "audio" | "video";
  startTime: number;
  endTime: number;
  status: "ringing" | "connected" | "missed" | "rejected" | "ended";
}

export interface DbUserSettings {
  userId: string;
  theme: "dark" | "light";
  soundNotifications: boolean;
  readReceipts: boolean;
}

export interface DatabaseSchema {
  users: DbUser[];
  friends: DbFriend[];
  chats: DbChat[];
  calls: DbCall[];
  settings: DbUserSettings[];
}

const DB_FILE_PATH = path.join(process.cwd(), "database.json");

class DatabaseStore {
  private data: DatabaseSchema = {
    users: [],
    friends: [],
    chats: [],
    calls: [],
    settings: [],
  };

  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(DB_FILE_PATH)) {
        const raw = fs.readFileSync(DB_FILE_PATH, "utf8");
        this.data = JSON.parse(raw);
        // Ensure all arrays are present
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

  private saveSync() {
    try {
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(this.data, null, 2), "utf8");
    } catch (err) {
      console.error("Failed to write database.json", err);
    }
  }

  private triggerSave(): Promise<void> {
    this.writeQueue = this.writeQueue.then(() => {
      return new Promise<void>((resolve) => {
        fs.writeFile(DB_FILE_PATH, JSON.stringify(this.data, null, 2), "utf8", (err) => {
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
  public getUsers(): DbUser[] {
    return this.data.users;
  }

  public getUserByEmail(email: string): DbUser | undefined {
    return this.data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  public getUserById(userId: string): DbUser | undefined {
    return this.data.users.find(u => u.userId === userId);
  }

  public async createUser(user: Omit<DbUser, "userId" | "createdAt" | "status" | "lastSeen">): Promise<DbUser> {
    const newUser: DbUser = {
      ...user,
      userId: "u-" + Math.random().toString(36).substring(2, 10),
      status: "offline",
      lastSeen: Date.now(),
      createdAt: Date.now(),
    };
    this.data.users.push(newUser);
    
    // Create default settings
    const defaultSettings: DbUserSettings = {
      userId: newUser.userId,
      theme: "dark",
      soundNotifications: true,
      readReceipts: true,
    };
    this.data.settings.push(defaultSettings);

    await this.triggerSave();
    return newUser;
  }

  public async updateUserStatus(userId: string, status: "online" | "offline"): Promise<void> {
    const user = this.getUserById(userId);
    if (user) {
      user.status = status;
      user.lastSeen = Date.now();
      await this.triggerSave();
    }
  }

  public async updateUserProfile(userId: string, name: string, profileImage: string): Promise<DbUser | undefined> {
    const user = this.getUserById(userId);
    if (user) {
      user.name = name;
      user.profileImage = profileImage;
      await this.triggerSave();
    }
    return user;
  }

  // --- Friends Operations ---
  public getFriendsOfUser(userId: string): DbFriend[] {
    return this.data.friends.filter(f => f.userId === userId);
  }

  public async sendFriendRequest(userId: string, contactUserId: string): Promise<boolean> {
    if (userId === contactUserId) return false;

    // Check if relation already exists
    const existing = this.data.friends.find(
      f => f.userId === userId && f.contactUserId === contactUserId
    );
    if (existing) return false;

    const requestSent: DbFriend = {
      friendId: "fr-" + Math.random().toString(36).substring(2, 10),
      userId,
      contactUserId,
      status: "pending_sent",
      addedAt: Date.now(),
    };

    const requestReceived: DbFriend = {
      friendId: "fr-" + Math.random().toString(36).substring(2, 10),
      userId: contactUserId,
      contactUserId: userId,
      status: "pending_received",
      addedAt: Date.now(),
    };

    this.data.friends.push(requestSent, requestReceived);
    await this.triggerSave();
    return true;
  }

  public async respondFriendRequest(userId: string, contactUserId: string, accept: boolean): Promise<boolean> {
    const pivotSend = this.data.friends.find(f => f.userId === contactUserId && f.contactUserId === userId);
    const pivotReceive = this.data.friends.find(f => f.userId === userId && f.contactUserId === contactUserId);

    if (!pivotSend || !pivotReceive) return false;

    if (accept) {
      pivotSend.status = "accepted";
      pivotReceive.status = "accepted";
    } else {
      // Reject: delete references
      this.data.friends = this.data.friends.filter(
        f => !(f.userId === userId && f.contactUserId === contactUserId) &&
             !(f.userId === contactUserId && f.contactUserId === userId)
      );
    }
    await this.triggerSave();
    return true;
  }

  public async removeFriend(userId: string, contactUserId: string): Promise<boolean> {
    const initialLen = this.data.friends.length;
    this.data.friends = this.data.friends.filter(
      f => !(f.userId === userId && f.contactUserId === contactUserId) &&
           !(f.userId === contactUserId && f.contactUserId === userId)
    );
    if (this.data.friends.length !== initialLen) {
      await this.triggerSave();
      return true;
    }
    return false;
  }

  public async blockUser(userId: string, contactUserId: string): Promise<boolean> {
    // Blocking: sets status to 'blocked' for userId, removes or sets blocked for the other
    let f1 = this.data.friends.find(f => f.userId === userId && f.contactUserId === contactUserId);
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

    // Set other person's linkage to be removed or soft-friendless if not accepted
    this.data.friends = this.data.friends.filter(
      f => !(f.userId === contactUserId && f.contactUserId === userId)
    );

    await this.triggerSave();
    return true;
  }

  // --- Chats Operations ---
  public getMessagesBetween(u1: string, u2: string): DbChat[] {
    return this.data.chats.filter(
      c => (c.senderId === u1 && c.receiverId === u2) || (c.senderId === u2 && c.receiverId === u1)
    ).sort((a, b) => a.timestamp - b.timestamp);
  }

  public async insertMessage(msg: Omit<DbChat, "chatId" | "timestamp" | "delivered" | "seen">): Promise<DbChat> {
    const newChat: DbChat = {
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

  public async markMessagesAsDelivered(receiverId: string): Promise<void> {
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

  public async markMessagesAsSeen(senderId: string, receiverId: string): Promise<void> {
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
  public getCallsHistory(userId: string): DbCall[] {
    return this.data.calls.filter(c => c.callerId === userId || c.receiverId === userId)
      .sort((a, b) => b.startTime - a.startTime);
  }

  public async createCallLog(call: Omit<DbCall, "callId" | "startTime" | "endTime">): Promise<DbCall> {
    const newCall: DbCall = {
      ...call,
      callId: "c-" + Math.random().toString(36).substring(2, 10),
      startTime: Date.now(),
      endTime: 0
    };
    this.data.calls.push(newCall);
    await this.triggerSave();
    return newCall;
  }

  public async endCallLog(callId: string, endTime: number, status: DbCall["status"]): Promise<void> {
    const call = this.data.calls.find(c => c.callId === callId);
    if (call) {
      call.endTime = endTime;
      call.status = status;
      await this.triggerSave();
    }
  }

  // --- User Settings ---
  public getSettings(userId: string): DbUserSettings {
    let set = this.data.settings.find(s => s.userId === userId);
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

  public async updateSettings(userId: string, settings: Partial<Omit<DbUserSettings, "userId">>): Promise<DbUserSettings> {
    let set = this.data.settings.find(s => s.userId === userId);
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

  public async syncRestorePayload(payload: {
    user: any;
    friends: any[];
    messages: any[];
    calls: any[];
    settings: any;
  }): Promise<boolean> {
    const { user, friends, messages, calls, settings } = payload;
    
    // 1. Sync User
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

    // 2. Sync Friends: merge uniquely and bilaterally
    for (const f of friends) {
      const ownerId = user.userId;
      const contactUserId = f.contactUserId || f.userId;
      
      if (ownerId && contactUserId && ownerId !== contactUserId) {
        // Ensure relation 1: owner -> contact
        const exists1 = this.data.friends.find(target => 
          (target.userId === ownerId && target.contactUserId === contactUserId) ||
          target.friendId === f.friendId
        );
        if (!exists1) {
          this.data.friends.push({
            friendId: f.friendId || ("fr-" + Math.random().toString(36).substring(2, 10)),
            userId: ownerId,
            contactUserId: contactUserId,
            status: f.status || "accepted",
            addedAt: f.addedAt || Date.now()
          });
        } else {
          exists1.status = f.status || exists1.status;
        }

        // Ensure reciprocal relation 2: contact -> owner (symmetric)
        const exists2 = this.data.friends.find(target => 
          target.userId === contactUserId && target.contactUserId === ownerId
        );
        if (!exists2) {
          this.data.friends.push({
            friendId: "fr-" + Math.random().toString(36).substring(2, 10),
            userId: contactUserId,
            contactUserId: ownerId,
            status: f.status === "accepted" ? "accepted" : (f.status === "pending_sent" ? "pending_received" : "pending_sent"),
            addedAt: f.addedAt || Date.now()
          });
        } else {
          exists2.status = f.status === "accepted" ? "accepted" : exists2.status;
        }
      }
    }

    // 3. Sync Messages: merge uniquely
    for (const m of messages) {
      if (!this.data.chats.some(target => target.chatId === m.chatId)) {
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

    // 4. Sync Calls
    for (const c of calls) {
      if (!this.data.calls.some(target => target.callId === c.callId)) {
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

    // 5. Sync Settings
    if (settings) {
      const idx = this.data.settings.findIndex(s => s.userId === user.userId);
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
}

export const dbStore = new DatabaseStore();
