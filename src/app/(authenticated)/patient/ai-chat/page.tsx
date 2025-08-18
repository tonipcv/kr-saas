'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Send, ChevronDown, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isFromFAQ?: boolean;
  faq?: {
    question: string;
    category: string;
  };
  confidence?: number;
  needsReview?: boolean;
  createdAt: string;
}

interface Conversation {
  id: string;
  title: string;
  doctorName: string;
  createdAt: string;
}

export default function PatientAIChatPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [currentMessage, setCurrentMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [doctorId, setDoctorId] = useState<string>('');
  const [isLoadingDoctor, setIsLoadingDoctor] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [doctorInfo, setDoctorInfo] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (session?.user?.id) {
      loadDoctorInfo();
    }
  }, [session]);

  useEffect(() => {
    scrollToBottom();
    setTimeout(checkScrollPosition, 100);
  }, [messages]);

  // Scroll listener
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScrollPosition);
      return () => container.removeEventListener('scroll', checkScrollPosition);
    }
  }, []);

  // Mobile viewport handling
  useEffect(() => {
    const handleViewportChange = () => {
      // Force scroll to bottom when viewport changes (keyboard open/close)
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    };

    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
      return () => {
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', handleViewportChange);
        }
      };
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollButton(false);
  };

  const loadDoctorInfo = async () => {
    try {
      setIsLoadingDoctor(true);
      const response = await fetch('/api/patient/profile');
      if (response.ok) {
        const data = await response.json();
        if (data.user?.doctorId) {
          setDoctorId(data.user.doctorId);
          
          // Fetch doctor info for display (dedicated endpoint)
          const doctorResponse = await fetch('/api/v2/patients/referral');
          if (doctorResponse.ok) {
            const payload = await doctorResponse.json();
            setDoctorInfo(payload?.data?.doctor || null);
          }
          
          loadWelcomeMessage(data.user.doctorId);
        }
      }
    } catch (error) {
      console.error('Error loading doctor info:', error);
    } finally {
      setIsLoadingDoctor(false);
    }
  };

  const loadWelcomeMessage = async (docId: string) => {
    try {
      const patientName = session?.user?.name || 'Patient';
      const welcomeMsg: Message = {
        id: 'welcome',
        role: 'assistant',
        content: `Hello ${patientName}! I am your doctor's AI assistant. How can I help you today?`,
        createdAt: new Date().toISOString()
      };
      setMessages([welcomeMsg]);
    } catch (error) {
      console.error('Error loading welcome message:', error);
      const patientName = session?.user?.name || 'Patient';
      const welcomeMsg: Message = {
        id: 'welcome',
        role: 'assistant',
        content: `Hello ${patientName}! How can I help you today?`,
        createdAt: new Date().toISOString()
      };
      setMessages([welcomeMsg]);
    }
  };

  const sendMessage = async () => {
    if (!currentMessage.trim() || !doctorId || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: currentMessage,
      createdAt: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setCurrentMessage('');
    setLoading(true);

    try {
      const response = await fetch('/api/patient/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: currentMessage,
          doctorId: doctorId,
          conversationId: conversation?.id
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.response,
          confidence: data.confidence,
          needsReview: data.needsReview,
          createdAt: new Date().toISOString()
        };

        setMessages(prev => [...prev, aiMessage]);

        if (data.conversationId && !conversation) {
          setConversation({
            id: data.conversationId,
            title: currentMessage.slice(0, 50),
            doctorName: 'Seu Médico',
            createdAt: new Date().toISOString()
          });
        }

        if (data.needsReview) {
          toast.info('Your question has been forwarded to the doctor for review');
        }
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Error sending message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Error sending message');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const checkScrollPosition = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 100;
      setShowScrollButton(!isAtBottom && messages.length > 3);
    }
  };

  // Skeleton Loading Component
  const ChatSkeleton = () => (
    <div className="min-h-screen" style={{ backgroundColor: '#101010' }}>
      {/* Mobile Skeleton */}
      <div className="lg:hidden">
        <div className="fixed inset-0 flex flex-col" style={{ backgroundColor: '#101010' }}>
          {/* Header Skeleton */}
          <div className="flex-shrink-0 pt-[100px] px-4 pb-4 border-b border-gray-800/30">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-gray-800/30 rounded-xl animate-pulse"></div>
              <div className="text-center flex-1">
                <div className="h-5 bg-gray-800/30 rounded-lg w-32 mx-auto animate-pulse"></div>
              </div>
              <div className="w-10"></div>
            </div>
          </div>

          {/* Messages Skeleton */}
          <div 
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
            style={{ 
              height: 'calc(100vh - 200px)',
              paddingBottom: '100px'
            }}
          >
            {/* Assistant message skeleton */}
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-gray-800/50 animate-pulse">
                <div className="h-4 bg-gray-700/50 rounded w-full mb-2"></div>
                <div className="h-4 bg-gray-700/50 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-700/30 rounded w-16"></div>
              </div>
            </div>
            
            {/* User message skeleton */}
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-gray-700/30 animate-pulse">
                <div className="h-4 bg-gray-600/50 rounded w-full mb-2"></div>
                <div className="h-3 bg-gray-600/30 rounded w-16"></div>
              </div>
            </div>
          </div>

          {/* Input Skeleton - Fixed at bottom */}
          <div className="fixed bottom-0 left-0 right-0 border-t border-gray-800/50 backdrop-blur-sm z-20" style={{ backgroundColor: 'rgba(16, 16, 16, 0.95)' }}>
            <div className="p-4 pb-6">
              <div className="flex gap-3">
                <div className="flex-1 h-12 bg-gray-800/50 rounded-2xl animate-pulse"></div>
                <div className="w-12 h-12 bg-gray-700/50 rounded-2xl animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Skeleton */}
      <div className="hidden lg:block pt-[88px] pb-4 lg:ml-64" style={{ backgroundColor: '#101010' }}>
        <div className="max-w-6xl mx-auto px-6">
          
          {/* Hero Skeleton */}
          <div className="relative overflow-hidden mb-6">
            <div className="relative py-6">
              <div className="text-center max-w-3xl mx-auto">
                <div className="h-6 bg-gray-800/30 rounded-lg w-96 mx-auto mb-6 animate-pulse"></div>
                
                {/* Stats Skeleton */}
                <div className="flex items-center justify-center gap-8">
                  <div className="text-center">
                    <div className="h-8 bg-gray-800/50 rounded w-8 mx-auto mb-1 animate-pulse"></div>
                    <div className="h-4 bg-gray-800/30 rounded w-16 mx-auto animate-pulse"></div>
                  </div>
                  <div className="w-px h-8 bg-gray-700" />
                  <div className="text-center">
                    <div className="h-8 bg-gray-800/50 rounded w-8 mx-auto mb-1 animate-pulse"></div>
                    <div className="h-4 bg-gray-800/30 rounded w-16 mx-auto animate-pulse"></div>
                  </div>
                  <div className="w-px h-8 bg-gray-700" />
                  <div className="text-center">
                    <div className="h-8 bg-gray-800/50 rounded w-8 mx-auto mb-1 animate-pulse"></div>
                    <div className="h-4 bg-gray-800/30 rounded w-16 mx-auto animate-pulse"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Chat Container Skeleton */}
          <div className="bg-gray-900/50 border border-gray-800/50 rounded-2xl overflow-hidden shadow-lg">
            
            {/* Messages Area Skeleton */}
            <div className="h-[500px] overflow-y-auto p-6 space-y-4">
              {/* Assistant message skeleton */}
              <div className="flex justify-start">
                <div className="max-w-[70%] rounded-2xl px-4 py-3 bg-gray-800/50 animate-pulse">
                  <div className="h-4 bg-gray-700/50 rounded w-full mb-2"></div>
                  <div className="h-4 bg-gray-700/50 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-700/30 rounded w-16"></div>
                </div>
              </div>
              
              {/* User message skeleton */}
              <div className="flex justify-end">
                <div className="max-w-[70%] rounded-2xl px-4 py-3 bg-gray-700/30 animate-pulse">
                  <div className="h-4 bg-gray-600/50 rounded w-full mb-2"></div>
                  <div className="h-3 bg-gray-600/30 rounded w-16"></div>
                </div>
              </div>
            </div>

            {/* Input Area Skeleton */}
            <div className="border-t border-gray-800/50 bg-gray-800/30 p-6">
              <div className="flex gap-3">
                <div className="flex-1 h-12 bg-gray-800/50 rounded-xl animate-pulse"></div>
                <div className="w-12 h-12 bg-gray-700/50 rounded-xl animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Show skeleton while loading doctor info
  if (isLoadingDoctor) {
    return <ChatSkeleton />;
  }

  // Show unavailable message only after loading is complete and no doctor found
  if (!doctorId) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#101010' }}>
        {/* Mobile: Full screen layout */}
        <div className="lg:hidden fixed inset-0 flex flex-col" style={{ backgroundColor: '#101010' }}>
          {/* Header com botão voltar */}
          <div className="flex-shrink-0 pt-[100px] px-4 pb-4 border-b border-gray-800/30">
            <div className="flex items-center justify-between mb-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.back()}
                className="text-white hover:text-white hover:bg-gray-700/50 rounded-xl w-10 h-10 flex items-center justify-center"
              >
                <ArrowLeft className="h-6 w-6" />
              </Button>
              <div className="text-center flex-1">
                <p className="text-white text-base font-medium">
                  AI Assistant 24/7
                </p>
              </div>
              <div className="w-10"></div>
            </div>
          </div>
          
          {/* Content */}
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center">
              <div className="w-20 h-20 bg-teal-400/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <span className="text-3xl">🩺</span>
              </div>
              <h3 className="text-xl font-light text-white mb-3">
                Assistant Unavailable
              </h3>
              <p className="text-gray-400 leading-relaxed max-w-md">
                You need to be linked to a doctor to use the AI assistant.
              </p>
            </div>
          </div>
        </div>

        {/* Desktop: Standard layout */}
        <div className="hidden lg:block pt-[88px] pb-4 lg:ml-64">
          <div className="max-w-6xl mx-auto px-6 py-8">
            <div className="text-center p-8">
              <div className="w-20 h-20 bg-teal-400/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <span className="text-3xl">🩺</span>
              </div>
              <h3 className="text-xl font-light text-white mb-3">
                Assistant Unavailable
              </h3>
              <p className="text-gray-300 leading-relaxed max-w-md mx-auto">
                You need to be linked to a doctor to use the AI assistant.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#101010' }}>
      {/* Mobile: Full screen chat layout */}
      <div className="lg:hidden">
        <div className="fixed inset-0 flex flex-col" ref={chatContainerRef} style={{ backgroundColor: '#101010' }}>
          {/* Header com botão voltar */}
          <div className="flex-shrink-0 pt-[100px] px-4 pb-4 border-b border-gray-800/30">
            <div className="flex items-center justify-between mb-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.back()}
                className="text-white hover:text-white hover:bg-gray-700/50 rounded-xl w-10 h-10 flex items-center justify-center"
              >
                <ArrowLeft className="h-6 w-6" />
              </Button>
              <div className="text-center flex-1">
                <p className="text-white text-base font-medium">
                  {doctorInfo?.clinicName ? `${doctorInfo.clinicName} AI` : 'AI Assistant 24/7'}
                </p>
              </div>
              <div className="w-10"></div> {/* Spacer for centering */}
            </div>
          </div>

          {/* Messages area - altura ajustada para o novo header */}
          <div 
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3" 
            ref={messagesContainerRef}
            style={{ 
              height: 'calc(100vh - 200px)', // Altura ajustada para o header maior
              paddingBottom: '100px' // Espaço para o input
            }}
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-gradient-to-r from-teal-400 to-teal-500 text-black'
                      : 'bg-gray-800/80 text-white border border-gray-700/50'
                  }`}
                >
                  <div className="whitespace-pre-wrap leading-relaxed text-base">
                    {message.content}
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs opacity-70">
                    <span>{formatTime(message.createdAt)}</span>
                    {message.role === 'assistant' && (
                      <div className="flex items-center gap-2">
                        {message.isFromFAQ && (
                          <Badge className="bg-teal-400/20 text-teal-300 border-teal-400/30 text-xs">
                            Quick
                          </Badge>
                        )}
                        {message.needsReview && (
                          <Badge className="bg-amber-400/20 text-amber-300 border-amber-400/30 text-xs">
                            Review
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-800/80 rounded-2xl px-4 py-3 border border-gray-700/50">
                  <div className="flex items-center gap-3">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-teal-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                      <div className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                    </div>
                    <span className="text-gray-300 text-sm">Typing...</span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Scroll to bottom button */}
          {showScrollButton && (
            <div className="absolute bottom-24 right-4 z-10">
              <Button
                onClick={scrollToBottom}
                size="icon"
                className="rounded-full w-10 h-10 bg-teal-500/90 hover:bg-teal-500 text-white shadow-lg backdrop-blur-sm border border-teal-400/30"
              >
                <ChevronDown className="h-5 w-5" />
              </Button>
            </div>
          )}

          {/* Input fixo na parte inferior - sem espaço para navegação */}
          <div className="fixed bottom-0 left-0 right-0 border-t border-gray-800/50 backdrop-blur-sm z-20" style={{ backgroundColor: 'rgba(16, 16, 16, 0.95)' }}>
            <div className="p-4 pb-6">
              <div className="flex gap-3">
                <Input
                  ref={inputRef}
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your question..."
                  disabled={loading}
                  className="flex-1 bg-gray-800/60 border-gray-700/50 text-white placeholder-gray-400 rounded-2xl px-4 py-3 text-base focus:border-teal-400/50 focus:ring-teal-400/20 focus:bg-gray-800/80 h-12"
                />
                <Button
                  onClick={sendMessage}
                  disabled={loading || !currentMessage.trim()}
                  size="icon"
                  className="rounded-2xl w-12 h-12 bg-gradient-to-r from-teal-400 to-teal-500 hover:from-teal-500 hover:to-teal-600 text-black shadow-lg disabled:opacity-50 flex-shrink-0 p-1"
                >
                  <div className="relative w-8 h-8">
                    <Image
                      src="/logo.png"
                      alt="Send"
                      fill
                      className="object-contain"
                    />
                  </div>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop: Standard layout */}
      <div className="hidden lg:block pt-[88px] pb-4 lg:ml-64" style={{ backgroundColor: '#101010' }}>
        <div className="max-w-6xl mx-auto px-6">
          
          {/* Hero Section */}
          <div className="relative overflow-hidden mb-6">
            <div className="absolute inset-0 bg-gradient-to-br from-gray-900/20 via-gray-800/10 to-gray-900/20" />
            <div className="relative py-6">
              <div className="text-center max-w-3xl mx-auto">
                <p className="text-lg text-gray-300 mb-6 font-light leading-relaxed">
                  Available 24/7 to help you with your healthcare questions
                </p>
                
                {/* Stats */}
                <div className="flex items-center justify-center gap-8">
                  <div className="text-center">
                    <div className="text-2xl font-light text-white mb-0.5">
                      {messages.length}
                    </div>
                    <div className="text-sm text-gray-400">
                      Messages
                    </div>
                  </div>
                  <div className="w-px h-8 bg-gray-700" />
                  <div className="text-center">
                    <div className="text-2xl font-light text-teal-400 mb-0.5">
                      24/7
                    </div>
                    <div className="text-sm text-gray-400">
                      Available
                    </div>
                  </div>
                  <div className="w-px h-8 bg-gray-700" />
                  <div className="text-center">
                    <div className="text-2xl font-light text-white mb-0.5">
                      AI
                    </div>
                    <div className="text-sm text-gray-400">
                      Powered
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Chat Container */}
          <div className="border border-gray-800/50 rounded-2xl overflow-hidden shadow-lg">
            
            {/* Messages Area */}
            <div className="h-[500px] overflow-y-auto p-6 space-y-4" ref={messagesContainerRef}>
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-gradient-to-r from-teal-400 to-teal-500 text-black'
                        : 'bg-gray-800/80 text-white border border-gray-700/50'
                    }`}
                  >
                    <div className="whitespace-pre-wrap leading-relaxed">
                      {message.content}
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs opacity-70">
                      <span>{formatTime(message.createdAt)}</span>
                      {message.role === 'assistant' && (
                        <div className="flex items-center gap-2">
                          {message.isFromFAQ && (
                            <Badge className="bg-teal-400/20 text-teal-300 border-teal-400/30 text-xs">
                              Quick
                            </Badge>
                          )}
                          {message.needsReview && (
                            <Badge className="bg-amber-400/20 text-amber-300 border-amber-400/30 text-xs">
                              Review
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-gray-800/80 rounded-2xl px-4 py-3 border border-gray-700/50">
                    <div className="flex items-center gap-3">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-teal-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                        <div className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      </div>
                      <span className="text-gray-300 text-sm">Typing...</span>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t border-gray-800/50 bg-gray-800/30 p-6">
              <div className="flex gap-3">
                <Input
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your question..."
                  disabled={loading}
                  className="flex-1 bg-gray-800/60 border-gray-700/50 text-white placeholder-gray-400 rounded-xl px-4 py-3 focus:border-teal-400/50 focus:ring-teal-400/20 focus:bg-gray-800/80"
                />
                <Button
                  onClick={sendMessage}
                  disabled={loading || !currentMessage.trim()}
                  size="icon"
                  className="rounded-xl w-12 h-12 bg-gradient-to-r from-teal-400 to-teal-500 hover:from-teal-500 hover:to-teal-600 text-black shadow-lg disabled:opacity-50 p-1"
                >
                  <div className="relative w-8 h-8">
                    <Image
                      src="/logo.png"
                      alt="Send"
                      fill
                      className="object-contain"
                    />
                  </div>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 