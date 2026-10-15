
import { Server } from "socket.io";
import http from "http";
import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "https://chats-up-wine.vercel.app",
    ],
    credentials: true,
  },
});

const userSocketMap = new Map();

export function getReceiverSocketId(userId) {
  const sockets = userSocketMap.get(String(userId));
  return sockets ? [...sockets][0] : undefined;
}

const emitOnlineUsers = () => {
  io.emit("getOnlineUsers", [...userSocketMap.keys()]);
};

io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;

  if (userId && userId !== "undefined" && userId !== "null") {
    const id = String(userId);

    // Join room for this user so io.to(id) delivers to all active tabs/sockets
    socket.join(id);

    if (!userSocketMap.has(id)) {
      userSocketMap.set(id, new Set());
    }

    userSocketMap.get(id).add(socket.id);
    emitOnlineUsers();
  }

  socket.on("typing", ({ receiverId }) => {
    if (receiverId) {
      io.to(String(receiverId)).emit("userTyping");
    }
  });

  socket.on("stopTyping", ({ receiverId }) => {
    if (receiverId) {
      io.to(String(receiverId)).emit("userStopTyping");
    }
  });

  socket.on("disconnect", () => {
    if (!userId || userId === "undefined" || userId === "null") return;

    const id = String(userId);
    const sockets = userSocketMap.get(id);

    if (sockets) {
      sockets.delete(socket.id);

      if (sockets.size === 0) {
        userSocketMap.delete(id);
      }

      emitOnlineUsers();
    }
  });
});

export { io, app, server };
