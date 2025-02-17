import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import './App.css';

const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

function App() {
  const [roomId, setRoomId] = useState('');
  const [isInCall, setIsInCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [error, setError] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [copySuccess, setCopySuccess] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [userName, setUserName] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);

  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const socketRef = useRef();
  const peerConnectionRef = useRef();
  const localStreamRef = useRef();
  const screenStreamRef = useRef();
  const chatEndRef = useRef();

  useEffect(() => {
    socketRef.current = io('http://localhost:3000');
    
    socketRef.current.on('user-joined', handleUserJoined);
    socketRef.current.on('offer', handleOffer);
    socketRef.current.on('answer', handleAnswer);
    socketRef.current.on('ice-candidate', handleIceCandidate);
    socketRef.current.on('room-closed', handleRoomClosed);
    socketRef.current.on('chat-message', handleChatMessage);

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (!isChatOpen) {
      setUnreadMessages(prev => prev + 1);
    }
  }, [messages]);

  useEffect(() => {
    if (isChatOpen) {
      setUnreadMessages(0);
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isChatOpen, messages]);

  const createRoom = async () => {
    if (!userName.trim()) {
      setError('Please enter your name before creating a room');
      return;
    }
    try {
      const newRoomId = uuidv4();
      setRoomId(newRoomId);
      await setupMediaStream();
      socketRef.current.emit('create-room', newRoomId);
      setIsInCall(true);
      setConnectionStatus('waiting');
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const joinRoom = async () => {
    if (!userName.trim()) {
      setError('Please enter your name before joining a room');
      return;
    }
    try {
      await setupMediaStream();
      socketRef.current.emit('join-room', roomId);
      setIsInCall(true);
      setConnectionStatus('connecting');
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const setupMediaStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (err) {
      throw new Error(`Camera/Microphone access denied. Please check your device permissions.`);
    }
  };

  const handleUserJoined = async (userId) => {
    try {
      peerConnectionRef.current = new RTCPeerConnection(iceServers);
      
      localStreamRef.current.getTracks().forEach(track => {
        peerConnectionRef.current.addTrack(track, localStreamRef.current);
      });

      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit('ice-candidate', {
            candidate: event.candidate,
            roomId
          });
        }
      };

      peerConnectionRef.current.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);
      socketRef.current.emit('offer', { offer, roomId });
      setConnectionStatus('connecting');
    } catch (err) {
      setError(`Connection failed. Please try again.`);
    }
  };

  const handleOffer = async ({ offer, from }) => {
    try {
      peerConnectionRef.current = new RTCPeerConnection(iceServers);
      
      localStreamRef.current.getTracks().forEach(track => {
        peerConnectionRef.current.addTrack(track, localStreamRef.current);
      });

      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit('ice-candidate', {
            candidate: event.candidate,
            roomId
          });
        }
      };

      peerConnectionRef.current.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      await peerConnectionRef.current.setRemoteDescription(offer);
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      socketRef.current.emit('answer', { answer, roomId });
      setConnectionStatus('connected');
    } catch (err) {
      setError(`Connection failed. Please try again.`);
    }
  };

  const handleAnswer = async ({ answer }) => {
    try {
      await peerConnectionRef.current.setRemoteDescription(answer);
      setConnectionStatus('connected');
    } catch (err) {
      setError(`Connection failed. Please try again.`);
    }
  };

  const handleIceCandidate = async ({ candidate }) => {
    try {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(candidate);
      }
    } catch (err) {
      setError(`Connection failed. Please try again.`);
    }
  };

  const handleRoomClosed = () => {
    setIsInCall(false);
    setConnectionStatus('disconnected');
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    setError('The other participant has left the call');
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOff(!isVideoOff);
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });
        
        screenStreamRef.current = screenStream;
        const videoTrack = screenStream.getVideoTracks()[0];
        
        if (peerConnectionRef.current) {
          const sender = peerConnectionRef.current.getSenders().find(s => 
            s.track.kind === 'video'
          );
          if (sender) {
            sender.replaceTrack(videoTrack);
          }
        }
        
        localVideoRef.current.srcObject = screenStream;
        videoTrack.onended = () => {
          stopScreenShare();
        };
        
        setIsScreenSharing(true);
      } else {
        stopScreenShare();
      }
    } catch (err) {
      setError('Failed to share screen. Please try again.');
    }
  };

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      
      if (peerConnectionRef.current && localStreamRef.current) {
        const sender = peerConnectionRef.current.getSenders().find(s => 
          s.track.kind === 'video'
        );
        if (sender) {
          sender.replaceTrack(localStreamRef.current.getVideoTracks()[0]);
        }
      }
      
      localVideoRef.current.srcObject = localStreamRef.current;
      setIsScreenSharing(false);
    }
  };

  const endCall = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    setIsInCall(false);
    setConnectionStatus('disconnected');
    socketRef.current.emit('leave-room', roomId);
  };

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      setError('Failed to copy room ID');
    }
  };

  const sendMessage = () => {
    if (newMessage.trim()) {
      const messageData = {
        text: newMessage,
        sender: userName,
        timestamp: new Date().toISOString(),
        isLocal: true
      };
      setMessages(prev => [...prev, messageData]);
      socketRef.current.emit('chat-message', { message: messageData, roomId });
      setNewMessage('');
    }
  };

  const handleChatMessage = (messageData) => {
    messageData.isLocal = false;
    setMessages(prev => [...prev, messageData]);
  };

  return (
    <div className="app-container">
      <h1>
        <span className="gradient-text">Video Chat</span> App
      </h1>
      
      {error && (
        <div className="error-message">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          {error}
        </div>
      )}
      
      <div className={`status-indicator ${connectionStatus}`}>
        Status: {connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
      </div>

      {!isInCall ? (
        <div className="join-container">
          <div className="user-name-input">
            <input
              type="text"
              placeholder="Enter your name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="name-input"
            />
          </div>
          <button onClick={createRoom} className="create-room-btn" disabled={!userName.trim()}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            Create New Room
          </button>
          <div className="join-room">
            <input
              type="text"
              placeholder="Enter Room ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            />
            <button onClick={joinRoom} disabled={!roomId || !userName.trim()}>
              Join Room
            </button>
          </div>
        </div>
      ) : (
        <div className="video-container">
          <div className="video-grid">
            <div className="video-wrapper">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="local-video"
              />
              <div className="video-label">You ({userName})</div>
            </div>
            <div className="video-wrapper">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="remote-video"
              />
              <div className="video-label">Remote User</div>
            </div>
          </div>

          <div className="controls">
            <button onClick={toggleMute} className={isMuted ? 'active' : ''}>
              {isMuted ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </svg>
                  Unmute
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </svg>
                  Mute
                </>
              )}
            </button>
            <button onClick={toggleVideo} className={isVideoOff ? 'active' : ''}>
              {isVideoOff ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                  Turn On Video
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7"></polygon>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                  </svg>
                  Turn Off Video
                </>
              )}
            </button>
            <button onClick={toggleScreenShare} className={isScreenSharing ? 'active' : ''}>
              {isScreenSharing ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                  Stop Sharing
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                  </svg>
                  Share Screen
                </>
              )}
            </button>
            <button onClick={() => setIsChatOpen(!isChatOpen)} className="chat-btn">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              Chat
              {unreadMessages > 0 && !isChatOpen && (
                <span className="unread-badge">{unreadMessages}</span>
              )}
            </button>
            <button onClick={endCall} className="end-call">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 2v4"></path>
                <path d="M8 2v4"></path>
                <path d="M3 6h18"></path>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
              End Call
            </button>
          </div>

          {isChatOpen && (
            <div className="chat-container">
              <div className="chat-messages">
                {messages.map((msg, index) => (
                  <div key={index} className={`message ${msg.isLocal ? 'local' : 'remote'}`}>
                    <div className="message-header">
                      <span className="message-sender">{msg.sender}</span>
                      <span className="message-time">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="message-text">{msg.text}</div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="chat-input">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                />
                <button onClick={sendMessage}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </div>
            </div>
          )}

          <div className="room-info">
            Room ID: {roomId}
            <button
              onClick={copyRoomId}
              className="copy-btn"
            >
              {copySuccess ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  Copy
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;