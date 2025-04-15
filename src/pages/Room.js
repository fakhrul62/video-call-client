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
  const [isFrontCamera, setIsFrontCamera] = useState(true);

  const peersRef = useRef([]);
  const localVideoRef = useRef();
  const localStreamRef = useRef();
  const videoDeviceIdRef = useRef(null);

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

  const startStream = async (deviceId = null) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: deviceId ? { exact: deviceId } : undefined },
      audio: true,
    });

    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    socket.emit("join", roomId);

    socket.on("all-users", (users) => {
      const newPeers = users.map(userID => {
        const peer = createPeer(userID, socket.id, stream);
        peersRef.current.push({ peerID: userID, peer });
        return { peerID: userID, peer };
      });
      setPeers(newPeers);
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
      if (item) item.peer.destroy();

      peersRef.current = peersRef.current.filter(p => p.peerID !== userID);
      setPeers(users => users.filter(p => p.peerID !== userID));
    });
  };

  useEffect(() => {
    const getAvailableCameras = async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      return videoDevices;
    };

    getAvailableCameras().then(cameras => {
      if (cameras.length > 0) {
        videoDeviceIdRef.current = cameras[0].deviceId;
        startStream(cameras[0].deviceId);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [roomId]);

  const toggleMute = () => {
    const audioTracks = localStreamRef.current.getAudioTracks();
    audioTracks.forEach(track => track.enabled = isMuted);
    setIsMuted(!isMuted);
  };

  const toggleVideo = () => {
    const videoTracks = localStreamRef.current.getVideoTracks();
    videoTracks.forEach(track => track.enabled = isVideoOff);
    setIsVideoOff(!isVideoOff);
  };

  const switchCamera = async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');

    const nextCamera = videoDevices.find(
      (device) => device.deviceId !== videoDeviceIdRef.current
    );

    if (nextCamera) {
      // Stop current video tracks
      localStreamRef.current.getTracks().forEach(track => track.stop());

      // Start new stream with next camera
      videoDeviceIdRef.current = nextCamera.deviceId;
      startStream(nextCamera.deviceId);
      setIsFrontCamera(!isFrontCamera);
    }
  };

  return (
    <div className="room-container">
      <div className="video-grid">
        <video ref={localVideoRef} autoPlay muted playsInline className="video" />
        {peers.map(({ peerID, peer }) => (
          <Video key={peerID} peer={peer} />
        ))}
      </div>

      <div className="controls">
        <button onClick={toggleMute}>
          {isMuted ? "Unmute" : "Mute"}
        </button>
        <button onClick={toggleVideo}>
          {isVideoOff ? "Start Video" : "Stop Video"}
        </button>
        <button onClick={switchCamera}>
          {isFrontCamera ? "Switch to Back Camera" : "Switch to Front Camera"}
        </button>
      </div>
    </div>
  );
}

function Video({ peer }) {
  const ref = useRef();

  useEffect(() => {
    peer.on("stream", stream => {
      if (ref.current) {
        ref.current.srcObject = stream;
      }
    });
  }, [peer]);

  return <video ref={ref} autoPlay playsInline className="video" />;
}

export default Room;
