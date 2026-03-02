class SyncManager:
    def __init__(self):
        # Connected clients {sid: {"position": int}}
        self.clients = {}
        
        # State of the video playback
        self.playback_state = {
            "is_playing": False,
            "current_time": 0.0,
            "video_id": None,
            "grid_rows": 2,
            "grid_cols": 3,
            "master_audio_position": 1,
            "bezel_x": 0,
            "bezel_y": 0,
            "playlist": [],
            "playlist_index": 0,
            "loop_playlist": False,
        }
        
        # Track which clients have buffered and are ready
        self.ready_clients = set()
        
    def add_client(self, sid, position=None):
        self.clients[sid] = {"position": position}
        
    def remove_client(self, sid):
        if sid in self.clients:
            del self.clients[sid]
        if sid in self.ready_clients:
            self.ready_clients.remove(sid)
            
    def assign_position(self, sid, position):
        if sid in self.clients:
            self.clients[sid]["position"] = position
            
    def get_client_count(self):
        return len(self.clients)
        
    def get_connected_positions(self):
        return [client["position"] for client in self.clients.values() if client["position"]]
        
    def set_ready(self, sid):
        self.ready_clients.add(sid)
        
    def all_ready(self, required_count=6):
        return len(self.ready_clients) >= required_count
        
    def clear_ready_state(self):
        self.ready_clients.clear()

sync_manager = SyncManager()
