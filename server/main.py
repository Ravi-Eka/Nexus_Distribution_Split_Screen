import os
import shutil
import uuid
from typing import List

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import socketio

from video_processor import processor, UPLOAD_DIR, HLS_DIR
from sync_manager import sync_manager

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static HLS files
app.mount("/static", StaticFiles(directory=str(HLS_DIR.parent)), name="static")

# Initialize Socket.IO server
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
app.mount("/socket.io", socket_app)

@app.get("/")
def read_root():
    return {"message": "3x2 Video Wall Server is running"}

@app.post("/api/upload")
async def upload_video(
    file: UploadFile = File(...),
    rows: int = Form(2),
    cols: int = Form(3),
    bezel_x: int = Form(0),
    bezel_y: int = Form(0)
):
    """Uploads a video and starts processing it into N x M segments."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
        
    video_id = str(uuid.uuid4())
    file_ext = os.path.splitext(file.filename)[1]
    video_path = UPLOAD_DIR / f"{video_id}{file_ext}"
    
    # Save the uploaded file
    with open(video_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Process video (this might take a while, normally done via background task)
    try:
        await processor.process_video(video_id, str(video_path), rows, cols, bezel_x, bezel_y)
        
        video_item = {"id": video_id, "name": file.filename}
        sync_manager.playback_state["playlist"].append(video_item)
        
        sync_manager.playback_state["grid_rows"] = rows
        sync_manager.playback_state["grid_cols"] = cols
        sync_manager.playback_state["bezel_x"] = bezel_x
        sync_manager.playback_state["bezel_y"] = bezel_y

        if len(sync_manager.playback_state["playlist"]) == 1:
            sync_manager.playback_state["video_id"] = video_id
            sync_manager.playback_state["playlist_index"] = 0

            await sio.emit("video_ready", {
                "video_id": video_id,
                "grid_rows": rows,
                "grid_cols": cols,
                "bezel_x": bezel_x,
                "bezel_y": bezel_y
            })
        else:
            await sio.emit("client_state", sync_manager.playback_state)
        
        return {"status": "success", "video_id": video_id, "rows": rows, "cols": cols}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@app.get("/api/clients")
def get_clients():
    """Returns the list of currently connected client positions."""
    return {"connected_positions": sync_manager.get_connected_positions()}

# ----- Socket.IO Events ----- #

@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")
    sync_manager.add_client(sid)
    await sio.emit("client_state", sync_manager.playback_state, room=sid)

@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")
    sync_manager.remove_client(sid)
    # Broadcast updated client list to admin
    await sio.emit("clients_updated", sync_manager.get_connected_positions())

@sio.event
async def register_client(sid, data):
    """Client registers its position (1-6)."""
    position = data.get("position")
    if position:
        sync_manager.assign_position(sid, position)
        print(f"Client {sid} registered as position {position}")
        await sio.emit("clients_updated", sync_manager.get_connected_positions())

@sio.event
async def client_ready(sid, data):
    """Client indicates it has buffered the video and is ready to play."""
    sync_manager.set_ready(sid)
    print(f"Client {sid} is ready. Total ready: {len(sync_manager.ready_clients)}")
    
    # Optional: auto-play if all 6 are ready
    # if sync_manager.all_ready(6):
    #     await sio.emit("play", {"time": 0})

@sio.event
async def admin_play(sid, data):
    """Admin sends play command."""
    time_to_play = data.get("time", 0)
    sync_manager.playback_state["is_playing"] = True
    sync_manager.playback_state["current_time"] = time_to_play
    await sio.emit("sync_play", {"time": time_to_play})

@sio.event
async def admin_pause(sid, data):
    """Admin sends pause command."""
    current_time = data.get("time", 0)
    sync_manager.playback_state["is_playing"] = False
    sync_manager.playback_state["current_time"] = current_time
    await sio.emit("sync_pause", {"time": current_time})

@sio.event
async def admin_seek(sid, data):
    """Admin sends seek command."""
    seek_time = data.get("time", 0)
    sync_manager.playback_state["current_time"] = seek_time
    await sio.emit("sync_seek", {"time": seek_time})

@sio.event
async def set_master_audio(sid, data):
    """Admin sets the master audio position to prevent multi-device echo."""
    position = data.get("position", 1)
    sync_manager.playback_state["master_audio_position"] = position
    await sio.emit("client_state", sync_manager.playback_state)

@sio.event
async def update_grid_settings(sid, data):
    """Admin updates grid and bezel settings without uploading a video."""
    sync_manager.playback_state["grid_rows"] = data.get("rows", 2)
    sync_manager.playback_state["grid_cols"] = data.get("cols", 3)
    sync_manager.playback_state["bezel_x"] = data.get("bezel_x", 0)
    sync_manager.playback_state["bezel_y"] = data.get("bezel_y", 0)
    await sio.emit("client_state", sync_manager.playback_state)

@sio.event
async def play_playlist_index(sid, data):
    """Admin selects a specific video from the playlist."""
    index = data.get("index", 0)
    playlist = sync_manager.playback_state["playlist"]
    if 0 <= index < len(playlist):
        sync_manager.playback_state["playlist_index"] = index
        sync_manager.playback_state["video_id"] = playlist[index]["id"]
        sync_manager.playback_state["current_time"] = 0
        sync_manager.playback_state["is_playing"] = False
        await sio.emit("client_state", sync_manager.playback_state)
        await sio.emit("video_ready", {
            "video_id": playlist[index]["id"],
            "grid_rows": sync_manager.playback_state["grid_rows"],
            "grid_cols": sync_manager.playback_state["grid_cols"],
            "bezel_x": sync_manager.playback_state["bezel_x"],
            "bezel_y": sync_manager.playback_state["bezel_y"]
        })

@sio.event
async def set_looping(sid, data):
    """Admin toggles playlist looping."""
    sync_manager.playback_state["loop_playlist"] = data.get("loop", False)
    await sio.emit("client_state", sync_manager.playback_state)

@sio.event
async def client_video_ended(sid):
    """Client reports their video ended. Master audio client triggers next item in playlist."""
    client_pos = sync_manager.clients.get(sid, {}).get("position")
    master_pos = sync_manager.playback_state.get("master_audio_position", 1)
    
    if client_pos == master_pos:
        playlist = sync_manager.playback_state["playlist"]
        idx = sync_manager.playback_state["playlist_index"]
        loop = sync_manager.playback_state["loop_playlist"]
        
        next_idx = -1
        if idx + 1 < len(playlist):
            next_idx = idx + 1
        elif loop and len(playlist) > 0:
            next_idx = 0
            
        if next_idx != -1:
            if next_idx == idx:
                # Looping the exact same video. Just seek to 0 and ensure playing.
                sync_manager.playback_state["current_time"] = 0
                sync_manager.playback_state["is_playing"] = True
                await sio.emit("client_state", sync_manager.playback_state)
                await sio.emit("sync_seek", {"time": 0})
                await sio.emit("sync_play", {"time": 0})
            else:
                # Moving to a new video in the playlist
                sync_manager.playback_state["playlist_index"] = next_idx
                sync_manager.playback_state["video_id"] = playlist[next_idx]["id"]
                sync_manager.playback_state["current_time"] = 0
                sync_manager.playback_state["is_playing"] = False
                sync_manager.clear_ready_state()
                
                await sio.emit("client_state", sync_manager.playback_state)
                await sio.emit("video_ready", {
                    "video_id": playlist[next_idx]["id"],
                    "grid_rows": sync_manager.playback_state["grid_rows"],
                    "grid_cols": sync_manager.playback_state["grid_cols"],
                    "bezel_x": sync_manager.playback_state["bezel_x"],
                    "bezel_y": sync_manager.playback_state["bezel_y"]
                })

@sio.event
async def admin_stop(sid, data):
    """Admin sends stop command."""
    sync_manager.playback_state["is_playing"] = False
    sync_manager.playback_state["current_time"] = 0
    await sio.emit("sync_stop")

# ----- WebRTC Signaling for Screen Share ----- #

def get_sid_by_position(position):
    for client_sid, data in sync_manager.clients.items():
        if data.get("position") == position:
            return client_sid
    return None

@sio.event
async def screen_share_offer(sid, data):
    """Admin sends WebRTC offer to a specific client position."""
    position = data.get("target_position")
    offer = data.get("offer")
    target_sid = get_sid_by_position(position)
    
    if target_sid:
        await sio.emit("screen_share_offer", {
            "offer": offer,
            "admin_sid": sid
        }, room=target_sid)

@sio.event
async def screen_share_answer(sid, data):
    """Client sends WebRTC answer back to the admin."""
    admin_sid = data.get("admin_sid")
    answer = data.get("answer")
    position = sync_manager.clients.get(sid, {}).get("position")
    
    if admin_sid:
        await sio.emit("screen_share_answer", {
            "answer": answer,
            "client_position": position
        }, room=admin_sid)

@sio.event
async def screen_share_ice_candidate(sid, data):
    """Relay ICE candidates between admin and client."""
    candidate = data.get("candidate")
    
    # Determine target based on what is provided
    target_sid = None
    if "target_position" in data:
        target_sid = get_sid_by_position(data["target_position"])
    elif "admin_sid" in data:
        target_sid = data["admin_sid"]

    if target_sid:
        await sio.emit("screen_share_ice_candidate", {
            "candidate": candidate,
            "sender_sid": sid,
            "position": sync_manager.clients.get(sid, {}).get("position")
        }, room=target_sid)

@sio.event
async def screen_share_stop(sid, data):
    """Admin stops screen sharing. Broadcast to everyone."""
    await sio.emit("screen_share_stop")
