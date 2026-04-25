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

// In-memory storage for camera frames
const frames = {};

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

// POST /upload-frame - Upload camera frame
app.post('/upload-frame', (req, res) => {
  const { rideId, image } = req.body;

  if (!rideId || !image) {
    return res.status(400).json({ error: 'Missing required fields: rideId, image' });
  }

  if (!activeRides.has(rideId)) {
    return res.status(403).json({ error: `Ride ${rideId} is not active` });
  }

  frames[rideId] = image;
  res.status(200).json({ message: 'Frame uploaded successfully' });
});

// GET /frame/:rideId - Get latest camera frame
app.get('/frame/:rideId', (req, res) => {
  const { rideId } = req.params;
  const image = frames[rideId];

  if (!image) {
    return res.status(404).json({ error: `No frame found for ride ${rideId}` });
  }

  res.status(200).json({ image });
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
  delete frames[rideId];
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

  // WebRTC Signaling
  socket.on('webrtc-join', (rideId) => {
    socket.join(rideId);
    socket.to(rideId).emit('webrtc-viewer-joined', socket.id);
  });

  // Driver joins their own room to receive signaling messages
  socket.on('webrtc-driver-join', (rideId) => {
    socket.join(rideId);
  });

  socket.on('webrtc-offer', (data) => {
    if (data.to) {
      io.to(data.to).emit('webrtc-offer', data);
    } else {
      socket.to(data.rideId).emit('webrtc-offer', data);
    }
  });

  socket.on('webrtc-answer', (data) => {
    if (data.to) {
      io.to(data.to).emit('webrtc-answer', data);
    } else {
      socket.to(data.rideId).emit('webrtc-answer', data);
    }
  });

  socket.on('webrtc-ice-candidate', (data) => {
    if (data.to) {
      io.to(data.to).emit('webrtc-ice-candidate', data);
    } else {
      socket.to(data.rideId).emit('webrtc-ice-candidate', data);
    }
  });

socket.on('disconnect', () => {
  console.log(`Client disconnected: ${socket.id}`);

  // Notify all rooms except its own socket room
  socket.rooms.forEach(room => {
    if (room !== socket.id) {
      socket.to(room).emit('webrtc-viewer-left', socket.id);
    }
  });
});
});


// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Location Tracking Server is running',
    endpoints: {
      post: '/location - Submit ride location (rideId, lat, lng)',
      post_upload_frame: '/upload-frame - Submit camera frame (rideId, image)',
      post_start: '/start-ride - Start tracking a ride',
      post_stop: '/stop-ride - Stop tracking a ride',
      get: '/locations - Get all ride locations',
      getOne: '/location/:rideId - Get specific ride location',
      getFrame: '/frame/:rideId - Get latest camera frame'
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
