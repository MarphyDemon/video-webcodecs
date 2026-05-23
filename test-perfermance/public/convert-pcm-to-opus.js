const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('uuid'); // 用于生成唯一临时文件名

// 配置参数（根据实际 PCM 格式调整）
const PCM_CONFIG = {
  sampleRate: 24000,      // 与用户实际播放时的采样率一致
  channels: 1,            // 单声道（与用户一致）
  bitDepth: 16,           // 16bit位深度（与用户一致）
  opusBitrate: '48',      // Opus 比特率
  frameDuration: '60'     // 帧持续时间参数
};

/**
 * 从 JSON 文件提取 PCM 数据并转换为 Ogg/Opus
 * @param {string} jsonPath - JSON 文件路径
 * @param {string} outputPath - 输出 Opus 文件路径
 * @param {boolean} keepTempFile - 是否保留合并后的临时 PCM 文件（默认：false）
 * @param {boolean} generateIndividualPcm - 是否生成单独的 PCM 文件（默认：true）
 */
async function convertJsonToOpus(jsonPath, outputPath = 'output.opus', keepTempFile = false, generateIndividualPcm = true) {
  // 1. 读取并解析 JSON 文件
  let jsonData;
  try {
    jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    console.log(`✅ JSON 文件解析成功，包含 ${jsonData.audioData?.length || 0} 条音频数据`);
  } catch (err) {
    console.error('❌ 读取/解析 JSON 文件失败：', err.message);
    return;
  }

  // 2. 提取并拼接 PCM 数据（按 ad 的 key 排序）
  const pcmBytes = [];
  const audioDataList = jsonData.audioData || [];
  
  // 创建单独 PCM 文件存储目录
  if (generateIndividualPcm) {
    const pcmCutDir = path.join(__dirname, 'pcm_cut');
    if (!fs.existsSync(pcmCutDir)) {
      fs.mkdirSync(pcmCutDir);
      console.log(`✅ 创建单独 PCM 文件存储目录：${pcmCutDir}`);
    }
  }
  
  audioDataList.forEach((item, index) => {
    const ad = item.ad || {};
    // 按 key 数字排序后提取值
    const sortedKeys = Object.keys(ad).sort((a, b) => parseInt(a) - parseInt(b));
    
    // 提取当前条目的 PCM 数据
    const itemPcmBytes = [];
    sortedKeys.forEach(key => {
      const byteValue = ad[key];
      pcmBytes.push(byteValue); // 每个值是单个字节（0-255）
      itemPcmBytes.push(byteValue);
    });
    
    // 生成单独的 PCM 文件
    if (generateIndividualPcm && itemPcmBytes.length > 0) {
      const pcmCutDir = path.join(__dirname, 'pcm_cut');
      const individualPcmPath = path.join(pcmCutDir, `audio_${index + 1}_${item.id || index}.pcm`);
      try {
        fs.writeFileSync(individualPcmPath, Buffer.from(itemPcmBytes));
        console.log(`✅ 单独 PCM 文件已生成：${individualPcmPath}`);
      } catch (err) {
        console.error(`❌ 写入单独 PCM 文件失败 (${individualPcmPath})：`, err.message);
      }
    }
  });

  if (pcmBytes.length === 0) {
    console.error('❌ 未提取到 PCM 数据！');
    return;
  }

  // 3. 将 PCM 数据写入临时文件（解决 Buffer 输入不支持问题）
  const tempPcmPath = path.join(__dirname, `output.pcm`);
  try {
    fs.writeFileSync(tempPcmPath, Buffer.from(pcmBytes));
    console.log(`✅ 临时 PCM 文件已写入：${tempPcmPath}`);
  } catch (err) {
    console.error('❌ 写入临时 PCM 文件失败：', err.message);
    return;
  }

  // 4. 通过 FFmpeg 将临时 PCM 文件编码为 Ogg/Opus
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(tempPcmPath)
      .inputFormat(`s${PCM_CONFIG.bitDepth}le`) // PCM 格式：s16le/s8le/s32le
      .audioChannels(PCM_CONFIG.channels)
      .audioFrequency(PCM_CONFIG.sampleRate)
      .audioCodec('libopus') // 使用 libopus 编码器
      // .audioBitrate(PCM_CONFIG.opusBitrate)
      // .outputOptions(['-frame_duration', PCM_CONFIG.frameDuration])
      .format('opus') // 输出 Ogg/Opus 封装格式
      .output(outputPath)
      .on('end', () => {
        if (keepTempFile) {
          console.log(`✅ 转换完成！输出文件：${outputPath}`);
          console.log(`✅ 临时 PCM 文件已保留：${tempPcmPath}`);
        } else {
          // 删除临时文件
          fs.unlinkSync(tempPcmPath);
          console.log(`✅ 转换完成！输出文件：${outputPath}`);
          console.log(`✅ 临时文件已清理`);
        }
        resolve();
      })
      .on('error', (err) => {
        if (keepTempFile) {
          console.error('❌ 转换失败：', err.message);
          console.log(`⚠️  临时 PCM 文件已保留：${tempPcmPath}`);
        } else {
          // 删除临时文件
          fs.unlinkSync(tempPcmPath);
          console.error('❌ 转换失败：', err.message);
        }
        reject(err);
      })
      .run();
  });
}

// 安装依赖：npm install uuid
// 执行转换（替换为你的 JSON 文件路径）
// 示例 1：不保留临时文件（默认）
// convertJsonToOpus('./avatarData.json', './output.opus');

// 示例 2：保留临时 PCM 文件
convertJsonToOpus('./avatarData.json', './output.opus', true);

// 示例 3：生成单独 PCM 文件但不保留合并后的临时文件
// convertJsonToOpus('./avatarData.json', './output.opus', false, true);

// 示例 4：不生成单独 PCM 文件
// convertJsonToOpus('./avatarData.json', './output.opus', false, false);

// opus转mp3
// ffmpeg -i output.opus -c:a libmp3lame -q:a 2 -ar 24000 -ac 1 output.mp3