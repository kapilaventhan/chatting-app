import React, { useState } from "react";
import { Shield, Mail, Lock, User, Eye, EyeOff, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface AuthPanelProps {
  onSuccess: (user: { userId: string; name: string; email: string; profileImage: string }) => void;
}

export default function AuthPanel({ onSuccess }: AuthPanelProps) {
  const [tab, setTab] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Quick avatar selector choices
  const avatarPresets = [
    "https://api.dicebear.com/7.x/pixel-art/svg?seed=bob",
    "https://api.dicebear.com/7.x/pixel-art/svg?seed=jane",
    "https://api.dicebear.com/7.x/pixel-art/svg?seed=sam",
    "https://api.dicebear.com/7.x/pixel-art/svg?seed=amy",
  ];
  const [selectedAvatar, setSelectedAvatar] = useState(avatarPresets[0]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);

    if (tab === "forgot") {
      try {
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, newPassword: "Password123" }),
        });
        const data = await res.json();
        if (res.ok) {
          setSuccessMsg("Success! We reset the password for " + email + " to 'Password123' (case sensitive). Please log in with it.");
          setTab("login");
        } else {
          setErrorMsg(data.error || "Reset failed");
        }
      } catch (err) {
        setErrorMsg("Network error resetting password.");
      } finally {
        setLoading(false);
      }
      return;
    }

    const endpoint = tab === "login" ? "/api/auth/login" : "/api/auth/signup";
    const body = tab === "login" 
      ? { email, password } 
      : { name, email, password, profileImage: selectedAvatar };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onSuccess(data.user);
      } else {
        setErrorMsg(data.error || "Authentication failed");
      }
    } catch (err) {
      setErrorMsg("Cannot establish database secure handshake.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#05060a] text-slate-300 p-6 md:p-12 relative overflow-hidden font-sans">
      <div className="absolute inset-x-0 inset-y-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-[#0d111c] via-[#05060a] to-black pointer-events-none opacity-85" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md bg-[#08090f]/90 backdrop-blur-xl border border-slate-800/40 rounded-2xl p-8 shadow-2xl relative z-10"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-2xl mb-4 shadow-lg shadow-cyan-500/5">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-500 bg-clip-text text-transparent">
            SecureSync Premium
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            Realtime Encryption Hub & Messaging Matrix
          </p>
        </div>

        <div className="flex border-b border-slate-800/60 mb-6">
          <button
            onClick={() => { setTab("login"); setErrorMsg(""); }}
            className={`flex-1 pb-3 text-sm font-semibold transition-colors border-b-2 cursor-pointer ${
              tab === "login" ? "border-cyan-500 text-cyan-400" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setTab("signup"); setErrorMsg(""); }}
            className={`flex-1 pb-3 text-sm font-semibold transition-colors border-b-2 cursor-pointer ${
              tab === "signup" ? "border-cyan-500 text-cyan-400" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Create Identity
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-950/45 border border-red-900/40 text-rose-450 rounded-xl text-xs text-center">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 bg-cyan-950/45 border border-cyan-900/40 text-cyan-450 rounded-xl text-xs text-center">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === "signup" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Display Name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 w-4.5 h-4.5 text-slate-500" />
                  <input
                    type="text"
                    required
                    placeholder="e.g., Alice Kennedy"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-[#0a0c14] border border-slate-800/60 rounded-xl py-3 pl-11 pr-4 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Select Avatar</label>
                <div className="flex items-center gap-3.5">
                  {avatarPresets.map((av, index) => (
                    <img
                      key={index}
                      src={av}
                      alt="avatar option"
                      onClick={() => setSelectedAvatar(av)}
                      referrerPolicy="no-referrer"
                      className={`w-11 h-11 rounded-xl p-1 bg-slate-800 border-2 cursor-pointer transition-all ${
                        selectedAvatar === av ? "border-cyan-400 scale-105" : "border-slate-700/50 hover:border-slate-600"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Email Identity</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 w-4.5 h-4.5 text-slate-500" />
              <input
                type="email"
                required
                placeholder="alice@securesync.net"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#0a0c14] border border-slate-800/60 rounded-xl py-3 pl-11 pr-4 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
              />
            </div>
          </div>

          {tab !== "forgot" && (
            <div>
              <div className="flex justify-between mb-2">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Secret Code credentials</label>
                {tab === "login" && (
                  <button
                    type="button"
                    onClick={() => setTab("forgot")}
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold"
                  >
                    Reset Code
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 w-4.5 h-4.5 text-slate-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#0a0c14] border border-slate-800/60 rounded-xl py-3 pl-11 pr-11 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-cyan-500/10 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 mt-2"
          >
            <span>{loading ? "Decrypting Node..." : tab === "login" ? "Initialize Secure Session" : tab === "signup" ? "Create Matrix Profile" : "Trigger Reset Link"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {tab === "forgot" && (
          <button
            onClick={() => setTab("login")}
            className="w-full text-center text-xs text-slate-400 hover:text-slate-200 mt-4 underline font-semibold cursor-pointer"
          >
            Back to Sign In
          </button>
        )}
      </motion.div>
    </div>
  );
}
