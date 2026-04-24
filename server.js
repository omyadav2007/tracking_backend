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

// In-memory storage for active rides
const activeRides = new Set();

// Routes

// POST /location - Receive and store vehicle location
app.post('/location', (req, res) => {
  const { rideId, lat, lng } = req.body;

  // Validate input
  if (!rideId || lat === undefined || lng === undefined) {
    return res.status(400).json({
      error: 'Missing required fields: rideId, lat, lng'
    });
  }

  // Check if ride is active
  if (!activeRides.has(rideId)) {
    return res.status(403).json({
      error: `Ride ${rideId} is not active`
    });
  }

  // Store location in memory
  vehicleLocations[rideId] = {
    rideId,
    lat,
    lng,
    timestamp: new Date().toISOString()
  };

  console.log(`Location updated for ride ${rideId}:`, vehicleLocations[rideId]);

  
  // Broadcast update to all connected clients
  io.emit('locationUpdate', vehicleLocations[rideId]);

  // Send response
  res.status(200).json({
    message: 'Location received and broadcasted',
    data: vehicleLocations[rideId]
  });
});

// GET /locations - Get all stored locations
app.get('/locations', (req, res) => {
  res.status(200).json(vehicleLocations);
});

// GET /location/:rideId - Get specific ride location
app.get('/location/:rideId', (req, res) => {
  const { rideId } = req.params;
  const location = vehicleLocations[rideId];

  if (!location) {
    return res.status(404).json({
      error: `No location found for ride ${rideId}`
    });
  }

  res.status(200).json(location);
});

// POST /start-ride - Start tracking a ride
app.post('/start-ride', (req, res) => {
  const { rideId } = req.body;

  if (!rideId) {
    return res.status(400).json({
      error: 'Missing required field: rideId'
    });
  }

  activeRides.add(rideId);
  console.log(`Ride started: ${rideId}`);

  res.status(200).json({
    message: `Ride ${rideId} started`,
    rideId
  });
});

// POST /stop-ride - Stop tracking a ride
app.post('/stop-ride', (req, res) => {
  const { rideId } = req.body;

  if (!rideId) {
    return res.status(400).json({
      error: 'Missing required field: rideId'
    });
  }

  activeRides.delete(rideId);
  delete vehicleLocations[rideId];
  console.log(`Ride stopped: ${rideId}`);

  res.status(200).json({
    message: `Ride ${rideId} stopped`,
    rideId
  });
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
      post: '/location - Submit ride location (rideId, lat, lng)',
      post_start: '/start-ride - Start tracking a ride',
      post_stop: '/stop-ride - Stop tracking a ride',
      get: '/locations - Get all ride locations',
      getOne: '/location/:rideId - Get specific ride location'
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
