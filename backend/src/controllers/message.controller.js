
import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;

    const [users, lastMessages] = await Promise.all([
      User.find({
        _id: { $ne: loggedInUserId },
      }).select("-password"),
      Message.aggregate([
        {
          $match: {
            $or: [
              { senderId: loggedInUserId },
              { receiverId: loggedInUserId },
            ],
          },
        },
        {
          $sort: { createdAt: -1, _id: -1 },
        },
        {
          $group: {
            _id: {
              $cond: [
                { $eq: ["$senderId", loggedInUserId] },
                "$receiverId",
                "$senderId",
              ],
            },
            lastMessage: { $first: "$$ROOT" },
          },
        },
      ]),
    ]);

    const lastMessageMap = new Map();
    lastMessages.forEach((item) => {
      lastMessageMap.set(String(item._id), item.lastMessage);
    });

    const usersWithLastMessage = users.map((user) => ({
      ...user.toObject(),
      lastMessage: lastMessageMap.get(String(user._id)) || null,
    }));

    res.status(200).json(usersWithLastMessage);
  } catch (error) {
    console.log("Error in getUsersForSidebar:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    }).sort({ createdAt: 1 });

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    let imageUrl = "";

    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image, {
        folder: "chat-app",
      });

      imageUrl = uploadResponse.secure_url;
    }

    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl,
    });

    await newMessage.save();

    // Emit to receiver's room (all active sockets/tabs for receiver)
    io.to(String(receiverId)).emit("newMessage", newMessage);

    // Also emit to sender's room (so any other active tabs for sender stay synchronized)
    io.to(String(senderId)).emit("newMessage", newMessage);

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage controller:", error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
