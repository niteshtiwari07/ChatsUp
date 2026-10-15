
import { create } from "zustand";
import { axiosInstance } from "../lib/axios.js";
import toast from "react-hot-toast";
import { io } from "socket.io-client";
import { useChatStore } from "./useChatStore";

const BASE_URL =
  import.meta.env.MODE === "development"
    ? "http://localhost:5000"
    : "https://chatsup-gbcs.onrender.com";

export const useAuthStore = create((set, get) => ({
  authUser: null,
  isSigningUp: false,
  isLoggingIn: false,
  isUpdatingProfile: false,
  isCheckingAuth: true,
  onlineUsers: [],
  socket: null,

  checkAuth: async () => {
    try {
      const res = await axiosInstance.get("/auth/check");
      set({ authUser: res.data });
      get().connectSocket();
    } catch {
      set({ authUser: null });
    } finally {
      set({ isCheckingAuth: false });
    }
  },

  signup: async (data) => {
    set({ isSigningUp: true });

    try {
      const res = await axiosInstance.post("/auth/signup", data);
      set({ authUser: res.data });
      toast.success("Account created successfully");
      get().connectSocket();
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Signup failed"
      );
    } finally {
      set({ isSigningUp: false });
    }
  },

  login: async (data) => {
    set({ isLoggingIn: true });

    try {
      const res = await axiosInstance.post("/auth/login", data);
      set({ authUser: res.data });
      toast.success("Logged in successfully");
      get().connectSocket();
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Login failed"
      );
    } finally {
      set({ isLoggingIn: false });
    }
  },

  logout: async () => {
    try {
      await axiosInstance.post("/auth/logout");
      get().disconnectSocket();
      set({ authUser: null, onlineUsers: [] });
      useChatStore.getState().setSelectedUser(null);
      toast.success("Logged out successfully");
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Logout failed"
      );
    }
  },

  updateProfile: async (data) => {
    set({ isUpdatingProfile: true });

    try {
      const res = await axiosInstance.put(
        "/auth/update-profile",
        data
      );
      set({ authUser: res.data });
      toast.success("Profile updated successfully");
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Profile update failed"
      );
    } finally {
      set({ isUpdatingProfile: false });
    }
  },

  connectSocket: () => {
    const { authUser, socket } = get();

    if (!authUser?._id) return;

    const currentUserId = String(authUser._id);

    // If socket is already connected or attempting to connect for this user, do not recreate
    if (
      socket &&
      socket.io?.opts?.query?.userId === currentUserId &&
      (socket.connected || socket.active)
    ) {
      return;
    }

    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }

    const newSocket = io(BASE_URL, {
      query: {
        userId: currentUserId,
      },
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      transports: ["websocket", "polling"],
    });

    newSocket.on("getOnlineUsers", (userIds) => {
      set({
        onlineUsers: Array.isArray(userIds)
          ? userIds.map((id) => String(id))
          : [],
      });
    });

    newSocket.on("connect", () => {
      useChatStore.getState().subscribeToMessages();
    });

    newSocket.on("disconnect", () => {
      set((state) => ({
        onlineUsers: state.onlineUsers.filter(
          (id) => String(id) !== currentUserId
        ),
      }));
    });

    set({ socket: newSocket });

    useChatStore.getState().subscribeToMessages();
  },

  disconnectSocket: () => {
    const { socket } = get();

    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }

    set({
      socket: null,
      onlineUsers: [],
    });
  },
}));
