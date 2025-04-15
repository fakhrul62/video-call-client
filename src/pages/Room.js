import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';

const socket = io("https://video-call-server-lzaj.onrender.com");

function Room() {
  const { roomId } = useParams();
  const [peers, setPeers] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);  // Track which camera is active
  const peersRef = useRef([]);
  const localVideoRef = useRef();
  const localStreamRef = useRef();
  const videoDeviceIdRef = useRef(null);  // To store the current video device ID

  useEffect(() => {
    // Function to get available video devices (cameras)
    const getAvailableCameras = async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      return videoDevices;
    };

    // Start video stream with the current device
    const startStream = async (deviceId = null) => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: deviceId || undefined },
        audio: true,
      });
      localVideoRef.current.srcObject = stream;
      localStreamRef.current = stream;

      socket.emit("join", roomId);

      socket.on("all-users", (users) => {
        const peers = users.map(userID => {
          const peer = createPeer(userID, socket.id, stream);
          peersRef.current.push({ peerID: userID, peer });
          return { peerID: userID, peer };
        });
        setPeers(peers);
      });

      socket.on("user-joined", (userID) => {
        const peer = addPeer(userID, stream);
        peersRef.current.push({ peerID: userID, peer });
        setPeers(users => [...users, { peerID: userID, peer }]);
      });

      socket.on("signal", ({ from, signal }) => {
        const item = peersRef.current.find(p => p.peerID === from);
        if (item) {
          item.peer.signal(signal);
        }
      });

      socket.on("user-disconnected", (userID) => {
        const item = peersRef.current.find(p => p.peerID === userID);
        if (item) {
          item.peer.destroy();
        }
        peersRef.current = peersRef.current.filter(p => p.peerID !== userID);
        setPeers(users => users.filter(p => p.peerID !== userID));
      });
    };

    // Start with the first available camera
    getAvailableCameras().then(cameras => {
      if (cameras.length > 0) {
        videoDeviceIdRef.current = cameras[0].deviceId;  // Store the device ID of the front camera
        startStream(cameras[0].deviceId);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [roomId]);

  const createPeer = (userToSignal, callerID, stream) => {
    const peer = new Peer({ initiator: true, trickle: false, stream });
    peer.on("signal", signal => {
      socket.emit("signal", { to: userToSignal, from: callerID, signal });
    });
    return peer;
  };

  const addPeer = (incomingID, stream) => {
    const peer = new Peer({ initiator: false, trickle: false, stream });
    peer.on("signal", signal => {
      socket.emit("signal", { to: incomingID, from: socket.id, signal });
    });
    return peer;
  };

  const toggleMute = () => {
    const stream = localStreamRef.current;
    const audioTracks = stream.getAudioTracks();
    audioTracks.forEach(track => track.enabled = !isMuted);
    setIsMuted(!isMuted);
  };

  const toggleVideo = () => {
    const stream = localStreamRef.current;
    const videoTracks = stream.getVideoTracks();
    videoTracks.forEach(track => track.enabled = !isVideoOff);
    setIsVideoOff(!isVideoOff);
  };

  const switchCamera = async () => {
    const videoDevices = await navigator.mediaDevices.enumerateDevices();
    const nextDevice = videoDevices.find(device => device.kind === 'videoinput' && device.deviceId !== videoDeviceIdRef.current);

    if (nextDevice) {
      // Stop the current video tracks
      const currentStream = localStreamRef.current;
      currentStream.getTracks().forEach(track => track.stop());

      // Start stream with new camera
      videoDeviceIdRef.current = nextDevice.deviceId;
      startStream(nextDevice.deviceId);
      setIsFrontCamera(!isFrontCamera);
    }
  };

  return (
    <div className="room-container">
      <div className="video-grid">
        <div className="local-video-container">
          <video ref={localVideoRef} autoPlay muted />
        </div>
        {peers.map(({ peerID, peer }) => (
          <div className="peer-video-container" key={peerID}>
            <Video peer={peer} />
          </div>
        ))}
      </div>
      
      <div className="controls">
        <button className="control-btn" onClick={toggleMute}>{isMuted ? "Mute" : "Unmute"}</button>
        <button className="control-btn" onClick={toggleVideo}>{isVideoOff ? "Turn Video On" : "Turn Video Off"}</button>
        <button className="control-btn" onClick={switchCamera}>{isFrontCamera ? "Switch to Back Camera" : "Switch to Front Camera"}</button>
      </div>
    </div>
  );
}

function Video({ peer }) {
  const ref = useRef();

  useEffect(() => {
    peer.on("stream", stream => {
      ref.current.srcObject = stream;
    });
  }, [peer]);

  return <video ref={ref} autoPlay />;
}

export default Room;
