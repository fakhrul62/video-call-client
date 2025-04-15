import React, { useEffect, useRef, useState } from "react";
import SimplePeer from "simple-peer";
import io from "socket.io-client";
import { useParams, useNavigate } from "react-router-dom";
import { 
  Video, Mic, MicOff, VideoOff, Phone, MessageSquare, 
  Settings, X, Copy, Users, Repeat, Send 
} from "lucide-react";

const Room = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  
  const [myID, setMyID] = useState("");
  const [peers, setPeers] = useState([]);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [participantCount, setParticipantCount] = useState(1);
  const [toast, setToast] = useState({ show: false, message: "", type: "" });

  const socketRef = useRef();
  const localVideoRef = useRef();
  const localStreamRef = useRef();
  const peersRef = useRef([]);
  const videoDeviceIdRef = useRef();
  const audioDeviceIdRef = useRef();
  const chatInputRef = useRef();
  const chatMessagesRef = useRef();

  useEffect(() => {
    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(
          (device) => device.kind === "videoinput"
        );
        const audioDevices = devices.filter(
          (device) => device.kind === "audioinput"
        );

        if (videoDevices.length > 0) {
          videoDeviceIdRef.current = videoDevices[0].deviceId;
        }
        
        if (audioDevices.length > 0) {
          audioDeviceIdRef.current = audioDevices[0].deviceId;
        }

        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        socketRef.current = io("https://video-call-server-lzaj.onrender.com"); // your backend URL

        socketRef.current.on("connect", () => {
          setMyID(socketRef.current.id);
          socketRef.current.emit("join", roomId);
          showToast("Connected to room", "success");
        });

        socketRef.current.on("all-users", (users) => {
          const newPeers = [];
          users.forEach((userID) => {
            const peer = createPeer(userID, socketRef.current.id, stream);
            peersRef.current.push({ peerID: userID, peer });
            newPeers.push({ peerID: userID, peer });
          });
          setPeers(newPeers);
          setParticipantCount(1 + users.length);
        });

        socketRef.current.on("user-joined", (userID) => {
          showToast("New participant joined", "success");
          const peer = addPeer(userID, stream);
          peersRef.current.push({ peerID: userID, peer });
          setPeers((prev) => [...prev, { peerID: userID, peer }]);
          setParticipantCount(prev => prev + 1);
        });

        socketRef.current.on("signal", ({ from, signal }) => {
          const item = peersRef.current.find((p) => p.peerID === from);
          if (item) item.peer.signal(signal);
        });

        socketRef.current.on("user-disconnected", (userID) => {
          const item = peersRef.current.find((p) => p.peerID === userID);
          if (item) {
            item.peer.destroy();
            peersRef.current = peersRef.current.filter(
              (p) => p.peerID !== userID
            );
            setPeers((prev) => prev.filter((p) => p.peerID !== userID));
            setParticipantCount(prev => prev - 1);
            showToast("Participant left", "error");
          }
        });
        
        socketRef.current.on("chat-message", ({ from, message }) => {
          setMessages(prev => [...prev, { from, message, isMe: false }]);
          if (!isChatOpen) {
            showToast("New message received", "success");
          }
        });
      } catch (err) {
        console.error("Error initializing room:", err);
        showToast("Error joining room: " + err.message, "error");
      }
    };

    init();

    return () => {
      // Cleanup on unmount
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      peersRef.current.forEach(({peer}) => {
        peer.destroy();
      });
    };
  }, [roomId]);

  // Scroll to bottom of chat when new messages arrive
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [messages]);

  const createPeer = (userToSignal, callerID, stream) => {
    const peer = new SimplePeer({
      initiator: true,
      trickle: false,
      stream,
    });

    peer.on("signal", (signal) => {
      socketRef.current.emit("signal", {
        to: userToSignal,
        from: callerID,
        signal,
      });
    });

    return peer;
  };

  const addPeer = (incomingID, stream) => {
    const peer = new SimplePeer({
      initiator: false,
      trickle: false,
      stream,
    });

    peer.on("signal", (signal) => {
      socketRef.current.emit("signal", {
        to: incomingID,
        from: socketRef.current.id,
        signal,
      });
    });

    return peer;
  };

  const switchCamera = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");

      if (videoDevices.length < 2) {
        showToast("Only one camera found", "error");
        return;
      }

      const currentId = videoDeviceIdRef.current;
      const currentIndex = videoDevices.findIndex(
        (d) => d.deviceId === currentId
      );
      const nextIndex = (currentIndex + 1) % videoDevices.length;
      const nextDevice = videoDevices[nextIndex];

      // Stop all tracks before getting new stream
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(track => track.stop());
      }

      // Get entirely new stream with new camera
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          deviceId: { exact: nextDevice.deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: isAudioEnabled ? { deviceId: audioDeviceIdRef.current } : false,
      });

      // Keep audio tracks from old stream if they exist
      if (localStreamRef.current && isAudioEnabled) {
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        if (audioTrack) {
          newStream.addTrack(audioTrack);
        }
      }

      // Replace the entire stream reference
      localStreamRef.current = newStream;

      // Update local video display
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = newStream;
      }

      // Replace tracks in all peer connections
      const videoTrack = newStream.getVideoTracks()[0];
      peersRef.current.forEach(({ peer }) => {
        const senders = peer._pc.getSenders();
        const sender = senders.find(s => s.track && s.track.kind === "video");
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      });

      videoDeviceIdRef.current = nextDevice.deviceId;
      setIsFrontCamera(!isFrontCamera);
      showToast(`Switched to ${nextDevice.label}`, "success");
    } catch (err) {
      console.error("❌ Camera switch error:", err);
      showToast("Failed to switch camera: " + err.message, "error");
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
        showToast(`Microphone ${audioTrack.enabled ? 'enabled' : 'disabled'}`, "success");
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
        showToast(`Camera ${videoTrack.enabled ? 'enabled' : 'disabled'}`, "success");
      }
    }
  };

  const endCall = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    navigate('/');
  };

  const toggleChat = () => {
    setIsChatOpen(!isChatOpen);
    if (!isChatOpen && chatInputRef.current) {
      setTimeout(() => chatInputRef.current.focus(), 300);
    }
  };

  const toggleSettings = () => {
    setIsSettingsOpen(!isSettingsOpen);
  };

  const sendMessage = () => {
    if (messageInput.trim() && socketRef.current) {
      socketRef.current.emit('chat-message', {
        room: roomId,
        message: messageInput.trim()
      });
      
      // Add message to our own chat
      setMessages(prev => [...prev, { 
        from: myID, 
        message: messageInput.trim(), 
        isMe: true 
      }]);
      
      setMessageInput('');
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    showToast("Room ID copied to clipboard", "success");
  };

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "" }), 3000);
  };

  const handleMessageInputKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="room-container">
      {/* Room Header */}
      <div className="room-header">
        <div className="room-title">Video Meeting</div>
        <div className="room-info">
          <div className="participant-count">
            <Users size={16} />
            <span>{participantCount}</span>
          </div>
          <div className="room-id" onClick={copyRoomId}>
            <span>Room: {roomId}</span>
            <Copy size={14} />
          </div>
        </div>
      </div>

      {/* Video Section */}
      <div className="video-section">
        <div className="video-grid">
          {/* Local Video */}
          <div className="video-container">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="video"
            />
            <div className="username-label">You</div>
            <div className="video-controls-overlay">
              <button onClick={toggleVideo} className={`control-btn ${!isVideoEnabled ? 'off' : ''}`}>
                {isVideoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
              </button>
              <button onClick={toggleAudio} className={`control-btn ${!isAudioEnabled ? 'off' : ''}`}>
                {isAudioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
              </button>
            </div>
          </div>

          {/* Peer Videos */}
          {peers.map(({ peerID, peer }) => (
            <PeerVideo key={peerID} peer={peer} peerID={peerID} />
          ))}
        </div>
      </div>

      {/* Main Control Bar */}
      <div className="control-bar">
        <div className="controls-left">
          <button onClick={switchCamera} className="control-btn btn-with-label">
            <Repeat size={20} />
            <span className="btn-label">{isFrontCamera ? "Back" : "Front"}</span>
          </button>
        </div>

        <div className="controls-center">
          <button 
            onClick={toggleAudio} 
            className={`control-btn btn-circle ${!isAudioEnabled ? 'off' : ''}`}
          >
            {isAudioEnabled ? <Mic size={24} /> : <MicOff size={24} />}
          </button>
          
          <button 
            onClick={toggleVideo} 
            className={`control-btn btn-circle ${!isVideoEnabled ? 'off' : ''}`}
          >
            {isVideoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
          </button>
          
          <button onClick={endCall} className="control-btn btn-circle danger">
            <Phone size={24} />
          </button>
        </div>

        <div className="controls-right">
          <button 
            onClick={toggleChat} 
            className={`control-btn ${isChatOpen ? 'active' : ''}`}
          >
            <MessageSquare size={20} />
          </button>
          
          <button 
            onClick={toggleSettings} 
            className={`control-btn ${isSettingsOpen ? 'active' : ''}`}
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Chat Panel */}
      <div className={`chat-panel ${isChatOpen ? 'open' : ''}`}>
        <div className="chat-header">
          <div>Chat</div>
          <button onClick={toggleChat} className="close-btn">
            <X size={16} />
          </button>
        </div>
        
        <div className="chat-messages" ref={chatMessagesRef}>
          {messages.map((msg, index) => (
            <div 
              key={index} 
              className={`message ${msg.isMe ? 'message-mine' : 'message-other'}`}
            >
              <div className="message-sender">
                {msg.isMe ? 'You' : `User ${msg.from.slice(0, 4)}`}
              </div>
              <div className="message-content">{msg.message}</div>
            </div>
          ))}
        </div>
        
        <div className="chat-input-area">
          <input 
            type="text" 
            className="chat-input"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={handleMessageInputKeyDown}
            placeholder="Type a message..."
            ref={chatInputRef}
          />
          <button onClick={sendMessage} className="send-btn">
            <Send size={16} />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      <div className={`settings-panel ${isSettingsOpen ? 'open' : ''}`}>
        <div className="settings-header">
          <div className="settings-title">Settings</div>
          <button onClick={toggleSettings} className="close-btn">
            <X size={18} />
          </button>
        </div>
        
        <div className="settings-section">
          <div className="settings-section-title">Video</div>
          <select className="device-select" id="video-select">
            {/* Placeholder for dynamic camera options */}
            <option value="default">Default Camera</option>
            <option value="front">Front Camera</option>
            <option value="back">Back Camera</option>
          </select>
        </div>
        
        <div className="settings-section">
          <div className="settings-section-title">Audio</div>
          <select className="device-select" id="audio-select">
            {/* Placeholder for dynamic microphone options */}
            <option value="default">Default Microphone</option>
            <option value="mic1">Microphone 1</option>
            <option value="mic2">Microphone 2</option>
          </select>
        </div>
      </div>

      {/* Overlay for modals */}
      <div 
        className={`overlay ${isSettingsOpen ? 'open' : ''}`} 
        onClick={toggleSettings}
      ></div>

      {/* Toast Notifications */}
      {toast.show && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
};

// Peer Video Component
const PeerVideo = ({ peer, peerID }) => {
  const videoRef = useRef();

  useEffect(() => {
    peer.on("stream", (stream) => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    });
  }, [peer]);

  return (
    <div className="video-container">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="video"
      />
      <div className="username-label">User {peerID.slice(0, 4)}</div>
    </div>
  );
};

export default Room;