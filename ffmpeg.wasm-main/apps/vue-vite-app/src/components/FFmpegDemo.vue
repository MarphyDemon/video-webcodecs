<template>
  <div class="container">
    <video :src="originalVideoUrl" controls />
    <br />
    
    <div class="controls">
      <label for="fps">抽帧帧率 (FPS): </label>
      <input 
        id="fps" 
        type="number" 
        v-model.number="fps" 
        min="1" 
        max="30" 
        step="1"
        value="5"
      >
      <label for="maxFrames">最大帧数: </label>
      <input 
        id="maxFrames" 
        type="number" 
        v-model.number="maxFrames" 
        min="10" 
        max="500" 
        step="10"
        value="100"
      >
      <button @click="extractFrames" :disabled="isProcessing">Start Extract Frames</button>
    </div>
    
    <p>{{ message }}</p>
    <div class="progress-container" v-if="isProcessing">
      <div class="progress-bar" :style="{ width: progress + '%' }"></div>
      <span class="progress-text">{{ progress.toFixed(1) }}%</span>
    </div>
    
    <div class="frame-player" v-if="frames.length > 0">
      <h3>Frame Player</h3>
      <img :src="currentFrame" :alt="'Frame ' + currentFrameIndex" class="frame-image">
      <div class="player-controls">
        <button @click="togglePlay">{{ isPlaying ? 'Pause' : 'Play' }}</button>
        <input 
          type="range" 
          v-model="currentFrameIndex" 
          :min="0" 
          :max="frames.length - 1"
          @input="updateFrame"
        >
        <span>{{ currentFrameIndex + 1 }} / {{ frames.length }}</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { FFmpeg } from '@ffmpeg/ffmpeg'
import type { LogEvent } from '@ffmpeg/ffmpeg/dist/esm/types'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { defineComponent, ref, onUnmounted, watch } from 'vue'

const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.9/dist/esm'
const videoURL = 'http://localhost:5173/demo-cut-1.mp4'

export default defineComponent({
  name: 'App',
  setup() {
    const ffmpeg = new FFmpeg()
    const message = ref('Click Start to Extract Frames')
    const originalVideoUrl = ref(videoURL)
    const isProcessing = ref(false)
    const fps = ref(24) // 降低默认帧率，减少处理压力
    const maxFrames = ref(100) // 限制最大帧数
    const frames = ref<string[]>([])
    const currentFrameIndex = ref(0)
    const isPlaying = ref(false)
    const progress = ref(0) // 进度百分比
    let playInterval: number | null = null
    let totalDuration = 0 // 视频总时长(秒)
    let timeoutTimer: any| null = null

    const currentFrame = ref('')

    // 解析FFmpeg日志获取进度
    const parseProgress = (logMessage: string) => {
      // 匹配时间戳日志，如: time=00:00:05.12
      const timeMatch = logMessage.match(/time=(\d+:\d+:\d+\.\d+)/)
      if (timeMatch && totalDuration) {
        const timeStr = timeMatch[1]
        const [hours, minutes, seconds] = timeStr.split(':').map(Number)
        const currentTime = hours * 3600 + minutes * 60 + seconds
        const currentProgress = (currentTime / totalDuration) * 100
        progress.value = Math.min(currentProgress, 100)
      }
    }

    const updateFrame = () => {
      if (frames.value.length > 0 && currentFrameIndex.value < frames.value.length) {
        currentFrame.value = frames.value[currentFrameIndex.value]
      }
    }

    const togglePlay = () => {
      if (frames.value.length === 0) return

      isPlaying.value = !isPlaying.value

      if (isPlaying.value) {
        const intervalMs = 1000 / fps.value
        playInterval = window.setInterval(() => {
          currentFrameIndex.value = (currentFrameIndex.value + 1) % frames.value.length
          updateFrame()
        }, intervalMs)
      } else if (playInterval) {
        clearInterval(playInterval)
        playInterval = null
      }
    }

    // 获取视频时长（用于进度计算）
    const getVideoDuration = async () => {
      return new Promise<number>((resolve) => {
        const video = document.createElement('video')
        video.src = videoURL
        video.onloadedmetadata = () => {
          resolve(video.duration)
        }
        video.onerror = () => resolve(0)
      })
    }

    async function extractFrames() {
      if (isProcessing.value) return

      // 初始化状态
      isProcessing.value = true
      message.value = 'Loading ffmpeg-core.js'
      frames.value = []
      currentFrameIndex.value = 0
      currentFrame.value = ''
      progress.value = 0

      // 先获取视频时长，用于进度计算
      totalDuration = await getVideoDuration()
      if (totalDuration === 0) {
        message.value = '无法获取视频信息'
        isProcessing.value = false
        return
      }

      // 监听FFmpeg日志
      const logHandler = ({ message: msg }: LogEvent) => {
        message.value = msg
        parseProgress(msg) // 解析进度
      }
      ffmpeg.on('log', logHandler)

      try {
        // 加载FFmpeg核心
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
          workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript')
        })

        message.value = 'Downloading video...'
        const response = await fetch(videoURL);
        if (!response.ok) {
          throw new Error(`下载失败: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const videoData = new Uint8Array(arrayBuffer);
        await ffmpeg.writeFile('input.mp4', videoData)

        message.value = 'Extracting frames...'
        // 优化FFmpeg命令：
        // 1. 限制输出尺寸(-s)减少内存占用
        // 2. 限制最大帧数(-vframes)防止过度处理
        // 3. 增加日志详细度(-loglevel)
        await ffmpeg.exec([
          // '-i', 'input.mp4',
          // '-vf', `fps=${fps.value},scale=640:-1`, // 按帧率抽帧并缩放至宽度640
          // '-vframes', maxFrames.value.toString(), // 限制最大帧数
          // '-q:v', '5', // 适当降低画质减少文件大小
          // '-loglevel', 'info', // 输出详细日志
          // 'frame_%04d.png'
          '-i', 'input.mp4',       // 输入文件
          '-vf', 'fps=24',         // 每秒提取24帧
          '-y',                    // 覆盖输出文件
          'frame_%d.png'           // 输出帧文件
        ])
        

        // 超时保护：10秒内没有新帧则视为完成
        timeoutTimer = setTimeout(() => {
          if (isProcessing.value) {
            message.value = '检测到处理超时，尝试读取已生成的帧...'
          }
        }, 10000)

        // 获取帧文件列表
        message.value = 'Reading frames...'
        const frameFiles = await ffmpeg.listDir('.')
        const imageFiles = frameFiles
          .filter(file => file.name.startsWith('frame_') && file.name.endsWith('.png'))
          .sort((a, b) => a.name.localeCompare(b.name))

        // 读取帧文件
        for (const [index, file] of imageFiles.entries()) {
          const data = await ffmpeg.readFile(file.name)
          const blob = new Blob([(data as Uint8Array).buffer], { type: 'image/png' })
          frames.value.push(URL.createObjectURL(blob))
          // 更新进度
          progress.value = ((index + 1) / imageFiles.length) * 100
        }

        message.value = `Extracted ${frames.value.length} frames successfully`
        if (frames.value.length > 0) {
          currentFrameIndex.value = 0
          updateFrame()
        }
      } catch (error) {
        message.value = `Error: ${(error as Error).message}`
        console.error('Extraction error:', error)
      } finally {
        isProcessing.value = false
        ffmpeg.off('log', logHandler) // 移除日志监听
        if (timeoutTimer) clearTimeout(timeoutTimer)
      }
    }

    onUnmounted(() => {
      if (playInterval) clearInterval(playInterval)
      frames.value.forEach(url => URL.revokeObjectURL(url))
    })

    return {
      originalVideoUrl,
      message,
      fps,
      maxFrames,
      frames,
      currentFrame,
      currentFrameIndex,
      isPlaying,
      isProcessing,
      progress,
      extractFrames,
      togglePlay,
      updateFrame
    }
  }
})
</script>

<style>
.container {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 30px;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
  padding: 0 20px;
}

video, .frame-image {
  max-width: 100%;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.controls {
  margin: 20px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 15px;
  flex-wrap: wrap;
}

input[type="number"] {
  width: 80px;
  padding: 5px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

button {
  background-color: #42b983;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s;
}

button:hover {
  background-color: #359e6d;
}

button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.progress-container {
  height: 20px;
  background-color: #f0f0f0;
  border-radius: 10px;
  overflow: hidden;
  margin: 10px 0;
  position: relative;
}

.progress-bar {
  height: 100%;
  background-color: #42b983;
  transition: width 0.3s ease;
}

.progress-text {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  color: #333;
  line-height: 20px;
}

.frame-player {
  margin-top: 30px;
  padding: 20px;
  border-top: 1px solid #eee;
}

.player-controls {
  margin-top: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}

.player-controls input[type="range"] {
  flex-grow: 1;
  max-width: 400px;
}

p {
  color: #666;
  margin: 15px 0;
}
</style>
