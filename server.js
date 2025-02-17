import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Serve static files from the dist directory
app.use(express.static(join(__dirname, 'dist')));

// Handle all routes by serving index.html
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

// Store active rooms
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Handle room creation
  socket.on('create-room', (roomId) => {
    rooms.set(roomId, { creator: socket.id });
    socket.join(roomId);
    console.log(`Room ${roomId} created by ${socket.id}`);
  });

  // Handle room joining
  socket.on('join-room', (roomId) => {
    const room = rooms.get(roomId);
    if (room) {
      socket.join(roomId);
      socket.to(roomId).emit('user-joined', socket.id);
      console.log(`User ${socket.id} joined room ${roomId}`);
    }
  });

  // Handle WebRTC signaling
  socket.on('offer', ({ offer, roomId }) => {
    socket.to(roomId).emit('offer', { offer, from: socket.id });
  });

  socket.on('answer', ({ answer, roomId }) => {
    socket.to(roomId).emit('answer', { answer, from: socket.id });
  });

  socket.on('ice-candidate', ({ candidate, roomId }) => {
    socket.to(roomId).emit('ice-candidate', { candidate, from: socket.id });
  });

  // Handle chat messages
  socket.on('chat-message', ({ message, roomId }) => {
    socket.to(roomId).emit('chat-message', message);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Clean up rooms
    for (const [roomId, room] of rooms.entries()) {
      if (room.creator === socket.id) {
        rooms.delete(roomId);
        io.to(roomId).emit('room-closed');
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});