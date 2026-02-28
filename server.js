const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve from root directory

// Store connected clients
const clients = new Map();

// WebSocket connection handling
wss.on('connection', (ws, req) => {
    console.log('New client connected');
    
    // Generate unique client ID
    const clientId = Math.random().toString(36).substr(2, 9);
    clients.set(clientId, {
        ws,
        connected: new Date(),
        lastActivity: new Date()
    });
    
    // Send client ID to the connected client
    ws.send(JSON.stringify({
        type: 'connection',
        clientId: clientId,
        message: 'Connected to TGT3 Warehouse System'
    }));
    
    // Broadcast client count to all clients
    broadcastClientCount();
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received message:', data);
            
            // Update last activity
            const client = clients.get(clientId);
            if (client) {
                client.lastActivity = new Date();
            }
            
            // Handle different message types
            switch (data.type) {
                case 'dispatch':
                    handleDispatch(data);
                    break;
                case 'update':
                    handleUpdate(data);
                    break;
                case 'heartbeat':
                    // Update last activity
                    break;
                default:
                    console.log('Unknown message type:', data.type);
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('Client disconnected:', clientId);
        clients.delete(clientId);
        broadcastClientCount();
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clients.delete(clientId);
        broadcastClientCount();
    });
});

// Handle dispatch events
function handleDispatch(data) {
    console.log('📦 Handling dispatch:', data);
    console.log('📦 Broadcasting to all clients except:', data.clientId);
    
    // Broadcast to all connected clients except sender
    const message = {
        type: 'dispatch_update',
        action: data.action,
        items: data.items,
        timestamp: data.timestamp,
        clientId: data.clientId
    };
    
    console.log('📦 Broadcasting message:', message);
    broadcast(message, data.clientId);
}

// Handle general updates
function handleUpdate(data) {
    console.log('Handling update:', data);
    
    // Broadcast to all connected clients
    broadcast({
        type: 'system_update',
        data: data.data,
        timestamp: data.timestamp
    });
}

// Broadcast message to all clients
function broadcast(message, excludeClientId = null) {
    const messageStr = JSON.stringify(message);
    console.log(`📡 Broadcasting to ${clients.size} clients, excluding: ${excludeClientId}`);
    
    let sentCount = 0;
    clients.forEach((client, clientId) => {
        if (clientId !== excludeClientId && client.ws.readyState === WebSocket.OPEN) {
            try {
                client.ws.send(messageStr);
                console.log(`📡 Sent to client: ${clientId}`);
                sentCount++;
            } catch (error) {
                console.error('Error sending to client:', clientId, error);
                clients.delete(clientId);
            }
        } else {
            console.log(`⏭️ Skipping client: ${clientId} (excluded or not ready)`);
        }
    });
    
    console.log(`📡 Successfully sent to ${sentCount} clients`);
}

// Broadcast client count
function broadcastClientCount() {
    broadcast({
        type: 'client_count',
        count: clients.size,
        timestamp: new Date().toISOString()
    });
}

// Clean up inactive connections every 30 seconds
setInterval(() => {
    const now = new Date();
    clients.forEach((client, clientId) => {
        // Remove clients inactive for more than 5 minutes
        if (now - client.lastActivity > 5 * 60 * 1000) {
            console.log('Removing inactive client:', clientId);
            client.ws.terminate();
            clients.delete(clientId);
        }
    });
    broadcastClientCount();
}, 30000);

// REST API endpoints
app.get('/api/status', (req, res) => {
    res.json({
        status: 'running',
        connectedClients: clients.size,
        timestamp: new Date().toISOString()
    });
});

app.get('/api/clients', (req, res) => {
    const clientInfo = Array.from(clients.entries()).map(([id, client]) => ({
        id,
        connected: client.connected,
        lastActivity: client.lastActivity
    }));
    
    res.json(clientInfo);
});

// Serve the main application
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 TGT3 Warehouse Multi-User Server running on port ${PORT}`);
    console.log(`📊 WebSocket server ready for real-time sync`);
    console.log(`🌐 Access the application at: http://localhost:${PORT}`);
});
