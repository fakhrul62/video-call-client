import React, { useEffect, useRef, useState } from "react";
import SimplePeer from "simple-peer";
import io from "socket.io-client";

const Room = () => {
  const [myID, setMyID] = useState("");
  const [peers, setPeers] = useState([]);
  const [isFrontCamera, setIsFrontCamera] = useState(true);

  const socketRef = useRef();
  const localVideoRef = useRef();
  const localStreamRef = useRef();
  const peersRef = useRef([]);

  const ROOM_ID = window.location.pathname.split("/")[2];

  useEffect(() => {
    const init = async () => {
      const stream = await startStream(isFrontCamera);
      localStreamRef.current = stream;
      localVideoRef.current.srcObject = stream;

      socketRef.current = io("https://video-call-server-lzaj.onrender.com");

      socketRef.current.on("connect", () => {
        setMyID(socketRef.current.id);
        socketRef.current.emit("join", ROOM_ID);
      });

      socketRef.current.on("all-users", (users) => {
        const newPeers = [];
        users.forEach(userID => {
          const peer = createPeer(userID, socketRef.current.id, stream);
          peersRef.current.push({ peerID: userID, peer });
          newPeers.push({ peerID: userID, peer });
        });
        setPeers(newPeers);
      });

      socketRef.current.on("user-joined", userID => {
        const peer = addPeer(userID, stream);
        peersRef.current.push({ peerID: userID, peer });
        setPeers(prev => [...prev, { peerID: userID, peer }]);
      });

      socketRef.current.on("signal", ({ from, signal }) => {
        const item = peersRef.current.find(p => p.peerID === from);
        if (item) item.peer.signal(signal);
      });

      socketRef.current.on("user-disconnected", userID => {
        const item = peersRef.current.find(p => p.peerID === userID);
        if (item) {
          item.peer.destroy();
          peersRef.current = peersRef.current.filter(p => p.peerID !== userID);
          setPeers(prev => prev.filter(p => p.peerID !== userID));
        }
      });
    };

    init();
  }, []);

  const startStream = async (useFront = true) => {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: useFront ? "user" : "environment" },
      audio: true,
    });
  };

  const switchCamera = async () => {
    try {
      const newStream = await startStream(!isFrontCamera);
      const newVideoTrack = newStream.getVideoTracks()[0];
      const oldStream = localStreamRef.current;
      const oldVideoTrack = oldStream.getVideoTracks()[0];

      // Replace video track in local stream
      oldStream.removeTrack(oldVideoTrack);
      oldStream.addTrack(newVideoTrack);

      // Replace video track in each peer connection
      peersRef.current.forEach(({ peer }) => {
        const sender = peer._pc.getSenders().find(s => s.track?.kind === "video");
        if (sender) sender.replaceTrack(newVideoTrack);
      });

      // Update local video
      if (localVideoRef.current) {
        localVideoRef.current.pause();
        localVideoRef.current.srcObject = null;
        localVideoRef.current.srcObject = oldStream;
        localVideoRef.current.load();
        localVideoRef.current.play();
      }

      // Clean up old track
      oldVideoTrack.stop();
      localStreamRef.current = oldStream;
      setIsFrontCamera(prev => !prev);

      console.log("✅ Camera switched");
    } catch (err) {
      console.error("❌ Error switching camera:", err);
      alert("Failed to switch camera: " + err.message);
    }
  };

  const createPeer = (userToSignal, callerID, stream) => {
    const peer = new SimplePeer({
      initiator: true,
      trickle: false,
      stream,
    });

    peer.on("signal", signal => {
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

    peer.on("signal", signal => {
      socketRef.current.emit("signal", {
        to: incomingID,
        from: socketRef.current.id,
        signal,
      });
    });

    return peer;
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", padding: "20px" }}>
      <div>
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          style={{ width: "300px", borderRadius: "10px", background: "#000" }}
        />
        <p style={{ textAlign: "center" }}>You</p>
      </div>

      {peers.map(({ peerID, peer }) => (
        <Video key={peerID} peer={peer} />
      ))}

      <div style={{ position: "fixed", top: 10, right: 10 }}>
        <button onClick={switchCamera}>
          Switch to {isFrontCamera ? "Back" : "Front"} Camera
        </button>
      </div>
    </div>
  );
};

const Video = ({ peer }) => {
  const ref = useRef();

  useEffect(() => {
    peer.on("stream", stream => {
      if (ref.current) {
        ref.current.srcObject = stream;
      }
    });
  }, [peer]);

  return (
    <div>
      <video
        playsInline
        autoPlay
        ref={ref}
        style={{ width: "300px", borderRadius: "10px", background: "#000" }}
      />
    </div>
  );
};

export default Room;
