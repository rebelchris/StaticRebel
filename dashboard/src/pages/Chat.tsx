import { useState, useRef, useEffect } from 'react';
import { Send, ThumbsUp, ThumbsDown, Bot, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  feedback?: '👍' | '👎';
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input }),
      });

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content:
          data.response || data.content || 'Sorry, I could not process that.',
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsTyping(false);
    }
  };

  const handleFeedback = async (messageId: string, feedback: '👍' | '👎') => {
    setMessages((prev) =>
      prev.map((msg) => (msg.id === messageId ? { ...msg, feedback } : msg)),
    );

    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, feedback }),
      });
    } catch (error) {
      console.error('Feedback error:', error);
    }
  };

  return (
    <div className='h-[calc(100vh-4rem)] flex flex-col'>
      {/* Messages */}
      <div className='flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin'>
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`flex max-w-[80%] ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div
                  className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                    message.role === 'user'
                      ? 'bg-primary-600 ml-2'
                      : 'bg-gray-200 mr-2'
                  }`}
                >
                  {message.role === 'user' ? (
                    <User className='h-5 w-5 text-white' />
                  ) : (
                    <Bot className='h-5 w-5 text-gray-600' />
                  )}
                </div>

                <div
                  className={`relative group ${
                    message.role === 'user'
                      ? 'bg-primary-600 text-white rounded-2xl rounded-tr-sm'
                      : 'bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-tl-sm shadow-sm'
                  } px-4 py-2`}
                >
                  <p className='text-sm whitespace-pre-wrap'>
                    {message.content}
                  </p>

                  {message.role === 'assistant' && (
                    <div className='absolute -bottom-6 left-0 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity'>
                      <button
                        onClick={() => handleFeedback(message.id, '👍')}
                        className={`p-1 rounded ${message.feedback === '👍' ? 'text-green-500' : 'text-gray-400 hover:text-green-500'}`}
                      >
                        <ThumbsUp className='h-4 w-4' />
                      </button>
                      <button
                        onClick={() => handleFeedback(message.id, '👎')}
                        className={`p-1 rounded ${message.feedback === '👎' ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}`}
                      >
                        <ThumbsDown className='h-4 w-4' />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isTyping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className='flex justify-start'
          >
            <div className='flex flex-row'>
              <div className='flex-shrink-0 h-8 w-8 rounded-full bg-gray-200 mr-2 flex items-center justify-center'>
                <Bot className='h-5 w-5 text-gray-600' />
              </div>
              <div className='bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm'>
                <div className='flex space-x-1'>
                  <span
                    className='w-2 h-2 bg-gray-400 rounded-full animate-bounce'
                    style={{ animationDelay: '0ms' }}
                  />
                  <span
                    className='w-2 h-2 bg-gray-400 rounded-full animate-bounce'
                    style={{ animationDelay: '150ms' }}
                  />
                  <span
                    className='w-2 h-2 bg-gray-400 rounded-full animate-bounce'
                    style={{ animationDelay: '300ms' }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className='border-t border-gray-200 bg-white p-4'>
        <div className='flex space-x-2'>
          <input
            type='text'
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder='Type your message...'
            className='flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent'
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className='bg-primary-600 text-white rounded-lg px-4 py-2 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
          >
            <Send className='h-5 w-5' />
          </button>
        </div>
      </div>
    </div>
  );
}
