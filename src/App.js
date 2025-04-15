import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const socket = io("https://video-call-server-lzaj.onrender.com");

const App = () => {
  const [stream, setStream] = useState(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerRef = useRef(null);
  const mySocketId = useRef(null);

  useEffect(() => {
    // Get User Media (camera and microphone)
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((userStream) => {
        setStream(userStream);
        localVideoRef.current.srcObject = userStream;
      })
      .catch((error) => {
        console.error("Error getting media:", error);
      });

    // Socket.IO event when another user joins
    socket.on('user-joined', (id) => {
      console.log("A new user joined with ID:", id);
      mySocketId.current = id;

      // Create peer connection when new user joins
      const peer = createPeer(id, stream);
      peerRef.current = peer;
    });

    // Handle signaling from other peer (when offer/answer is received)
    socket.on('signal', ({ from, signal }) => {
      if (from !== mySocketId.current) {
        peerRef.current.signal(signal);
      }
    });

    // Clean up on unmount
    return () => {
      socket.off('user-joined');
      socket.off('signal');
    };
  }, [stream]);

  const createPeer = (id, userStream) => {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream: userStream,
    });

    peer.on('signal', (signalData) => {
      socket.emit('signal', { to: id, signal: signalData });
    });

    peer.on('stream', (remoteStream) => {
      console.log('Received remote stream');
      remoteVideoRef.current.srcObject = remoteStream;
    });

    return peer;
  };

  return (
    <div>
      <video ref={localVideoRef} autoPlay muted />
      <video ref={remoteVideoRef} autoPlay />
    </div>
  );
};

export default App;
