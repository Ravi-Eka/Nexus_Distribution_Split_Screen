import os
import subprocess
import asyncio
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).parent.resolve()
UPLOAD_DIR = BASE_DIR / "uploads"
HLS_DIR = BASE_DIR / "static" / "hls"

# Create directories if they don't exist
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
HLS_DIR.mkdir(parents=True, exist_ok=True)

class VideoProcessor:
    def __init__(self):
        pass

    async def get_video_info(self, video_path: str):
        """Get video width and height using ffprobe."""
        cmd = [
            'ffprobe', '-v', 'error', '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height', '-of', 'csv=s=x:p=0',
            video_path
        ]
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await process.communicate()
            if process.returncode == 0:
                dimensions = stdout.decode().strip().split('x')
                return int(dimensions[0]), int(dimensions[1])
        except Exception as e:
            print(f"Error getting video info: {e}")
        return None, None

    async def process_video(self, video_id: str, video_path: str, rows: int = 2, cols: int = 3, bezel_x: int = 0, bezel_y: int = 0):
        """Split video into N x M parts and generate HLS streams, accounting for physical bezels."""
        width, height = await self.get_video_info(video_path)
        if not width or not height:
            raise Exception("Could not determine video dimensions.")

        segment_width = width // cols
        segment_height = height // rows

        # Calculate virtual resolution that includes the bezels
        v_width = width + (cols - 1) * bezel_x
        v_height = height + (rows - 1) * bezel_y

        tasks = []
        for row in range(rows):
            for col in range(cols):
                position = row * cols + col + 1
                out_dir = HLS_DIR / f"{video_id}_{position}"
                out_dir.mkdir(parents=True, exist_ok=True)
                
                # Calculate coordinates on the virtual expanded canvas
                x = col * (segment_width + bezel_x)
                y = row * (segment_height + bezel_y)
                
                hls_playlist = str(out_dir / "playlist.m3u8")
                
                # We scale to virtual size, then crop out the physical monitor size, dropping the bezel pixels
                filter_complex = f"[0:v]scale={v_width}:{v_height}[scaled];[scaled]crop={segment_width}:{segment_height}:{x}:{y}"
                
                cmd = [
                    'ffmpeg', '-y', '-i', video_path,
                    '-filter_complex', filter_complex,
                    '-c:v', 'libx264',
                    '-preset', 'fast',
                    '-hls_time', '4',
                    '-hls_playlist_type', 'vod',
                    '-hls_segment_filename', str(out_dir / "segment_%03d.ts"),
                    hls_playlist
                ]
                
                tasks.append(self._run_ffmpeg(cmd))
                
        # Run all FFmpeg jobs concurrently
        await asyncio.gather(*tasks)
        return True

    async def _run_ffmpeg(self, cmd):
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        _, stderr = await process.communicate()
        if process.returncode != 0:
            print(f"FFmpeg Error: {stderr.decode()}")
            raise Exception("FFmpeg processing failed")

processor = VideoProcessor()
