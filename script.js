"use strict";

/*===========================================================================
 * WebGPU 対応チェック
 *===========================================================================*/
if (!navigator.gpu) {
  alert("Your browser does not support WebGPU. Please use a compatible browser.");
  throw new Error("WebGPU not supported");
}

/*===========================================================================
 * DOM要素の取得
 *===========================================================================*/
const dropArea   = document.getElementById("drop-area");
const fileInput  = document.getElementById("file-input");
const canvas     = document.getElementById("output-canvas");
const ctx        = canvas.getContext("2d");
const sumDisplay = document.getElementById("sumDisplay");
const dcDisplay = document.getElementById("dcDisplay");


/*===========================================================================
 * ヘルパー関数: コンソールログ
 *===========================================================================*/
function log(msg) {
  console.log(msg);
}

/*===========================================================================
 * ヘルパー関数: 32bit整数のランダム値取得
 *===========================================================================*/
function Rnd32bit() {
  return Math.floor(Math.random() * 0x100000000);
}

/*===========================================================================
 * ヘルパー関数: random9 (3×3区画の並び替えに使用する補助)
 *===========================================================================*/
function random9() {
  const arr = [0,1,2,3,4,5,6,7,8];
  for (let i = 0; i < 8; i++) {
    const revIndex = 8 - i;
    const randomIndex = Math.floor(Math.random() * (9 - i));
    const tempVal = arr[revIndex];
    arr[revIndex] = arr[randomIndex];
    arr[randomIndex] = tempVal;
  }
  return arr;
}

/*===========================================================================
 * ヘルパー関数: colcount (3×3区画ごとのピクセル数を数える)
 *===========================================================================*/
function colcount(imgWidth, imgHeight) {
  const widthDiv3  = Math.floor(imgWidth / 3);
  const heightDiv3 = Math.floor(imgHeight / 3);

  // 3×3 = 9区画それぞれのピクセル数
  const col9n = new Array(9).fill(0);
  for (let i = 0; i < 9; i++) {
    col9n[i] = widthDiv3 * heightDiv3;
  }

  // 幅・高さを3で割ったあまり分を振り分ける
  const widthRem3  = imgWidth  % 3;
  const heightRem3 = imgHeight % 3;

  // 幅余り
  if (widthRem3 >= 1) {
    // 左列に高さ分を追加
    col9n[0] += heightDiv3 + (heightRem3 > 0 ? 1 : 0);
    col9n[3] += heightDiv3 + (heightRem3 > 1 ? 1 : 0);
    col9n[6] += heightDiv3;
  }
  if (widthRem3 >= 2) {
    // 中列に高さ分を追加
    col9n[1] += heightDiv3 + (heightRem3 > 0 ? 1 : 0);
    col9n[4] += heightDiv3 + (heightRem3 > 1 ? 1 : 0);
    col9n[7] += heightDiv3;
  }

  // 高さ余り
  if (heightRem3 >= 1) {
    col9n[0] += widthDiv3;
    col9n[1] += widthDiv3;
    col9n[2] += widthDiv3;
  }
  if (heightRem3 >= 2) {
    col9n[3] += widthDiv3;
    col9n[4] += widthDiv3;
    col9n[5] += widthDiv3;
  }

  return col9n;
}

/*===========================================================================
 * ヘルパー関数: WebGPU初期化
 *===========================================================================*/
async function initWebGPU() {
  if (!('gpu' in navigator)) {
    throw new Error('WebGPU 未サポート');
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('WebGPU Adapter取得失敗');
  }
  const device = await adapter.requestDevice();
  return device;
}

/*===========================================================================
 * ヘルパー関数: GPUバッファ作成
 * - mappedAtCreation=true にすると作成直後に書き込み可能な範囲を得られる
 * - data 引数があれば、それをバッファへコピーする
 *===========================================================================*/
function createGPUBuffer(device, {
  size,
  usage,
  label,
  mappedAtCreation = false,
  data = null
}) {
  const buffer = device.createBuffer({
    size,
    usage,
    label,
    mappedAtCreation
  });

  // バッファ作成直後にデータを書き込む
  if (mappedAtCreation) {
    const range = buffer.getMappedRange();
    if (data) {
      new Uint8Array(range).set(new Uint8Array(data));
    }
    buffer.unmap();
  } else if (data) {
    // CPU → GPU 転送 (writeBuffer) で書き込む場合
    device.queue.writeBuffer(buffer, 0, data);
  }
  return buffer;
}

/*===========================================================================
 * ヘルパー関数: バインドグループレイアウト作成 (0番)
 *===========================================================================*/
function createBindGroupLayout0(device) {
  return device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage", access: "read_write" }, // src
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage", access: "read_write" }, // dst
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "uniform" }, // uniforms
      },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage", access: "read_write" }, // AllScore
      },
      {
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage", access: "read_write" }, // indexBuffer
      },
    ],
  });
}

/*===========================================================================
 * ヘルパー関数: バインドグループレイアウト作成 (1番)
 *===========================================================================*/
function createBindGroupLayout1(device) {
  return device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "uniform" }, // uniforms2
      },
    ],
  });
}

/*===========================================================================
 * シェーダーコード: (色反転 + 距離計算等)
 *===========================================================================*/
const shaderCode = `

struct Uniforms {
  width : u32,
  height: u32,
  rngSeed1: u32,
  rngSeed2: u32,
  maxIndex: u32,
}

struct Uniforms2 {
  rngSeed1: u32,
  rngSeed2: u32,
  nowcolor: u32,
  colornum: u32,
  widthDiv3: u32,
}

@group(0) @binding(0) var<storage, read_write> inPixelBuf: array<u32>; // 入力画像 (RGBAパック)
@group(0) @binding(1) var<storage, read_write> dst: array<u32>;       // 出力画像
@group(0) @binding(2) var<uniform> uniforms : Uniforms;
@group(0) @binding(3) var<storage, read_write> AllScore : array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> indexBuffer : array<u32>;

@group(1) @binding(0) var<uniform> uniforms2 : Uniforms2;

var<workgroup> localBuffer: array<u32, 256>;
var<workgroup> localSum0: atomic<u32>;
var<workgroup> localSum1: atomic<u32>;

/*
//AllScoreの構造体イメージ (u32配列上で表現)
[0] 元の場所と同じピクセル数(uint)
[2] 全体シャッフル後の平均距離(ulong 下位/上位)
[4] (部分計算時点)全体平均(ulong 下位/上位)
[6 + 2*n]   ブロックnの部分平均(ulong 下位/上位)
...
*/

//---------------------------------------------------------------------------
// xorshiftRng: 乱数生成
//---------------------------------------------------------------------------
fn xorshiftRng(rngState: u32) -> u32 {
  var s = rngState;
  s = s ^ (s << 13);
  s = s ^ (s >> 17);
  s = s ^ (s << 5);
  return s;
}

//---------------------------------------------------------------------------
// calcScaledRgbDistance: RGB の差分から距離値を返す
// (L2距離を元に 65536倍して整数化)
//---------------------------------------------------------------------------
fn calcScaledRgbDistance(colorA: u32, colorB: u32) -> u32 {
  let rA = colorA & 0xFFu;
  let gA = (colorA >> 8) & 0xFFu;
  let bA = (colorA >> 16) & 0xFFu;

  let rB = colorB & 0xFFu;
  let gB = (colorB >> 8) & 0xFFu;
  let bB = (colorB >> 16) & 0xFFu;

  let dx = f32(i32(rB) - i32(rA));
  let dy = f32(i32(gB) - i32(gA));
  let dz = f32(i32(bB) - i32(bA));
  let dist = sqrt(dx*dx + dy*dy + dz*dz);

  // 0.0022641187 * 65536 ≈ 148.3 → dist × 148.3
  return u32(0.5 + dist * 148.3);
}

//---------------------------------------------------------------------------
// kernel_0: 色反転 (Alphaチャンネルを維持したままRGBを反転)
//---------------------------------------------------------------------------
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  if (index >= arrayLength(&inPixelBuf)) {
    return;
  }
  let rgba = inPixelBuf[index];
  var r = 255u - ((rgba >> 0) & 0xFFu);
  var g = 255u - ((rgba >> 8) & 0xFFu);
  var b = 255u - ((rgba >> 16) & 0xFFu);
  var a = (rgba >> 24) & 0xFFu;

  // Alphaで乗算
  r = r * a / 255u;
  g = g * a / 255u;
  b = b * a / 255u;

  // 反転色を格納
  inPixelBuf[index] = r + g*256u + b*65536u + 255u*16777216u;
}

//---------------------------------------------------------------------------
// kernel_1: randomSharedMemoryAccess
// 論文での <dc> を求める (結果を AllScore[2],AllScore[3] に集約)
//---------------------------------------------------------------------------
@compute @workgroup_size(256)
fn randomSharedMemoryAccess(@builtin(global_invocation_id) gid : vec3<u32>,
                            @builtin(local_invocation_id) lid : vec3<u32>) {
  let globalId = gid.x;
  let localId  = lid.x;
  let inputSize = uniforms.maxIndex;
  let rngSeed1  = uniforms.rngSeed1;
  let rngSeed2  = uniforms.rngSeed2;

  // 初回初期化
  if (localId == 0) {
    atomicStore(&localSum0, 0u);
    atomicStore(&localSum1, 0u);
  }
  workgroupBarrier();

  // Xorshift (スレッド固有)
  var state = rngSeed1 + globalId * rngSeed2;
  state = xorshiftRng(state);
  let randIndex = state % inputSize;

  localBuffer[localId] = inPixelBuf[randIndex];
  workgroupBarrier();

  // 近傍ピクセルとの距離計算
  let pixelNeighbor1 = localBuffer[(localId + 1u)  % 256u];
  let pixelNeighbor2 = localBuffer[(localId + 11u) % 256u];
  var distVal = calcScaledRgbDistance(localBuffer[localId], pixelNeighbor1);
  distVal += calcScaledRgbDistance(localBuffer[localId], pixelNeighbor2);

  // ワークグループ内で64bit加算 (2要素に分割)
  let oldVal = atomicAdd(&localSum0, distVal);
  if (oldVal + distVal < distVal) {
    // オーバーフローで桁上がり
    atomicAdd(&localSum1, 1u);
  }
  workgroupBarrier();

  // ローカル代表スレッドが結果をAllScore[2],AllScore[3]に書き出す
  if (localId == 0u) {
    let dist0 = atomicLoad(&localSum0);
    let old0  = atomicAdd(&AllScore[2], dist0);
    var dist1 = atomicLoad(&localSum1);
    if (old0 + dist0 < dist0) {
      dist1++;
    }
    atomicAdd(&AllScore[3], dist1);
  }
}

//---------------------------------------------------------------------------
// kernel_2-1: indexinit
//   indexBuffer を初期化 (indexBuffer[i] = i)
//---------------------------------------------------------------------------
@compute @workgroup_size(64)
fn indexinit(@builtin(global_invocation_id) gid : vec3<u32>) {
  let globalId = gid.x;
  if (globalId >= uniforms.maxIndex) {
    return;
  }
  indexBuffer[globalId] = globalId;
}

//---------------------------------------------------------------------------
// kernel_2-2: flipSwapPixels
//   ランダムな近傍ピクセルと indexBuffer を交換して安定度指標を更新
//---------------------------------------------------------------------------
@compute @workgroup_size(64)
fn flipSwapPixels(@builtin(global_invocation_id) gid : vec3<u32>) {
  let globalId = gid.x;
  if (globalId >= uniforms2.colornum) {
    return;
  }

  let currentColor = uniforms2.nowcolor;
  let widthDiv3    = uniforms2.widthDiv3;
  let rngSeed1     = uniforms2.rngSeed1;
  let rngSeed2     = uniforms2.rngSeed2;
  let WIDTH        = uniforms.width;
  let HEIGHT       = uniforms.height;

  // (x,y)座標の計算
  let x = (globalId % widthDiv3) * 3u + (currentColor % 3u);
  let y = (globalId / widthDiv3) * 3u + (currentColor / 3u);

  // 近傍方向を乱数で選択
  var rngVal = xorshiftRng(rngSeed1 + globalId * rngSeed2);
  var direction = rngVal % 4u;
  var boundary = 0u;

  // 端の処理
  if (x == 0u)         { boundary += 1u; }
  if (y == 0u)         { boundary += 1u; }
  if (x == WIDTH - 1u) { boundary += 1u; }
  if (y == HEIGHT-1u)  { boundary += 1u; }

  if (boundary != 0u) {
    direction = rngVal % (4u - boundary);
    if (x == 0u && direction >= 1u) {
      direction += 1u;
    }
    if (x == WIDTH - 1u) {
      direction += 1u;
    }
    if (y == HEIGHT - 1u && direction >= 2u) {
      direction += 1u;
    }
  }

  // 近傍座標
  var neighborIndex : u32;
  if (direction == 3u) {
    neighborIndex = x + (y - 1u)*WIDTH;
  } else if (direction == 0u) {
    neighborIndex = (x + 1u) + y*WIDTH;
  } else if (direction == 1u) {
    neighborIndex = (x - 1u) + y*WIDTH;
  } else {
    neighborIndex = x + (y + 1u)*WIDTH;
  }

  let pixelIndex      = x + y * WIDTH;
  let valueAtIndex    = indexBuffer[pixelIndex];
  let valueAtNeighbor = indexBuffer[neighborIndex];

  // 移動前後のピクセルが "元の場所にいる" かどうかを計算
  let moved1Before = u32(select(0, 1, valueAtIndex     != pixelIndex));
  let moved2Before = u32(select(0, 1, valueAtNeighbor  != neighborIndex));

  // Swap
  indexBuffer[pixelIndex]    = valueAtNeighbor;
  indexBuffer[neighborIndex] = valueAtIndex;

  let moved1After = u32(select(0, 1, valueAtNeighbor   != pixelIndex));
  let moved2After = u32(select(0, 1, valueAtIndex      != neighborIndex));

  let deltaMove = (moved1After + moved2After) - (moved1Before + moved2Before);

  // AllScore[0] に加算 (場所がずれたピクセル数)
  atomicAdd(&AllScore[0], deltaMove);

  // 距離計算 (差分をAllScore[4],AllScore[5] に加算)
  let p0 = inPixelBuf[pixelIndex];
  let p1 = inPixelBuf[neighborIndex];
  let p2 = inPixelBuf[valueAtIndex];
  let p3 = inPixelBuf[valueAtNeighbor];

  let distVal02 = calcScaledRgbDistance(p0, p2);
  let distVal03 = calcScaledRgbDistance(p0, p3);
  let distVal13 = calcScaledRgbDistance(p1, p3);
  let distVal12 = calcScaledRgbDistance(p1, p2);

  let distVal: u32 = (distVal03 + distVal12) - (distVal02 + distVal13);

  var distValUp = 0u;
  if (distVal > 2147483647u) {
    distValUp = 4294967295u;
  }

  // 64bit 加算を2要素に分割
  let oldVal: u32 = atomicAdd(&AllScore[4], distVal);
  if (oldVal + distVal < distVal) {
    distValUp += 1u;
  }
  atomicAdd(&AllScore[5], distValUp);
}

//---------------------------------------------------------------------------
// kernel_3: calculateStabilityMetricTile
//   16x16タイルごとに SM を計算して AllScore の該当領域に書き込み
//---------------------------------------------------------------------------
@compute @workgroup_size(256)
fn calculateStabilityMetricTile(
  @builtin(global_invocation_id) gid : vec3<u32>,
  @builtin(workgroup_id) groupId : vec3<u32>,
  @builtin(local_invocation_id) localId : vec3<u32>
) {
  let xsize = uniforms.width / 16;
  let tilex = groupId.x % xsize;
  let tiley = groupId.x / xsize;
  let x = tilex * 16u + localId.x % 16u;
  let y = tiley * 16u + localId.x / 16u;

  let index = y * uniforms.width + x;
  let swappedIndex = indexBuffer[index];
  let originalColor = inPixelBuf[index];
  let swappedColor  = inPixelBuf[swappedIndex];

  // ローカル初期化
  if (localId.x == 0u){
    atomicStore(&localSum0, 0u);
    atomicStore(&localSum1, 0u);
  }
  localBuffer[localId.x] = originalColor;
  workgroupBarrier();

  // 元色と入れ替わり色との距離
  let distVal :u32 = calcScaledRgbDistance(originalColor, swappedColor) * 256u;

  // タイル内の全ピクセルと比較
  var score = 0u;
  for(var i=0; i<256; i+=1) {
    score = score + calcScaledRgbDistance(swappedColor, localBuffer[i]);
  }

  // 自分自身が入れ替わっていなければ score加算
  if (swappedIndex == index) {
    score = 0u;
  }

  var up = 0u;
  if (score < distVal) {
    up = up - 1u;
  }
  score = score - distVal;

  let oldVal = atomicAdd(&localSum0, score);
  if (oldVal + score < score) {
    up = up + 1u;
  }
  atomicAdd(&localSum1, up);
  workgroupBarrier();

  score = atomicLoad(&localSum0);
  up    = atomicLoad(&localSum1);

  // タイルごとの結果をAllScoreへ書き出し
  if (localId.x == 0) {
    atomicStore(&AllScore[groupId.x*2u + 6u + localId.x], score);
  }
  if (localId.x == 1) {
    atomicStore(&AllScore[groupId.x*2u + 6u + localId.x], up);
  }

  // タイルの可視化用 (明度を変化させて描画)
  var ucr = originalColor % 256u;
  var ucg = (originalColor / 256u) % 256u;
  var ucb = (originalColor / 65536u) % 256u;
  
  // ざっくり平均
  let totalcol = (ucr + ucg + ucb + 3u) / 6u;
  ucr = totalcol;
  ucg = totalcol;
  ucb = totalcol;

  score = score / 8388608u + up * 512u;
  if (up > 4u) {
    // upがマイナス相当の場合の簡易対処
    score = 0u;
  }

  ucr += score;
  ucg += score;
  if (ucr > 255u) { ucr = 255u; }
  if (ucg > 255u) { ucg = 255u; }
  if (ucb > 255u) { ucb = 255u; }

  let finalColor = ucr + ucg*256u + ucb*65536u + 255u*16777216u;
  dst[index] = finalColor;
}
`;

/*===========================================================================
 * メイン処理: 画像読み込み → WebGPUで処理 → 結果Canvasへ表示
 *===========================================================================*/
async function processImage(img) {
  // キャンバスに元画像を描画
  canvas.width  = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  // 元画像データを取得
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const bufferSize = imageData.data.byteLength;
  log(`[INFO] bufferSize = ${bufferSize}`);

  // WebGPUデバイス初期化
  const device = await initWebGPU();
  log("[WebGPU] デバイス取得成功");

  // バッファを作成
  const srcBuffer = createGPUBuffer(device, {
    size: bufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: "srcBuffer",
    mappedAtCreation: true,
    data: imageData.data.buffer,
  });

  const dstBuffer = createGPUBuffer(device, {
    size: bufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    label: "dstBuffer",
  });

  // u32二つ分 (合計値など)
  const sumBuffer = createGPUBuffer(device, {
    size: 8,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    label: "sumBuffer",
    data: new Uint32Array([0,0]).buffer,
  });

  // タイル数に応じた AllScore
  const tileCount = Math.floor(canvas.width / 16) * Math.floor(canvas.height / 16);
  const allScoreCount = 6 + tileCount * 2;
  const AllScore = createGPUBuffer(device, {
    size: 4 * allScoreCount,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    label: "AllScore",
    data: new Uint32Array(allScoreCount).fill(0).buffer,
  });

  // 画素数分の indexBuffer
  const indexBuffer = createGPUBuffer(device, {
    size: bufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    label: "indexBuffer",
    data: new Uint32Array(canvas.width * canvas.height).buffer,
  });

  // Uniforms
  const uniformData = {
    width:  canvas.width,
    height: canvas.height,
    rngSeed1: Rnd32bit(),
    rngSeed2: Rnd32bit(),
    maxIndex: (canvas.width * canvas.height),
  };

  // Uniforms用バッファに書き込み
  const uniformBufferSize = 4 * 16;
  const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  function writeUniforms() {
    const arr = new Uint32Array([
      uniformData.width,
      uniformData.height,
      uniformData.rngSeed1,
      uniformData.rngSeed2,
      uniformData.maxIndex,
    ]);
    device.queue.writeBuffer(uniformBuffer, 0, arr.buffer, arr.byteOffset, arr.byteLength);
  }
  writeUniforms();

  // Uniforms2 (色ごとの処理用)
  function writeUniforms2(color, cnum, widthDiv3) {
    const uniformData2 = {
      rngSeed1: Rnd32bit(),
      rngSeed2: Rnd32bit(),
      nowcolor: color,
      colornum: cnum,
      widthDiv3: widthDiv3,
    };
  
    const uniformBuffer2 = device.createBuffer({
      size: 4 * 5,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  
    const arr = new Uint32Array([
      uniformData2.rngSeed1,
      uniformData2.rngSeed2,
      uniformData2.nowcolor,
      uniformData2.colornum,
      uniformData2.widthDiv3,
    ]);
    device.queue.writeBuffer(uniformBuffer2, 0, arr.buffer, arr.byteOffset, arr.byteLength);
    return uniformBuffer2;
  }

  // uniformBuffer2のバッファをまとめて生成
  const uniformBuffers2 = [];
  const workitemnum = [];

  for (let i = 0; i < 6; i++) {
    const rand9Val = random9();
    const c9Val = colcount(canvas.width, canvas.height);
    for (let j = 0; j < 9; j++) {
      let WidthDiv3 = Math.floor(canvas.width / 3);
      if (canvas.width % 3 > rand9Val[j] % 3) {
        WidthDiv3++;
      }
      uniformBuffers2.push(writeUniforms2(rand9Val[j], c9Val[j], WidthDiv3));
      workitemnum.push(c9Val[j]);
    }
  }

  // シェーダーモジュールを作成
  const shaderModule = device.createShaderModule({ code: shaderCode });

  // バインドグループレイアウト
  const bindGroupLayout0 = createBindGroupLayout0(device);
  const bindGroupLayout1 = createBindGroupLayout1(device);

  // Computeパイプライン作成用のヘルパー
  function createComputePipeline(entryPoint, layout) {
    return device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: layout }),
      compute: {
        module: shaderModule,
        entryPoint: entryPoint,
      },
    });
  }

  // 各カーネル用のパイプライン
  const computePipeline0 = createComputePipeline("main", [bindGroupLayout0]);
  const computePipeline1 = createComputePipeline("randomSharedMemoryAccess", [bindGroupLayout0]);
  const computePipeline2 = createComputePipeline("indexinit", [bindGroupLayout0]);
  const computePipeline3 = createComputePipeline("flipSwapPixels", [bindGroupLayout0, bindGroupLayout1]);
  const computePipeline4 = createComputePipeline("calculateStabilityMetricTile", [bindGroupLayout0]);

  // バインドグループ
  const bindGroup0 = device.createBindGroup({
    layout: bindGroupLayout0,
    entries: [
      { binding: 0, resource: { buffer: srcBuffer } },
      { binding: 1, resource: { buffer: dstBuffer } },
      { binding: 2, resource: { buffer: uniformBuffer } },
      { binding: 3, resource: { buffer: AllScore } },
      { binding: 4, resource: { buffer: indexBuffer } },
    ],
  });

  /*--------------------------------------------------------------------------
   * 1. 色反転 → <dc>計算 → index初期化
   *------------------------------------------------------------------------*/
  const commandEncoder = device.createCommandEncoder();
  const passEncoder = commandEncoder.beginComputePass();

  // kernel_0: 色反転
  passEncoder.setPipeline(computePipeline0);
  passEncoder.setBindGroup(0, bindGroup0);
  const pixelCount = canvas.width * canvas.height;
  const workgroupSize = 64;
  passEncoder.dispatchWorkgroups(Math.ceil(pixelCount / workgroupSize));

  // kernel_1: randomSharedMemoryAccess
  passEncoder.setPipeline(computePipeline1);
  const randomSampling = 2048;
  passEncoder.dispatchWorkgroups(randomSampling);

  // kernel_2-1: indexinit
  passEncoder.setPipeline(computePipeline2);
  passEncoder.dispatchWorkgroups(Math.ceil(pixelCount / workgroupSize));

  passEncoder.end();
  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();

  /*--------------------------------------------------------------------------
   * 2. メインループ: flipSwapPixels を複数回実行し収束判定
   *------------------------------------------------------------------------*/
  const readAllScore = device.createBuffer({
    size: 4 * allScoreCount,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  let lastdeltaS = 0.0;
  let mean_dc    = 0.0;

  for (let i = 0; i < uniformBuffers2.length; i++) {
    const commandEncoder2 = device.createCommandEncoder();
    const passEncoder2 = commandEncoder2.beginComputePass();

    const bindGroup1 = device.createBindGroup({
      layout: bindGroupLayout1,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffers2[i] } },
      ],
    });

    passEncoder2.setPipeline(computePipeline3);
    passEncoder2.setBindGroup(0, bindGroup0);
    passEncoder2.setBindGroup(1, bindGroup1);
    passEncoder2.dispatchWorkgroups(Math.ceil(workitemnum[i] / 64));

    passEncoder2.end();

    // AllScoreを読み取り用バッファにコピー
    commandEncoder2.copyBufferToBuffer(
      AllScore, 0,
      readAllScore, 0,
      4 * allScoreCount
    );
    device.queue.submit([commandEncoder2.finish()]);
    await device.queue.onSubmittedWorkDone();

    // AllScoreから値を取得
    await readAllScore.mapAsync(GPUMapMode.READ);
    const allScoreArrayBuffer = readAllScore.getMappedRange();
    const allScoreVal = new Uint32Array(allScoreArrayBuffer);

    // [0,1] → allScore0(ulong), [2,3] → allScore1(ulong), [4,5] → allScore2(ulong)
    const allScore0 = BigInt(allScoreVal[1]) * BigInt(0x100000000) + BigInt(allScoreVal[0]);
    const allScore1 = BigInt(allScoreVal[3]) * BigInt(0x100000000) + BigInt(allScoreVal[2]);
    const allScore2 = BigInt(allScoreVal[5]) * BigInt(0x100000000) + BigInt(allScoreVal[4]);

    // <dc> の計算
    mean_dc = Number(allScore1) / Number(randomSampling) / Number(256 * 2 * 65536);

    // StructuralStability
    const StructuralStability = Number(allScore2) / 65536.0 / canvas.width / canvas.height;
    // StructuralStability*
    const StructuralStabilityAsterisk = mean_dc * Number(allScore0) / canvas.width / canvas.height;

    const deltaS = StructuralStabilityAsterisk - StructuralStability;
    readAllScore.unmap();

    // 収束判定
    if (lastdeltaS > deltaS) {
      break;
    }
    lastdeltaS = deltaS;
  }

  sumDisplay.textContent = `ΔSM = ${lastdeltaS}`;
  dcDisplay.textContent = `〈dc〉 = ${mean_dc}`;
  log(`[INFO] deltaS = ${lastdeltaS}`);
  log(`[INFO] <dc> = ${mean_dc}`);

  /*--------------------------------------------------------------------------
   * 3. タイルごとの ΔSM 可視化: calculateStabilityMetricTile
   *------------------------------------------------------------------------*/
  const commandEncoder3 = device.createCommandEncoder();
  const passEncoder3 = commandEncoder3.beginComputePass();

  passEncoder3.setPipeline(computePipeline4);
  passEncoder3.setBindGroup(0, bindGroup0);

  const tileWorkgroups = Math.floor(canvas.width / 16) * Math.floor(canvas.height / 16);
  passEncoder3.dispatchWorkgroups(tileWorkgroups);

  passEncoder3.end();

  // 処理結果 (dstBuffer) → 読み取り用バッファへコピー
  const readBackBuffer = device.createBuffer({
    size: bufferSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  commandEncoder3.copyBufferToBuffer(dstBuffer, 0, readBackBuffer, 0, bufferSize);
  device.queue.submit([commandEncoder3.finish()]);
  await device.queue.onSubmittedWorkDone();

  // 結果をCanvasに反映
  await readBackBuffer.mapAsync(GPUMapMode.READ);
  const mappedRange = readBackBuffer.getMappedRange();
  const invertedData = new Uint8ClampedArray(new Uint8Array(mappedRange));
  readBackBuffer.unmap();

  if (invertedData.byteLength === 0) {
    console.error("[ERROR] invertedData is empty");
  } else {
    const invertedImageData = new ImageData(invertedData, canvas.width, canvas.height);
    ctx.putImageData(invertedImageData, 0, 0);
  }
}

/*===========================================================================
 * ドラッグ＆ドロップ / ファイル選択 イベント設定
 *===========================================================================*/
dropArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropArea.classList.add('hover');
});

dropArea.addEventListener("dragleave", () => {
  dropArea.classList.remove('hover');
});

dropArea.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", async () => {
  if (fileInput.files.length === 0) return;
  const file = fileInput.files[0];
  if (!file.type.startsWith("image/")) {
    alert("画像ファイルを選択してください。");
    return;
  }
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();
  log("Image loaded successfully.");
  processImage(img);
});

dropArea.addEventListener("drop", async (e) => {
  e.preventDefault();
  dropArea.classList.remove('hover');

  const file = e.dataTransfer.files[0];
  if (!file || !file.type.startsWith("image/")) {
    alert("画像ファイルをドロップしてください。");
    return;
  }
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();
  log("Image loaded successfully.");
  processImage(img);
});
