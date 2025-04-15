import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import SimplePeer from "simple-peer";
import "./App.css";

const socket = io("https://video-call-server-lzaj.onrender.com");



function App() {
  const [roomID] = useState("room1");
  const localVideo = useRef();
  const remoteVideo = useRef();
  const peerRef = useRef();
  console.log("Connected to socket:", socket.id);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
      localVideo.current.srcObject = stream;

      socket.emit("join", roomID);

      socket.on("user-joined", (id) => {
        const peer = createPeer(id, stream);
        peerRef.current = peer;
      });

      socket.on("signal", ({ from, signal }) => {
        if (!peerRef.current) {
          const peer = createPeer(from, stream, true);
          peerRef.current = peer;
        }
        peerRef.current.signal(signal);
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const createPeer = (id, stream, isReceiver = false) => {
    const peer = new SimplePeer({
      initiator: !isReceiver,
      trickle: false,
      stream,
    });

    peer.on("signal", (signal) => {
      socket.emit("signal", { signal, roomID, to: id });
    });

    peer.on("stream", (remoteStream) => {
      remoteVideo.current.srcObject = remoteStream;
    });

    return peer;
  };

  return (
    <div className="App">
      <h2>Free Video Call</h2>
      <video ref={localVideo} autoPlay muted playsInline />
      <video ref={remoteVideo} autoPlay playsInline />
    </div>
  );
}

export default App;
