import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../hooks/useSocket';
import { motion } from 'framer-motion';
import {
    LayoutDashboard, CheckSquare, Activity, Users, Settings,
    UploadCloud, Play, Pause, Square, RotateCcw, MonitorUp,
    MonitorOff, LayoutGrid, MonitorSpeaker, ListVideo, Share2, Search,
    Bell, MoreVertical, Plus, Video, PhoneOff, Mic, MicOff
} from 'lucide-react';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:8000';

function AdminDashboard() {
    const { socket, isConnected } = useSocket();
    const [clients, setClients] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [loadingMsg, setLoadingMsg] = useState('');
    const [videoId, setVideoId] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isSharing, setIsSharing] = useState(false);
    const [gridRows, setGridRows] = useState(2);
    const [gridCols, setGridCols] = useState(3);
    const [masterAudioId, setMasterAudioId] = useState(1);
    const [bezelX, setBezelX] = useState(0);
    const [bezelY, setBezelY] = useState(0);
    const [playlist, setPlaylist] = useState([]);
    const [playlistIndex, setPlaylistIndex] = useState(0);
    const [loopPlaylist, setLoopPlaylist] = useState(false);
    const [activeTab, setActiveTab] = useState('topology');
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);

    const fileInputRef = useRef(null);
    const localVideoRef = useRef(null);
    const peerConnectionsRef = useRef({});

    useEffect(() => {
        if (!socket) return;
        socket.on('clients_updated', (positions) => setClients(positions));
        socket.on('video_ready', (data) => {
            setUploading(false);
            setLoadingMsg('');
            setVideoId(data.video_id);
        });
        socket.on('client_state', (state) => {
            setIsPlaying(state.is_playing);
            if (state.video_id) setVideoId(state.video_id);
            if (state.grid_rows) setGridRows(state.grid_rows);
            if (state.grid_cols) setGridCols(state.grid_cols);
            if (state.master_audio_position !== undefined) setMasterAudioId(state.master_audio_position);
            if (state.bezel_x !== undefined) setBezelX(state.bezel_x);
            if (state.bezel_y !== undefined) setBezelY(state.bezel_y);
            if (state.playlist !== undefined) setPlaylist(state.playlist);
            if (state.playlist_index !== undefined) setPlaylistIndex(state.playlist_index);
            if (state.loop_playlist !== undefined) setLoopPlaylist(state.loop_playlist);
        });
        socket.on('screen_share_answer', async (data) => {
            const pc = peerConnectionsRef.current[data.client_position];
            if (pc && data.answer) {
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            }
        });
        socket.on('screen_share_ice_candidate', async (data) => {
            const pc = peerConnectionsRef.current[data.position];
            if (pc && data.candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        });

        return () => {
            socket.off('clients_updated');
            socket.off('video_ready');
            socket.off('client_state');
            socket.off('screen_share_answer');
            socket.off('screen_share_ice_candidate');
        };
    }, [socket]);

    useEffect(() => {
        fetch(`${SERVER_URL}/api/clients`)
            .then(r => r.json())
            .then(data => setClients(data.connected_positions))
            .catch(console.error);
    }, []);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        setLoadingMsg('Processing video grid...');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('rows', gridRows);
        formData.append('cols', gridCols);
        formData.append('bezel_x', bezelX);
        formData.append('bezel_y', bezelY);

        try {
            const res = await fetch(`${SERVER_URL}/api/upload`, { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail);
        } catch (err) {
            console.error(err);
            setUploading(false);
            setLoadingMsg(`Error: ${err.message}`);
        }
    };

    const command = (cmd, data = {}) => {
        if (socket && isConnected) {
            socket.emit(cmd, data);
            if (cmd === 'admin_play') setIsPlaying(true);
            if (cmd === 'admin_pause' || cmd === 'admin_stop') setIsPlaying(false);
        }
    };

    const handleApplyGridSettings = () => {
        if (socket && isConnected) {
            socket.emit('update_grid_settings', { rows: gridRows, cols: gridCols, bezel_x: bezelX, bezel_y: bezelY });
        }
    };

    const startScreenShare = async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;
            setIsSharing(true);
            stream.getVideoTracks()[0].onended = () => stopScreenShare();

            const currentClients = [...clients];
            for (const pos of currentClients) {
                const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
                peerConnectionsRef.current[pos] = pc;
                stream.getTracks().forEach(track => pc.addTrack(track, stream));
                pc.onicecandidate = (e) => {
                    if (e.candidate) socket.emit('screen_share_ice_candidate', { candidate: e.candidate, target_position: pos });
                };
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('screen_share_offer', { target_position: pos, offer: offer });
            }
        } catch (err) {
            console.error("Error sharing screen", err);
        }
    };

    const stopScreenShare = () => {
        if (localVideoRef.current && localVideoRef.current.srcObject) {
            localVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
            localVideoRef.current.srcObject = null;
        }
        setIsSharing(false);
        socket.emit('screen_share_stop');
        Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
        peerConnectionsRef.current = {};
    };

    const Card = ({ children, className = "" }) => (
        <div className={`bg-white border border-gray-100 shadow-sm rounded-2xl p-6 ${className}`}>
            {children}
        </div>
    );

    return (
        <div className="flex min-h-screen bg-[#F7F7F9] font-sans">

            {/* Sidebar */}
            <aside className="w-[260px] bg-white border-r border-gray-100 flex-shrink-0 hidden md:flex flex-col">
                <div className="p-6">
                    <h1 className="text-xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
                        <div className="w-8 h-8 bg-gray-900 text-white rounded-lg flex items-center justify-center font-bold">N</div>
                        NexusCore
                    </h1>
                </div>

                <nav className="flex-1 px-4 space-y-1">
                    <button
                        onClick={() => setActiveTab('topology')}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${activeTab === 'topology' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                    >
                        <LayoutDashboard className="w-5 h-5" /> Topology Overview
                    </button>
                    <button
                        onClick={() => setActiveTab('media')}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${activeTab === 'media' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                    >
                        <ListVideo className="w-5 h-5" /> Media Distribution
                    </button>
                    <button
                        onClick={() => setActiveTab('live')}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${activeTab === 'live' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                    >
                        <Video className={`w-5 h-5 ${activeTab === 'live' ? 'animate-pulse' : ''}`} /> Live Broadcast
                        {isSharing && <span className="ml-auto w-2 h-2 rounded-full bg-red-400 animate-pulse" />}
                    </button>
                    <button
                        onClick={() => setActiveTab('analytics')}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${activeTab === 'analytics' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                    >
                        <Activity className="w-5 h-5" /> Analytics
                        <span className={`ml-auto py-0.5 px-2 rounded-full text-xs font-semibold ${activeTab === 'analytics' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}>2</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                    >
                        <Settings className="w-5 h-5" /> Settings
                    </button>
                </nav>

                <div className="p-4 border-t border-gray-100 relative mt-auto">
                    {showProfileMenu && (
                        <div className="absolute bottom-full left-4 mb-2 w-52 bg-white border border-gray-100 rounded-xl shadow-lg py-1 z-50 overflow-hidden">
                            <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Profile Settings</button>
                            <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Keyboard Shortcuts</button>
                            <div className="h-px bg-gray-100 my-1"></div>
                            <button className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Sign Out</button>
                        </div>
                    )}
                    <button
                        onClick={() => setShowProfileMenu(!showProfileMenu)}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors text-left"
                    >
                        <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden">
                            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Admin" alt="Avatar" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-gray-900 leading-tight">System Admin</span>
                            <span className="text-xs text-gray-500">Workspace Owner</span>
                        </div>
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col h-screen overflow-y-auto">

                {/* Topbar */}
                <header className="flex items-center justify-between px-8 py-5 bg-[#F7F7F9] sticky top-0 z-10">
                    <div className="relative w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search nodes or media..."
                            className="w-full pl-10 pr-4 py-2 border-none bg-white shadow-sm rounded-xl text-sm focus:ring-2 focus:ring-gray-900 outline-none transition-shadow"
                        />
                    </div>
                    <div className="flex items-center gap-4">
                        <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                            <Bell className="w-5 h-5" />
                        </button>
                        <div className={`px-3 py-1.5 rounded-full flex items-center gap-2 border ${isConnected ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'} text-xs font-semibold`}>
                            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                            {isConnected ? 'LIVE' : 'OFFLINE'}
                        </div>
                    </div>
                </header>

                {/* Dashboard Scroll Area */}
                <div className="p-8 max-w-7xl mx-auto w-full space-y-6">

                    {activeTab === 'topology' && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                            {/* Key Metrics Row */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <Card className="flex flex-col justify-between">
                                    <span className="text-sm font-medium text-gray-500 mb-4">Active Topology</span>
                                    <div className="flex items-end gap-3">
                                        <span className="text-4xl font-bold text-gray-900 tracking-tight">{gridCols}×{gridRows}</span>
                                        <span className="text-sm text-gray-500 mb-1">Grid Layout</span>
                                    </div>
                                </Card>
                                <Card className="flex flex-col justify-between">
                                    <span className="text-sm font-medium text-gray-500 mb-4">Master Audio Node</span>
                                    <div className="flex items-end gap-3">
                                        <span className="text-4xl font-bold text-gray-900 tracking-tight">#{String(masterAudioId).padStart(2, '0')}</span>
                                        <span className="text-sm text-gray-500 mb-1">Online</span>
                                    </div>
                                </Card>
                                <Card className="flex flex-col justify-between">
                                    <span className="text-sm font-medium text-gray-500 mb-4">Connected Clients</span>
                                    <div className="flex items-end gap-3">
                                        <span className="text-4xl font-bold text-gray-900 tracking-tight">{clients.length}</span>
                                        <span className="text-sm text-gray-500 mb-1">/ {gridCols * gridRows}</span>
                                    </div>
                                </Card>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Network Topology Configuration */}
                                <Card className="lg:col-span-1 border border-gray-100 shadow-sm">
                                    <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-50">
                                        <h2 className="text-lg font-semibold text-gray-900">Wall Settings</h2>
                                        <button onClick={handleApplyGridSettings} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
                                            <RotateCcw className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <div className="space-y-5">
                                        <div className="space-y-3">
                                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Matrix Dimensions</label>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">C</span>
                                                    <input type="number" min="1" value={gridCols} onChange={e => setGridCols(parseInt(e.target.value) || 1)} className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm text-gray-900 focus:outline-none focus:bg-white focus:ring-2 focus:border-transparent focus:ring-indigo-500 transition-all" />
                                                </div>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R</span>
                                                    <input type="number" min="1" value={gridRows} onChange={e => setGridRows(parseInt(e.target.value) || 1)} className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm text-gray-900 focus:outline-none focus:bg-white focus:ring-2 focus:border-transparent focus:ring-indigo-500 transition-all" />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Bezel Compensation</label>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">X</span>
                                                    <input type="number" min="0" value={bezelX} onChange={e => setBezelX(parseInt(e.target.value) || 0)} className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm text-gray-900 focus:outline-none focus:bg-white focus:ring-2 focus:border-transparent focus:ring-indigo-500 transition-all" />
                                                </div>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">Y</span>
                                                    <input type="number" min="0" value={bezelY} onChange={e => setBezelY(parseInt(e.target.value) || 0)} className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm text-gray-900 focus:outline-none focus:bg-white focus:ring-2 focus:border-transparent focus:ring-indigo-500 transition-all" />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Master Audio Node</label>
                                            <div className="relative">
                                                <select
                                                    value={masterAudioId}
                                                    onChange={(e) => {
                                                        setMasterAudioId(parseInt(e.target.value));
                                                        socket?.emit('set_master_audio', { position: parseInt(e.target.value) });
                                                    }}
                                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:bg-white focus:ring-2 focus:border-transparent focus:ring-indigo-500 appearance-none transition-all cursor-pointer"
                                                >
                                                    {Array.from({ length: gridRows * gridCols }, (_, i) => i + 1).map(pos => (
                                                        <option key={pos} value={pos}>Node #{String(pos).padStart(2, '0')}</option>
                                                    ))}
                                                </select>
                                                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                                                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                                </div>
                                            </div>
                                        </div>

                                        <button onClick={handleApplyGridSettings} className="w-full !mt-6 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm text-sm font-semibold py-2.5 rounded-xl transition-colors">
                                            Apply Changes
                                        </button>
                                    </div>
                                </Card>

                                {/* Visual Layout Preview */}
                                <Card className="lg:col-span-2 border border-gray-100 shadow-sm flex flex-col">
                                    <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-50">
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-lg font-semibold text-gray-900">Canvas Preview</h2>
                                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">Live</span>
                                        </div>
                                    </div>
                                    <div className="flex-1 bg-gray-100 rounded-xl p-4 md:p-8 flex items-center justify-center border border-gray-200 shadow-inner overflow-hidden">
                                        <div
                                            className="grid gap-2 md:gap-3 w-full max-w-3xl aspect-video mx-auto"
                                            style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
                                        >
                                            {Array.from({ length: gridRows * gridCols }, (_, i) => i + 1).map(pos => {
                                                const isConnected = clients.includes(pos);
                                                // Generate a random seed for the preview image based on position
                                                const imgSeed = `landscape-${pos}`;

                                                return (
                                                    <div
                                                        key={pos}
                                                        className={`relative rounded-xl overflow-hidden shadow-sm transition-all duration-300 group ${isConnected ? 'bg-white ring-2 ring-transparent hover:ring-indigo-400 cursor-pointer' : 'bg-gray-200 ring-1 ring-gray-300'}`}
                                                        style={{ aspectRatio: '16/9' }}
                                                    >
                                                        {isConnected ? (
                                                            <>
                                                                <img
                                                                    src={`https://source.unsplash.com/random/400x300/?abstract,architecture&sig=${pos}`}
                                                                    alt={`Node ${pos} view`}
                                                                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity grayscale-[30%] group-hover:grayscale-0 mix-blend-multiply"
                                                                />
                                                                {/* Overlay gradient */}
                                                                <div className="absolute inset-0 bg-gradient-to-t from-gray-900/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                                            </>
                                                        ) : (
                                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                                                                <MonitorOff className="w-8 h-8 opacity-20 mb-2" />
                                                                <span className="text-xs font-medium opacity-50">Offline</span>
                                                            </div>
                                                        )}

                                                        {/* Status Indicators */}
                                                        <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-md shadow-sm border border-white/20">
                                                            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_4px_#22c55e]' : 'bg-gray-400'}`} />
                                                            <span className="text-xs font-bold text-gray-800 tracking-tight">SD#{String(pos).padStart(2, '0')}</span>
                                                        </div>

                                                        {/* Master Audio Badge */}
                                                        {masterAudioId === pos && (
                                                            <div className="absolute top-2 right-2 bg-indigo-500/90 backdrop-blur-sm p-1 rounded-md shadow-sm">
                                                                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
                                        <div className="flex items-center gap-4">
                                            <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500"></div> Connected ({clients.length})</span>
                                            <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-gray-300"></div> Offline ({gridCols * gridRows - clients.length})</span>
                                        </div>
                                        <button className="text-indigo-600 font-medium hover:text-indigo-700">Identify Screens</button>
                                    </div>
                                </Card>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'media' && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Left Main Column */}
                            <div className="lg:col-span-2 space-y-6">

                                {/* Upload & Ingestion */}
                                <Card>
                                    <div className="flex items-center justify-between mb-6">
                                        <h2 className="text-lg font-semibold text-gray-900">Media Ingestion</h2>
                                        <button onClick={() => fileInputRef.current?.click()} className="text-sm font-medium text-gray-900 bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors border border-gray-200">
                                            Browse Files
                                        </button>
                                    </div>
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className="border-[1.5px] border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50/50 transition-all group"
                                    >
                                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="video/*" className="hidden" />
                                        {uploading ? (
                                            <div className="space-y-4">
                                                <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin mx-auto" />
                                                <p className="text-sm font-medium text-gray-600">{loadingMsg}</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                                                    <UploadCloud className="w-6 h-6 text-gray-500" />
                                                </div>
                                                <p className="text-base font-medium text-gray-900">Click or drag & drop video</p>
                                                <p className="text-sm text-gray-500">High-resolution formats supported (MP4, MKV)</p>
                                            </div>
                                        )}
                                    </div>
                                    {videoId && !uploading && (
                                        <div className="mt-4 p-3 bg-green-50 border border-green-100 rounded-lg flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-green-500" />
                                            <span className="text-sm font-medium text-green-800">Media ready: {videoId}</span>
                                        </div>
                                    )}
                                </Card>

                                {/* Playback Controls */}
                                <Card>
                                    <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center justify-between">
                                        Playback Interface
                                        <span className="text-xs font-semibold px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full">
                                            {isPlaying ? 'PLAYING' : 'IDLE'}
                                        </span>
                                    </h2>
                                    <div className="flex flex-wrap gap-3">
                                        <button onClick={() => command('admin_play')} className="flex-1 bg-gray-900 hover:bg-gray-800 text-white font-medium flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl transition-all shadow-sm">
                                            <Play className="w-4 h-4 fill-current" /> Play Cast
                                        </button>
                                        <button onClick={() => command('admin_pause')} className="flex-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl transition-all shadow-sm">
                                            <Pause className="w-4 h-4 fill-current" /> Pause
                                        </button>
                                        <button onClick={() => command('admin_seek', { time: 0 })} className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl transition-all shadow-sm">
                                            <RotateCcw className="w-4 h-4" /> Reset
                                        </button>
                                        <button onClick={() => command('admin_stop')} className="bg-white border border-red-200 hover:bg-red-50 hover:border-red-300 text-red-600 font-medium flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl transition-all shadow-sm">
                                            <Square className="w-4 h-4 fill-current text-red-500" /> Stop
                                        </button>
                                    </div>
                                </Card>

                                {/* Broadcasting Redirect */}
                                <Card className="bg-gradient-to-br from-indigo-50 to-white border-indigo-100 flex items-center justify-between p-6 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('live')}>
                                    <div>
                                        <h2 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
                                            <Video className="w-5 h-5" /> Start Live Broadcast
                                        </h2>
                                        <p className="text-sm text-indigo-700 mt-1 max-w-sm">Enter the Google Meet style broadcast room to stream your camera or screen directly to the matrix.</p>
                                    </div>
                                    <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg hover:bg-indigo-700 transition-colors">
                                        <Share2 className="w-5 h-5" />
                                    </div>
                                </Card>
                            </div>

                            {/* Right Sidebar Column */}
                            <div className="space-y-6">
                                {/* Playlist */}
                                <Card className="flex flex-col h-[320px]">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-lg font-semibold text-gray-900">Distribution Queue</h2>
                                        <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={loopPlaylist}
                                                onChange={() => {
                                                    socket?.emit('set_looping', { loop: !loopPlaylist });
                                                    setLoopPlaylist(!loopPlaylist);
                                                }}
                                                className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                            />
                                            LOOP
                                        </label>
                                    </div>
                                    <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                                        {playlist.length === 0 ? (
                                            <div className="h-full flex flex-col items-center justify-center text-center">
                                                <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                                                    <ListVideo className="w-5 h-5 text-gray-400" />
                                                </div>
                                                <span className="text-sm font-medium text-gray-900">Queue is empty</span>
                                                <span className="text-xs text-gray-500 mt-1">Upload media to begin</span>
                                            </div>
                                        ) : (
                                            playlist.map((item, idx) => (
                                                <div
                                                    key={idx}
                                                    onClick={() => socket?.emit('play_playlist_index', { index: idx })}
                                                    className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between transition-colors ${idx === playlistIndex ? 'border-gray-900 bg-gray-50 shadow-sm' : 'border-transparent hover:bg-gray-50 hover:border-gray-200'}`}
                                                >
                                                    <div className="flex items-center gap-3 overflow-hidden">
                                                        <span className={`text-xs font-bold ${idx === playlistIndex ? 'text-gray-900' : 'text-gray-400'}`}>{String(idx + 1).padStart(2, '0')}</span>
                                                        <span className={`text-sm truncate font-medium ${idx === playlistIndex ? 'text-gray-900' : 'text-gray-600'}`}>{item.name}</span>
                                                    </div>
                                                    <MoreVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </Card>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'live' && (
                        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="h-[calc(100vh-140px)] flex flex-col bg-gray-900 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-gray-800">
                            {/* Call Header */}
                            <div className="flex items-center justify-between px-6 py-4 bg-gray-900/80 backdrop-blur-sm z-10 border-b border-gray-800">
                                <div className="flex items-center gap-3">
                                    <div className={`w-3 h-3 rounded-full ${isSharing ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                                    <span className="text-white font-semibold text-lg">{isSharing ? 'Live Matrix Broadcast' : 'Ready to Broadcast'}</span>
                                    <span className="ml-4 px-3 py-1 bg-gray-800 text-gray-300 text-xs font-semibold rounded-full border border-gray-700">{gridCols}×{gridRows} Target</span>
                                </div>
                                <div className="flex items-center gap-4 text-white">
                                    <div className="flex items-center gap-2 bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700">
                                        <Users className="w-4 h-4 text-gray-400" />
                                        <span className="text-sm font-medium">{clients.length} Nodes Tuned In</span>
                                    </div>
                                    <span className="text-sm font-medium text-gray-400 ml-2">12:34 PM</span>
                                </div>
                            </div>

                            {/* Main Call Canvas - Gallery View */}
                            <div className="flex-1 p-6 flex flex-col items-center justify-center relative bg-[#111] overflow-hidden">
                                {!isSharing ? (
                                    <div className="flex flex-col items-center max-w-sm text-center">
                                        <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center mb-6 shadow-xl border border-gray-700">
                                            <Video className="w-10 h-10 text-gray-400" />
                                        </div>
                                        <h2 className="text-2xl font-bold text-white mb-2">Start your stream</h2>
                                        <p className="text-gray-400 mb-8">Share your screen or camera to broadcast directly to the {gridCols}x{gridRows} video matrix.</p>
                                        <button
                                            onClick={startScreenShare}
                                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-8 rounded-full shadow-lg shadow-indigo-900/50 flex items-center justify-center gap-2 transition-all hover:scale-105 active:scale-95"
                                        >
                                            <MonitorUp className="w-5 h-5" /> Start Screen Matrix Share
                                        </button>
                                    </div>
                                ) : (
                                    <div className="w-full h-full flex flex-col md:flex-row gap-4 items-center justify-center">
                                        {/* Local User Tile */}
                                        <div className="relative w-full md:w-2/3 h-full max-h-[70vh] bg-black rounded-2xl overflow-hidden shadow-2xl border border-gray-800 group">
                                            <video ref={localVideoRef} autoPlay muted className="w-full h-full object-contain" />
                                            {/* Name Tag overlay */}
                                            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2 text-white">
                                                {isMuted ? <MicOff className="w-4 h-4 text-red-400" /> : <div className="flex gap-0.5 items-end h-3"><div className="w-0.5 h-3 bg-green-400 animate-pulse" /><div className="w-0.5 h-2 bg-green-400 animate-pulse delay-75" /><div className="w-0.5 h-full bg-green-400 animate-pulse delay-150" /></div>}
                                                <span className="text-sm font-medium">You (Matrix Host)</span>
                                            </div>
                                            {/* Pinned Icon */}
                                            <div className="absolute top-4 right-4 bg-black/50 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border border-white/10 hover:bg-black/80">
                                                <LayoutGrid className="w-4 h-4 text-white" />
                                            </div>
                                        </div>

                                        {/* Preview Grid Tile (Attendees layout) */}
                                        <div className="w-full md:w-1/3 flex flex-col gap-4 h-full max-h-[70vh]">
                                            <div className="flex-1 bg-gray-800 rounded-2xl relative overflow-hidden border border-gray-700 flex flex-col items-center justify-center shadow-lg group">
                                                <div className="w-full h-full p-4 flex flex-col">
                                                    <span className="text-gray-400 text-xs font-semibold mb-2 flex items-center gap-2 uppercase tracking-wide">
                                                        <LayoutDashboard className="w-3.5 h-3.5" /> Output Topology Prev.
                                                    </span>
                                                    <div
                                                        className="flex-1 grid gap-1 w-full"
                                                        style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
                                                    >
                                                        {Array.from({ length: gridRows * gridCols }, (_, i) => i + 1).map(pos => (
                                                            <div key={pos} className={`bg-black/50 rounded-md border flex items-center justify-center ${clients.includes(pos) ? 'border-indigo-500/50' : 'border-gray-700'}`}>
                                                                <MonitorOff className={`w-4 h-4 ${clients.includes(pos) ? 'text-indigo-400' : 'text-gray-600'}`} />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Google Meet Style Bottom Control Bar */}
                            <div className="h-20 bg-gray-900 border-t border-gray-800 flex items-center justify-between px-8 z-20">
                                <div className="flex-1">
                                    <span className="text-gray-400 text-sm font-medium">{isSharing ? 'Matrix stream is highly encrypted' : 'Waiting to connect'}</span>
                                </div>
                                <div className="flex items-center justify-center gap-4 flex-1">
                                    <button
                                        onClick={() => setIsMuted(!isMuted)}
                                        className={`w-12 h-12 rounded-full flex items-center justify-center shadow-sm transition-all ${isMuted ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700'}`}
                                    >
                                        {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                                    </button>
                                    <button
                                        onClick={() => setIsVideoOff(!isVideoOff)}
                                        className={`w-12 h-12 rounded-full flex items-center justify-center shadow-sm transition-all ${isVideoOff ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700'}`}
                                    >
                                        {isVideoOff ? <Video className="w-5 h-5 relative before:absolute before:w-6 before:h-0.5 before:bg-white before:rotate-45" /> : <Video className="w-5 h-5" />}
                                    </button>

                                    {!isSharing ? (
                                        <button
                                            onClick={startScreenShare}
                                            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-sm transition-all border border-indigo-500/50"
                                        >
                                            <MonitorUp className="w-5 h-5" />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={stopScreenShare}
                                            className="bg-red-500 hover:bg-red-600 text-white rounded-2xl px-6 h-12 flex items-center justify-center shadow-sm transition-all font-semibold gap-2"
                                        >
                                            <PhoneOff className="w-5 h-5" /> End Stream
                                        </button>
                                    )}

                                    <div className="w-px h-8 bg-gray-700 mx-2" />
                                    <button className="w-12 h-12 bg-gray-800 hover:bg-gray-700 rounded-full flex items-center justify-center text-white border border-gray-700 transition-colors">
                                        <MoreVertical className="w-5 h-5" />
                                    </button>
                                </div>
                                <div className="flex-1 flex justify-end">
                                    <div className="flex bg-gray-800 p-1 rounded-xl border border-gray-700">
                                        <button className="px-3 py-1.5 text-xs font-semibold bg-gray-700 text-white rounded-lg shadow-sm">Your layout</button>
                                        <button className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white transition-colors">Attendees'</button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'analytics' && (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
                            <Card className="flex flex-col items-center justify-center py-32 text-center">
                                <Activity className="w-16 h-16 text-gray-200 mb-6" />
                                <h3 className="text-2xl font-bold text-gray-900">Analytics Module Status</h3>
                                <p className="text-gray-500 max-w-md mt-3">Historical node telemetry and playback analytics will appear here once the aggregation service is enabled for your workspace.</p>
                                <button className="mt-6 font-medium text-white bg-gray-900 px-6 py-2.5 rounded-lg shadow-sm hover:bg-gray-800 transition-colors">Enable Telemetry</button>
                            </Card>
                        </motion.div>
                    )}

                    {activeTab === 'settings' && (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
                            <Card className="flex flex-col items-center justify-center py-32 text-center">
                                <Settings className="w-16 h-16 text-gray-200 mb-6" />
                                <h3 className="text-2xl font-bold text-gray-900">System Configuration</h3>
                                <p className="text-gray-500 max-w-md mt-3">Global workspace settings, API access control, and advanced system properties will be configured here.</p>
                                <button className="mt-6 font-medium text-gray-900 bg-white border border-gray-200 px-6 py-2.5 rounded-lg shadow-sm hover:bg-gray-50 transition-colors">Manage Access</button>
                            </Card>
                        </motion.div>
                    )}
                </div>
            </main>
        </div>
    );
}

export default AdminDashboard;
