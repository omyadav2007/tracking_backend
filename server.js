const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(express.json());
app.use(cors());

// In-memory storage for vehicle locations
const vehicleLocations = {};

// Routes

// POST /location - Receive and store vehicle location
app.post('/location', (req, res) => {
  const { vehicleId, lat, lng } = req.body;

  // Validate input
  if (!vehicleId || lat === undefined || lng === undefined) {
    return res.status(400).json({
      error: 'Missing required fields: vehicleId, lat, lng'
    });
  }

  // Store location in memory
  vehicleLocations[vehicleId] = {
    vehicleId,
    lat,
    lng,
    timestamp: new Date().toISOString()
  };

  console.log(`Location updated for vehicle ${vehicleId}:`, vehicleLocations[vehicleId]);

  
  // Broadcast update to all connected clients
  io.emit('locationUpdate', vehicleLocations[vehicleId]);

  // Send response
  res.status(200).json({
    message: 'Location received and broadcasted',
    data: vehicleLocations[vehicleId]
  });
});

// GET /locations - Get all stored locations
app.get('/locations', (req, res) => {
  res.status(200).json(vehicleLocations);
});

// GET /location/:vehicleId - Get specific vehicle location
app.get('/location/:vehicleId', (req, res) => {
  const { vehicleId } = req.params;
  const location = vehicleLocations[vehicleId];

  if (!location) {
    return res.status(404).json({
      error: `No location found for vehicle ${vehicleId}`
    });
  }

  res.status(200).json(location);
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Send all current locations to newly connected client
  socket.emit('initialLocations', vehicleLocations);

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Location Tracking Server is running',
    endpoints: {
      post: '/location - Submit vehicle location',
      get: '/locations - Get all vehicle locations',
      getOne: '/location/:vehicleId - Get specific vehicle location'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✓ Server running on http://0.0.0.0:${PORT}`);
});