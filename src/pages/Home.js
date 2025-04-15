import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Home() {
  const [roomId, setRoomId] = useState('');
  const navigate = useNavigate();

  const handleJoin = () => {
    if (roomId.trim()) {
      navigate(`/room/${roomId}`);
    }
  };

  return (
    <div style={{ textAlign: 'center', marginTop: 100 }}>
      <h1>Enter Room ID</h1>
      <input
        type="text"
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
        placeholder="e.g. abc123"
      />
      <button onClick={handleJoin}>Join Room</button>
    </div>
  );
}

export default Home;
