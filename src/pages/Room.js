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
  const peersRef = useRef([]);
  const localVideoRef = useRef();
  const localStreamRef = useRef();

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
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
        <button className="control-btn" onClick={toggleMute}>{isMuted ? "Unmute" : "Mute"}</button>
        <button className="control-btn" onClick={toggleVideo}>{isVideoOff ? "Turn Video On" : "Turn Video Off"}</button>
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
