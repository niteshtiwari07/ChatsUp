
import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";

export const useChatStore = create((set, get) => ({
  messages: [],
  users: [],
  selectedUser: null,
  unreadCounts: {},
  isUsersLoading: false,
  isMessagesLoading: false,
  isTyping: false,

  getUsers: async () => {
    set({ isUsersLoading: true });

    try {
      const res = await axiosInstance.get("/messages/users");
      set({ users: res.data });
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Failed to load users"
      );
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMessages: async (userId) => {
    set({ isMessagesLoading: true });

    try {
      const res = await axiosInstance.get(`/messages/${userId}`);
      set({ messages: res.data });
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Failed to load messages"
      );
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  sendMessage: async (messageData) => {
    const { selectedUser } = get();
    if (!selectedUser) return;

    try {
      const res = await axiosInstance.post(
        `/messages/send/${selectedUser._id}`,
        messageData
      );

      const sentMessage = res.data;

      set((state) => {
        const alreadyExists = state.messages.some(
          (m) => String(m._id) === String(sentMessage._id)
        );

        return {
          messages: alreadyExists
            ? state.messages
            : [...state.messages, sentMessage],
          users: state.users.map((user) =>
            String(user._id) === String(selectedUser._id)
              ? { ...user, lastMessage: sentMessage }
              : user
          ),
        };
      });
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Failed to send message"
      );
    }
  },

  subscribeToMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    socket.off("newMessage");
    socket.off("userTyping");
    socket.off("userStopTyping");

    socket.on("newMessage", (newMessage) => {
      const { selectedUser } = get();
      const authUser = useAuthStore.getState().authUser;
      const myId = authUser?._id ? String(authUser._id) : null;
      const senderId = String(newMessage.senderId);
      const receiverId = String(newMessage.receiverId);
      const selectedUserId = selectedUser?._id
        ? String(selectedUser._id)
        : null;

      const isFromMe = Boolean(myId && senderId === myId);
      const partnerId = isFromMe ? receiverId : senderId;

      // Update the contact's latest message in the sidebar.
      set((state) => ({
        users: state.users.map((user) =>
          String(user._id) === partnerId
            ? { ...user, lastMessage: newMessage }
            : user
        ),
      }));

      // Add the message to the open chat, or count it as unread.
      if (selectedUserId === partnerId) {
        set((state) => {
          const alreadyExists = state.messages.some(
            (message) =>
              String(message._id) === String(newMessage._id)
          );

          return {
            messages: alreadyExists
              ? state.messages
              : [...state.messages, newMessage],
            unreadCounts: {
              ...state.unreadCounts,
              [partnerId]: 0,
            },
          };
        });
      } else if (!isFromMe) {
        set((state) => ({
          unreadCounts: {
            ...state.unreadCounts,
            [partnerId]: (state.unreadCounts[partnerId] || 0) + 1,
          },
        }));
      }
    });

    socket.on("userTyping", () => set({ isTyping: true }));
    socket.on("userStopTyping", () => set({ isTyping: false }));
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    socket.off("newMessage");
    socket.off("userTyping");
    socket.off("userStopTyping");
  },

  setSelectedUser: (selectedUser) => {
    set((state) => ({
      selectedUser,
      isTyping: false,
      unreadCounts: selectedUser
        ? {
            ...state.unreadCounts,
            [String(selectedUser._id)]: 0,
          }
        : state.unreadCounts,
    }));
  },

  clearTyping: () => set({ isTyping: false }),
}));
