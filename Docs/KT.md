# 3x2 Multi-PC Video Wall - Knowledge Transfer (KT) Document

This document provides a comprehensive overview of the Multi-PC Video Wall project, covering architecture, setup, core mechanisms, advanced features, and troubleshooting. It serves to transition the knowledge of the system over to the development and operations team.

---

## 1. System Architecture

The core of the system is designed to stream a single video source (or screen broadcast) across a matrix of multiple physical PCs (e.g., a 3x2 display grid) perfectly synchronized over a Local Area Network (LAN).

### 1.1 Backend (FastAPI)
- **Framework**: Python 3 with `FastAPI` and `uvicorn`.
- **Signaling & Sync**: `python-socketio` is used to maintain real-time bidirectional WebSocket connections with all clients and the admin. It coordinates play, pause, seek, and loop instructions to ensure all screens act as one.
- **Video Processing**: Uses `FFmpeg` to physically split uploaded videos. A single video is sliced into $N \times M$ separate crops. Each crop is transcoded into an HLS (HTTP Live Streaming) format (`.m3u8` playlists and `.ts` transport stream files).
- **Core Files**:
  - `main.py`: Entry point, Socket.IO event handlers, FastAPI routes.
  - `sync_manager.py`: In-memory state tracking (connected clients, active video, playlist queue, master audio selection, bezel dimensions).
  - `video_processor.py`: Asynchronous FFmpeg spawning logic for slicing and transcoding.

### 1.2 Frontend (React + Vite)
- **Framework**: `React 18` bundled with `Vite`.
- **Admin Dashboard** (`/admin`): The control center. Handles uploading videos, triggering playback states, defining grid dimensions (N x M), handling the playlist queue, configuring Master Audio, Bezels, and capturing the local screen for WebRTC broadcasting.
- **Client Player** (`/client/:position`): The headless display node. Automatically determines its grid position from the URL (e.g., `/client/2` for top-center). Connects via WebSockets to listen to sync commands. Uses `hls.js` for video playback and standard HTML5 WebRTC for receiving screen broadcasts.

---

## 2. Advanced Features (Phase 8 Additions)

### 2.1 Dynamic Grid Configuration (N x M)
The grid size is no longer hardcoded to 3x2. The Admin can define rows and columns before uploading a video or sharing the screen.
- **FFmpeg impact**: The backend dynamically divides the original video width by `cols` and height by `rows` to map each grid position to a specific crop filter.
- **WebRTC impact**: The frontend React client dynamically calculates its CSS `width: (cols * 100)vw` and `height: (rows * 100)vh` and applies negative margins based on its grid position modulo math.

### 2.2 Software Bezel Compensation
To create the illusion of a single continuous screen behind physical monitor bezels, the software drops the pixels masked by the plastic edges.
- **FFmpeg impact**: The backend computes a "virtual" resolution (`original_width + (cols - 1) * bezel_x`), scales the video to that virtual size, and then extracts crops that skip the designated bezel pixels.
- **WebRTC impact**: CSS `calc()` functions are applied, extending the total width/height of the broadcast stream by the bezel amounts and offsetting the negative `left`/`top` properties.

### 2.3 Master Audio Management
To prevent an unbearable echo of 6 computers playing audio simultaneously, the Audio Management feature allows the Admin to define one specific Grid Position as the "Master Audio Node".
- Validated via React's `muted={posInt !== masterAudioId}` on the `ClientPlayer`.
- *Note: Due to browser autoplay policies, the physical computer acting as the Master Audio node will present an overlay requiring a single mouse click to enable audio playback.*

### 2.4 Playlist & Queuing
Multiple videos can be stacked sequentially. 
- When a video ends, the physical PC assigned as the Master Audio Node uniquely pings the server `client_video_ended`.
- The server checks the state, increments the playlist index (or loops to 0 if "Loop Playlist" is checked), and broadcasts `video_ready` to start the next clip.

### 2.5 Screen Broadcasting (WebRTC)
A low-latency, real-time mirror of the Admin's screen can be thrown onto the video wall.
- **Signaling**: The Socket.IO server acts as a WebRTC signaling server, relaying `Offer`, `Answer`, and `ICE Candidates` between the Admin and the 6 displays.
- **Topology**: Uses a Star Topology (1-to-N). The Admin machine creates a dedicated `RTCPeerConnection` for each connected client. The clients receive the full stream, but use CSS to mask everything except their specific grid quadrant.

---

## 3. Setup and Deployment

### 3.1 Network Requirements
- A gigabit LAN switch connects all 6 Client PCs and the Server.
- Static IPs are highly recommended.
- The Server firewall must allow incoming connections on port `8000` (FastAPI) and `5160` (Vite, if running the developer server). 
- *Crucial for WebRTC*: The frontend Vite dev server is configured with `@vitejs/plugin-basic-ssl` to serve HTTPS. Modern browsers strictly block `navigator.mediaDevices.getDisplayMedia` (screen capture) unless the site is served over HTTPS or `localhost`. 

### 3.2 Starting the System

**Terminal 1 (Backend)**:
```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
# Ensure FFmpeg is installed and added to SYSTEM PATH
uvicorn main:app --host 0.0.0.0 --port 8000
```

**Terminal 2 (Frontend)**:
```bash
cd client
npm install
# Start HTTPS DEV SERVER
npm run dev -- --host 0.0.0.0 --port 5160
```

**Client PC Setup**:
On each of the 6 physical PCs, open a modern browser (Chrome/Edge) to:
`https://<server_ip>:5160/client/X` (where X is 1 through 6). Accept the self-signed HTTPS certificate warning.

**Admin PC Setup**:
Navigate to: `https://<server_ip>:5160/admin`.

---

## 4. Troubleshooting Guide

- **Error: "Upload Failed" or "Processing Failed"**: 
  - Verify FFmpeg is installed globally on the server. Run `ffmpeg -version` in the backend terminal.
- **Issue: Audio isn't playing on the Master Node**: 
  - Browsers block autoplaying unmuted video. You must physically click the screen of the Master Audio Node once to unlock the browser's audio permissions.
- **Issue: WebRTC "Share Screen" button throws an error or does nothing**:
  - The admin dashboard must be accessed over `https://` (except on localhost). Check your URL bar.
- **Issue: Videos play out of sync / buffer frequently**:
  - Ensure all clients are hardwired to the network (no Wi-Fi). HLS generation requires fast storage on the server (SSD).
- **Issue: Single video refuses to Loop**:
  - This has been patched via an immediate `sync_seek` to 0. If it reoccurs, ensure the Master Audio client isn't disconnecting mid-playback.
