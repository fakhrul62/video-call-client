import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';

const socket = io("https://video-call-server-lzaj.onrender.com");

function Room() {
  const { roomId } = useParams();
  const [peers, setPeers] = useState([]);
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

  return (
    <div>
      <video ref={localVideoRef} autoPlay muted />
      {peers.map(({ peerID, peer }) => (
        <Video key={peerID} peer={peer} />
      ))}
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
