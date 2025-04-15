import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Users } from 'lucide-react';

function Home() {
  const [roomId, setRoomId] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const navigate = useNavigate();

  const handleJoin = () => {
    if (roomId.trim()) {
      navigate(`/room/${roomId}`);
    }
  };

  const createNewRoom = () => {
    // Generate a random room ID
    const newRoomId = Math.random().toString(36).substring(2, 8);
    setRoomId(newRoomId);
    setIsCreatingRoom(true);
    
    // Add small delay to show the generated room ID before navigating
    setTimeout(() => {
      navigate(`/room/${newRoomId}`);
    }, 1000);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleJoin();
    }
  };

  return (
    <div className="home-container">
      <div className="app-logo">
        <Video size={80} color="#4a6cfa" strokeWidth={1.5} />
      </div>
      
      <div className="home-card">
        <h1 className="home-title">Join Video Meeting</h1>
        
        <input
          type="text"
          className="room-input"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter room code"
          disabled={isCreatingRoom}
        />
        
        <button 
          className="join-btn" 
          onClick={handleJoin}
          disabled={!roomId.trim() || isCreatingRoom}
        >
          {isCreatingRoom ? 'Creating Room...' : (
            <>
              <Users size={16} style={{ marginRight: '8px' }} />
              Join Meeting
            </>
          )}
        </button>
        
        <div className="create-room">
          <span>Don't have a code? </span>
          <button 
            className="create-room-btn"
            onClick={createNewRoom}
            disabled={isCreatingRoom}
          >
            Create new meeting
          </button>
        </div>
      </div>
    </div>
  );
}

export default Home;