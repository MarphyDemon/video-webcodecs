const workerCode = `
importScripts('https://media.youyan.xyz/youling-lite-sdk/mp4box.all.min.js');

let abortFlag = false;
let mp4boxfile = null;
let videoDecoder = null;
let samplesInRange = [];
let videoTrack = null;
let arrayBuffer = null;

onmessage = function(e) {
  if (e.data.type === 'decode') {
    abortFlag = false;
    decodeFile(e.data.file, e.data.start, e.data.end);
  } else if (e.data.type === 'abort') {
    abortFlag = true;
    // 主动销毁所有大对象和引用
    if (videoDecoder) {
      try { 
        videoDecoder.flush();
        videoDecoder.reset();
        videoDecoder.close();
      } catch (err) {}
      videoDecoder = null;
    }
    if (mp4boxfile) {
      try { mp4boxfile.flush(); } catch (err) {}
      mp4boxfile = null;
    }
    samplesInRange = [];
    videoTrack = null;
    arrayBuffer = null;
    // 关闭worker
    self.close();
  }
};

function decodeFile(file, startFrame, endFrame) {
  arrayBuffer = file.data;
  mp4boxfile = MP4Box.createFile();
  videoTrack = null;
  let nbSampleTotal = 0;
  samplesInRange = [];
  videoDecoder = null;
  let frameIndex = 0;
  let totalFrames = 0;
  mp4boxfile.onReady = function(info) {
    videoTrack = info.videoTracks[0];
    nbSampleTotal = videoTrack.nb_samples;
    mp4boxfile.setExtractionOptions(videoTrack.id, null, {
      nbSamples: nbSampleTotal,
      rapAlignement: true
    });
    mp4boxfile.start();
  };
  mp4boxfile.onSamples = function(trackId, ref, samples) {
    if (abortFlag) return;
    // 自动对齐到区间内第一个关键帧
    let startIdx = Math.min(0, startFrame);
    let endIdx = Math.min(samples.length - 1, endFrame);
    while (startIdx <= endIdx && !samples[startIdx].is_sync) {
      startIdx++;
    }
    if (startIdx > endIdx) {
      // 区间内没有关键帧，直接done
      postMessage({ type: 'done' });
      return;
    }
    samplesInRange = samples.slice(0, endIdx + 1);
    totalFrames = samplesInRange.length;
    if (!videoDecoder) {
      videoDecoder = new VideoDecoder({
        output: handleFrame,
        error: err => {
          postMessage({ type: 'error', error: err.message })
        }
      });
      const entry = mp4boxfile.moov.traks[0].mdia.minf.stbl.stsd.entries[0];
      const box = entry.avcC ?? entry.hvcC ?? entry.vpcC;
      let description = undefined;
      if (box) {
        const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
        box.write(stream);
        description = new Uint8Array(stream.buffer.slice(8));
      }
      videoDecoder.configure({
        codec: videoTrack.codec,
        codedWidth: videoTrack.track_width,
        codedHeight: videoTrack.track_height,
        description,
        // optimizeForLatency: true,
        hardwareAcceleration: "prefer-software"
      });
    }
    for (let i = 0; i < samplesInRange.length; i++) {
      if (abortFlag) break;
      const sample = samplesInRange[i];
      const chunk = new EncodedVideoChunk({
        type: sample.is_sync ? 'key' : 'delta',
        timestamp: sample.cts,
        duration: sample.duration,
        data: sample.data
      });
      videoDecoder.decode(chunk);
    }
    videoDecoder.flush().then(() => {
      postMessage({ type: 'done' });
    });
  };
  function handleFrame(videoFrame) {
    if (abortFlag) {
      videoFrame.close();
      return;
    }
    postMessage({ type: 'frame', frame: videoFrame, index: frameIndex++, total: totalFrames }, [videoFrame]);
  }
  arrayBuffer.fileStart = 0;
  mp4boxfile.appendBuffer(arrayBuffer);
  mp4boxfile.flush();
}
`;
const blob = new Blob([workerCode], { type: "application/javascript" });
export const workerURL = URL.createObjectURL(blob);
