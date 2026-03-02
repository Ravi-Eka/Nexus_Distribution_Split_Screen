import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import Hls from 'hls.js';
import { useSocket } from '../hooks/useSocket';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:8000';

function ClientPlayer() {
    const { position } = useParams();
    const videoRef = useRef(null);
    const hlsRef = useRef(null);
    const screenShareVideoRef = useRef(null);
    const peerConnectionRef = useRef(null);
    const { socket, isConnected } = useSocket();
    const [videoId, setVideoId] = useState(null);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [gridRows, setGridRows] = useState(2);
    const [gridCols, setGridCols] = useState(3);
    const [masterAudioId, setMasterAudioId] = useState(1);
    const [hasInteracted, setHasInteracted] = useState(false);
    const [bezelX, setBezelX] = useState(0);
    const [bezelY, setBezelY] = useState(0);

    // Position parsed to int
    const posInt = parseInt(position, 10);

    useEffect(() => {
        if (!socket || !isConnected) return;

        socket.emit('register_client', { position: posInt });

        socket.on('video_ready', (data) => {
            setVideoId(data.video_id);
        });

        socket.on('client_state', (state) => {
            if (state.video_id) setVideoId(state.video_id);
            if (state.grid_rows) setGridRows(state.grid_rows);
            if (state.grid_cols) setGridCols(state.grid_cols);
            if (state.master_audio_position !== undefined) setMasterAudioId(state.master_audio_position);
            if (state.bezel_x !== undefined) setBezelX(state.bezel_x);
            if (state.bezel_y !== undefined) setBezelY(state.bezel_y);
        });

        return () => {
            socket.off('video_ready');
            socket.off('client_state');
        };
    }, [socket, isConnected, posInt]);

    useEffect(() => {
        if (!videoId || !videoRef.current) return;

        const streamUrl = `${SERVER_URL}/static/hls/${videoId}_${posInt}/playlist.m3u8`;

        // Setup HLS.js
        if (Hls.isSupported()) {
            if (hlsRef.current) hlsRef.current.destroy();

            const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
            });

            hlsRef.current = hls;
            hls.loadSource(streamUrl);
            hls.attachMedia(videoRef.current);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                console.log("Manifest parsed, ready to play");
                // Tell server we are ready
                setTimeout(() => {
                    socket?.emit('client_ready');
                }, 500);
            });
        } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
            // Native Safari support
            videoRef.current.src = streamUrl;
            videoRef.current.addEventListener('loadedmetadata', () => {
                socket?.emit('client_ready');
            });
        }

        const handleInteraction = () => setHasInteracted(true);
        document.addEventListener('click', handleInteraction);

        // Notify server when video finishes playing
        const handleEnded = () => {
            if (socket && socket.connected) {
                socket.emit('client_video_ended');
            }
        };
        const videoEl = videoRef.current;
        if (videoEl) {
            videoEl.addEventListener('ended', handleEnded);
        }

        return () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
            }
            document.removeEventListener('click', handleInteraction);
            if (videoEl) {
                videoEl.removeEventListener('ended', handleEnded);
            }
        };
    }, [videoId, posInt, socket]);

    // Handle Sync Commands
    useEffect(() => {
        if (!socket || !videoRef.current) return;

        const onPlay = (data) => {
            if (data.time !== undefined) videoRef.current.currentTime = data.time;
            videoRef.current.play().catch(console.error);
        };

        const onPause = (data) => {
            videoRef.current.pause();
            if (data.time !== undefined) videoRef.current.currentTime = data.time;
        };

        const onSeek = (data) => {
            if (data.time !== undefined) {
                videoRef.current.currentTime = data.time;
            }
        };

        const onStop = () => {
            videoRef.current.pause();
            videoRef.current.currentTime = 0;
        };

        socket.on('sync_play', onPlay);
        socket.on('sync_pause', onPause);
        socket.on('sync_seek', onSeek);
        socket.on('sync_stop', onStop);

        return () => {
            socket.off('sync_play', onPlay);
            socket.off('sync_pause', onPause);
            socket.off('sync_seek', onSeek);
            socket.off('sync_stop', onStop);
        };
    }, [socket]);

    // WebRTC Screen Share Receiver Sync
    useEffect(() => {
        if (!socket) return;

        const handleOffer = async (data) => {
            console.log('Received screen share offer');
            setIsScreenSharing(true);

            const pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            peerConnectionRef.current = pc;

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('screen_share_ice_candidate', {
                        candidate: event.candidate,
                        admin_sid: data.admin_sid
                    });
                }
            };

            pc.ontrack = (event) => {
                if (screenShareVideoRef.current) {
                    screenShareVideoRef.current.srcObject = event.streams[0];
                }
            };

            try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                socket.emit('screen_share_answer', {
                    answer: answer,
                    admin_sid: data.admin_sid
                });
            } catch (err) {
                console.error("Error setting up WebRTC receiver:", err);
            }
        };

        const handleIceCandidate = async (data) => {
            if (peerConnectionRef.current && data.candidate) {
                try {
                    await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (e) {
                    console.error("Error adding received ice candidate", e);
                }
            }
        };

        const handleStop = () => {
            setIsScreenSharing(false);
            if (peerConnectionRef.current) {
                peerConnectionRef.current.close();
                peerConnectionRef.current = null;
            }
            if (screenShareVideoRef.current) {
                screenShareVideoRef.current.srcObject = null;
            }
        };

        socket.on('screen_share_offer', handleOffer);
        socket.on('screen_share_ice_candidate', handleIceCandidate);
        socket.on('screen_share_stop', handleStop);

        return () => {
            socket.off('screen_share_offer', handleOffer);
            socket.off('screen_share_ice_candidate', handleIceCandidate);
            socket.off('screen_share_stop', handleStop);
        };
    }, [socket]);

    const getScreenShareStyle = () => {
        const col = (posInt - 1) % gridCols;
        const row = Math.floor((posInt - 1) / gridCols);
        return {
            position: 'absolute',
            width: `calc(${gridCols * 100}vw + ${(gridCols - 1) * bezelX}px)`,
            height: `calc(${gridRows * 100}vh + ${(gridRows - 1) * bezelY}px)`,
            left: `calc(-${col * 100}vw - ${col * bezelX}px)`,
            top: `calc(-${row * 100}vh - ${row * bezelY}px)`,
            objectFit: 'fill',
            zIndex: 10,
            display: isScreenSharing ? 'block' : 'none'
        };
    };

    return (
        <div className="client-player-container" onClick={() => setHasInteracted(true)}>
            {!hasInteracted && posInt === masterAudioId && !isScreenSharing && (
                <div style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(0,0,0,0.8)', padding: '10px 20px', borderRadius: '8px', zIndex: 999 }}>
                    Click anywhere to enable Master Audio
                </div>
            )}

            {!videoId && !isScreenSharing && (
                <div style={{ color: 'white', textAlign: 'center' }}>
                    <h2>Position {position} connected.</h2>
                    <p>Waiting for video from server...</p>
                </div>
            )}

            <video
                ref={videoRef}
                className="client-video"
                playsInline
                muted={posInt !== masterAudioId} // Master audio plays sound, others muted
                style={{ display: videoId && !isScreenSharing ? 'block' : 'none' }}
            />

            {/* Screen Share Video Overlay */}
            <video
                ref={screenShareVideoRef}
                autoPlay
                playsInline
                muted
                style={getScreenShareStyle()}
            />
        </div>
    );
}

export default ClientPlayer;
