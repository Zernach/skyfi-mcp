/**
 * Example: Using SSE Client for Real-time Communication
 * 
 * This example demonstrates how to use the SSE client for stateless HTTP + SSE communication
 */

import React, { useState, useEffect } from 'react';
import { sseManager } from '../lib/sse-manager';

export const SSEExample: React.FC = () => {
  const [connected, setConnected] = useState(false);
  const [clientId, setClientId] = useState<string>('');
  const [events, setEvents] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Initialize SSE connection
    const initSSE = async () => {
      try {
        const client = await sseManager.getClient();
        setConnected(true);
        setClientId(client.getClientId());

        // Register event handlers
        client.on('connected', (data) => {
          addEvent(`Connected: ${JSON.stringify(data)}`);
        });

        client.on('processing_started', (data) => {
          addEvent(`Processing started: ${data.method}`);
        });

        client.on('progress', (data) => {
          addEvent(`Progress: ${data.message || data.stage}`);
        });

        client.on('processing_complete', (data) => {
          addEvent(`Complete: ${JSON.stringify(data.result).substring(0, 100)}...`);
          setLoading(false);
        });

        client.on('processing_error', (data) => {
          addEvent(`Error: ${data.error.message}`);
          setLoading(false);
        });

      } catch (error) {
        console.error('Failed to initialize SSE:', error);
        setConnected(false);
      }
    };

    initSSE();

    return () => {
      sseManager.disconnect();
    };
  }, []);

  const addEvent = (event: string) => {
    setEvents(prev => [...prev, `${new Date().toISOString()}: ${event}`]);
  };

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    setLoading(true);
    addEvent(`Sending: ${message}`);

    try {
      const client = await sseManager.getClient();
      
      // Send message via stateless HTTP POST
      // Updates will arrive via SSE events
      await client.sendMessage('chat', {
        message: message,
        streaming: true,
      });

      setMessage('');
    } catch (error) {
      addEvent(`Send failed: ${error}`);
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    sseManager.disconnect();
    setConnected(false);
    addEvent('Disconnected');
  };

  const handleReconnect = async () => {
    try {
      await sseManager.getClient();
      setConnected(true);
      addEvent('Reconnected');
    } catch (error) {
      addEvent(`Reconnect failed: ${error}`);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h2>SSE Example: Stateless HTTP + SSE Communication</h2>
      
      {/* Connection Status */}
      <div style={{ marginBottom: '20px' }}>
        <div>
          <strong>Status:</strong>{' '}
          <span style={{ color: connected ? 'green' : 'red' }}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        {clientId && (
          <div>
            <strong>Client ID:</strong> {clientId}
          </div>
        )}
        <div style={{ marginTop: '10px' }}>
          {connected ? (
            <button onClick={handleDisconnect}>Disconnect</button>
          ) : (
            <button onClick={handleReconnect}>Reconnect</button>
          )}
        </div>
      </div>

      {/* Message Input */}
      <div style={{ marginBottom: '20px' }}>
        <h3>Send Message</h3>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Type a message..."
          style={{ width: '300px', padding: '8px' }}
          disabled={!connected || loading}
        />
        <button
          onClick={handleSendMessage}
          disabled={!connected || loading || !message.trim()}
          style={{ marginLeft: '10px' }}
        >
          {loading ? 'Sending...' : 'Send'}
        </button>
      </div>

      {/* Event Log */}
      <div>
        <h3>Event Log</h3>
        <div
          style={{
            border: '1px solid #ccc',
            padding: '10px',
            height: '400px',
            overflowY: 'scroll',
            backgroundColor: '#f5f5f5',
          }}
        >
          {events.length === 0 ? (
            <div style={{ color: '#999' }}>No events yet...</div>
          ) : (
            events.map((event, i) => (
              <div key={i} style={{ marginBottom: '5px', fontSize: '12px' }}>
                {event}
              </div>
            ))
          )}
        </div>
        <button
          onClick={() => setEvents([])}
          style={{ marginTop: '10px' }}
        >
          Clear Log
        </button>
      </div>

      {/* Usage Instructions */}
      <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#e3f2fd' }}>
        <h4>How It Works:</h4>
        <ol>
          <li>SSE connection established on component mount</li>
          <li>Each message sent via stateless HTTP POST</li>
          <li>Progress updates received via SSE events</li>
          <li>Connection automatically reconnects on failure</li>
        </ol>
        <h4>SSE Events:</h4>
        <ul>
          <li><code>connected</code> - Initial connection established</li>
          <li><code>processing_started</code> - Request processing began</li>
          <li><code>progress</code> - Progress update</li>
          <li><code>processing_complete</code> - Request completed</li>
          <li><code>processing_error</code> - Error occurred</li>
        </ul>
      </div>
    </div>
  );
};

export default SSEExample;


