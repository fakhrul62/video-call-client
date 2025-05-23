import React, { useEffect, useRef, useState } from "react";
import SimplePeer from "simple-peer";
import io from "socket.io-client";
import { useParams, useNavigate } from "react-router-dom";
import { 
  Video, Mic, MicOff, VideoOff, Phone, MessageSquare, 
  Settings, X, Copy, Users, Repeat, Send, Maximize, Minimize
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
  const [pinnedVideo, setPinnedVideo] = useState(null); // null when no video is pinned

  const socketRef = useRef();
  const localVideoRef = useRef();
  const pinnedLocalVideoRef = useRef();
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
        // Also set the pinned local video reference if it exists
        if (pinnedLocalVideoRef.current) {
          pinnedLocalVideoRef.current.srcObject = stream;
        }

        socketRef.current = io("https://video-call-server-lzaj.onrender.com", {
          transports: ['websocket', 'polling'],
          reconnection: true
        });
        
        console.log("Attempting to connect to socket server...");

        socketRef.current.on("connect", () => {
          console.log("Socket connected with ID:", socketRef.current.id);
          setMyID(socketRef.current.id);
          socketRef.current.emit("join", roomId);
          showToast("Connected to room", "success");
        });
        
        socketRef.current.on("connect_error", (error) => {
          console.error("Socket connection error:", error);
          showToast("Connection error: " + error.message, "error");
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
            
            // If the pinned user disconnects, unpin
            if (pinnedVideo === userID) {
              setPinnedVideo(null);
            }
            
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

  // Update pinned local video whenever the local stream changes
  useEffect(() => {
    if (pinnedLocalVideoRef.current && localStreamRef.current) {
      pinnedLocalVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [pinnedVideo]);

  const createPeer = (userToSignal, callerID, stream) => {
    const peer = new SimplePeer({
      initiator: true,
      trickle: true,
      stream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          {
            urls: 'turn:numb.viagenie.ca',
            credential: 'muazkh',
            username: 'webrtc@live.com'
          }
        ]
      }
      
      
    });
  
    peer.on("signal", (signal) => {
      socketRef.current.emit("signal", {
        to: userToSignal,
        from: callerID,
        signal,
      });
    });
    
    peer.on("error", (err) => {
      console.error("Peer error:", err);
    });
  
    return peer;
  };
  
  const addPeer = (incomingID, stream) => {
    const peer = new SimplePeer({
      initiator: false,
      trickle: true,
      stream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          {
            urls: 'turn:numb.viagenie.ca',
            credential: 'muazkh',
            username: 'webrtc@live.com'
          }
        ]
      }
      
      
    });
  
    peer.on("signal", (signal) => {
      socketRef.current.emit("signal", {
        to: incomingID,
        from: socketRef.current.id,
        signal,
      });
    });
    
    peer.on("error", (err) => {
      console.error("Peer error:", err);
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

      // Update local video displays
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = newStream;
      }
      if (pinnedLocalVideoRef.current) {
        pinnedLocalVideoRef.current.srcObject = newStream;
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

  // Function to handle pinning a video
  const pinVideo = (id) => {
    if (pinnedVideo === id) {
      setPinnedVideo(null); // Unpin if already pinned
    } else {
      setPinnedVideo(id);
    }
  };

  return (
    <div className="room-container">
      {/* Room Header */}
      <div className="room-header">
        <div className="room-title"> <span><img className="logo-img" src="https://i.ibb.co.com/5hShbQqK/phone-call.png" alt="RingX" /></span> </div>
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
        {/* Pinned Video Display */}
        {pinnedVideo && (
          <div className="pinned-video-container">
            {pinnedVideo === "local" ? (
              // Show pinned local video
              <React.Fragment>
                <video
                  ref={pinnedLocalVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="pinned-video"
                />
                <div className="username-label">You</div>
                <button onClick={() => pinVideo(null)} className="unpin-button">
                  <Minimize size={20} />
                </button>
              </React.Fragment>
            ) : (
              // Show pinned peer video
              peers.map(({ peerID, peer }) => {
                if (peerID === pinnedVideo) {
                  return (
                    <PinnedPeerVideo 
                      key={peerID} 
                      peer={peer} 
                      peerID={peerID} 
                      unpinVideo={() => pinVideo(null)}
                    />
                  );
                }
                return null;
              })
            )}
          </div>
        )}

        {/* Video Grid (shown differently when a video is pinned) */}
        <div className={`video-grid ${pinnedVideo ? 'minimized-grid' : ''}`}>
          {/* Local Video - Always show in grid regardless of whether it's pinned */}
          <div 
            className={`video-container ${pinnedVideo ? 'minimized' : ''}`}
            onClick={() => pinnedVideo !== 'local' && pinVideo('local')}
          >
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="video"
            />
            <div className="username-label">You</div>
            <div className="video-controls-overlay">
              <button onClick={(e) => {e.stopPropagation(); toggleVideo();}} className={`control-btn ${!isVideoEnabled ? 'off' : ''}`}>
                {isVideoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
              </button>
              <button onClick={(e) => {e.stopPropagation(); toggleAudio();}} className={`control-btn ${!isAudioEnabled ? 'off' : ''}`}>
                {isAudioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
              </button>
              {!pinnedVideo && (
                <button onClick={(e) => {e.stopPropagation(); pinVideo('local');}} className="control-btn">
                  <Maximize size={18} />
                </button>
              )}
            </div>
          </div>

          {/* Peer Videos */}
          {peers.map(({ peerID, peer }) => (
            // Always show all peer videos in the grid, even if one is pinned
            <PeerVideo 
              key={peerID} 
              peer={peer} 
              peerID={peerID}
              minimized={!!pinnedVideo}
              onPinVideo={() => pinVideo(peerID)}
            />
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
const PeerVideo = ({ peer, peerID, minimized, onPinVideo }) => {
  const videoRef = useRef();

  useEffect(() => {
    const handleStream = (stream) => {
      console.log(`Received stream from peer ${peerID}:`, stream);
      
      if (stream.getVideoTracks().length === 0) {
        console.warn("Received stream has no video tracks");
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Force play the video
        videoRef.current.play().catch(e => {
          console.error("Failed to play video:", e);
        });
      }
    };
    
    peer.on("stream", handleStream);
    
    // If we already have the stream
    if (peer._remoteStreams && peer._remoteStreams.length > 0) {
      handleStream(peer._remoteStreams[0]);
    }
    
    return () => {
      peer.off("stream", handleStream);
    };
  }, [peer, peerID]);

  return (
    <div 
      className={`video-container ${minimized ? 'minimized' : ''}`}
      onClick={onPinVideo}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="video"
        onLoadedMetadata={() => console.log(`Video from peer ${peerID} loaded metadata`)}
        onPlay={() => console.log(`Video from peer ${peerID} started playing`)}
        onError={(e) => console.error(`Video error for peer ${peerID}:`, e)}
      />
      <div className="username-label">User {peerID.slice(0, 4)}</div>
      <div className="video-controls-overlay">
        <button onClick={(e) => {e.stopPropagation(); onPinVideo();}} className="control-btn">
          <Maximize size={18} />
        </button>
      </div>
    </div>
  );
};

// Pinned Peer Video Component
const PinnedPeerVideo = ({ peer, peerID, unpinVideo }) => {
  const videoRef = useRef();

  useEffect(() => {
    // Important: This will ensure we properly capture and display the stream
    const handleStream = (stream) => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Sometimes the video doesn't play immediately, force it
        videoRef.current.play().catch(e => {
          console.warn("Auto-play prevented:", e);
        });
      }
    };

    peer.on("stream", handleStream);
    
    // If we already have a stream, use it (needed for re-renders)
    if (peer._remoteStreams && peer._remoteStreams.length > 0) {
      handleStream(peer._remoteStreams[0]);
    }

    return () => {
      peer.off("stream", handleStream);
    };
  }, [peer]);

  return (
    <div className="pinned-peer-container">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="pinned-video"
      />
      <div className="username-label">User {peerID.slice(0, 4)}</div>
      <button onClick={unpinVideo} className="unpin-button">
        <Minimize size={20} />
      </button>
    </div>
  );
};

export default Room;