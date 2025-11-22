import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Minus } from 'react-feather';
import { Spinner } from '../spinner/Spinner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './ChatWidget.scss';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const BASE_URL = 'http://localhost:3000';

export const ChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await fetch(`${BASE_URL}/mcp/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'chat',
          params: {
            message: userMsg.content,
            conversationId
          },
          id: Date.now()
        })
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || 'MCP error occurred');
      }

      const result = data.result;

      if (result.conversationId) {
        setConversationId(result.conversationId);
      }

      const assistantMsg: Message = {
        id: Date.now().toString() + 'a',
        role: 'assistant',
        content: result.response || 'No response received.'
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMsg: Message = {
        id: Date.now().toString() + 'e',
        role: 'assistant',
        content: 'Sorry, there was an error processing your request. Please try again later.'
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="chat-widget">
      {isOpen && (
        <div className="chat-window">
          <div className="chat-header">
            <h3>SkyFi Assistant</h3>
            <button className="close-btn" onClick={() => setIsOpen(false)}>
              <Minus size={20} />
            </button>
          </div>
          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="message assistant">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  Hello! I can help you find satellite imagery or answer questions about SkyFi. How can I assist you today?
                </ReactMarkdown>
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`message ${msg.role}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content}
                </ReactMarkdown>
              </div>
            ))}
            {isLoading && (
              <div className="message assistant">
                <Spinner size={16} />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="chat-input-area">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Type a message..."
              disabled={isLoading}
            />
            <button onClick={handleSendMessage} disabled={isLoading || !inputValue.trim()}>
              <Send size={18} />
            </button>
          </div>
        </div>
      )}
      <button className="chat-toggle" onClick={() => setIsOpen(!isOpen)}>
        {isOpen ? <X /> : <MessageSquare />}
      </button>
    </div>
  );
};

