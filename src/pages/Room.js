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
  const videoDeviceIdRef = useRef();

  const ROOM_ID = window.location.pathname.split("/")[2]; // /room/:id

  useEffect(() => {
    const init = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === "videoinput");

      if (videoDevices.length > 0) {
        videoDeviceIdRef.current = videoDevices[0].deviceId;
      }

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      socketRef.current = io("https://video-call-server-lzaj.onrender.com"); // your backend URL

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

  const switchCamera = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');

      if (videoDevices.length < 2) {
        console.warn("Only one camera available.");
        return;
      }

      const currentId = videoDeviceIdRef.current;
      const nextDevice = videoDevices.find(d => d.deviceId !== currentId) || videoDevices[0];

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: nextDevice.deviceId } },
        audio: false,
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];

      localStreamRef.current.removeTrack(oldVideoTrack);
      localStreamRef.current.addTrack(newVideoTrack);

      peersRef.current.forEach(({ peer }) => {
        const sender = peer._pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(newVideoTrack);
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
        localVideoRef.current.srcObject = localStreamRef.current;
      }

      oldVideoTrack.stop();
      videoDeviceIdRef.current = nextDevice.deviceId;
      setIsFrontCamera(prev => !prev);
      console.log("✅ Switched to:", nextDevice.label);
    } catch (err) {
      console.error("❌ Error switching camera:", err);
      alert("Camera switch failed: " + err.message);
    }
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
