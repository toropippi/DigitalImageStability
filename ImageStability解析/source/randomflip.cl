// Xorshift ランダム生成関数
uint xorshiftRng(uint rngState) {
    rngState ^= rngState << 13;
    rngState ^= rngState >> 17;
    rngState ^= rngState << 5;
    return rngState;
}

// RGB の差分をもとにスケーリングした距離値を返す (L2距離 + α)
uint calcScaledRgbDistance(uint colorA, uint colorB) {
    uint rA = colorA % 256;
    uint gA = colorA / 256     % 256;
    uint bA = colorA / 65536   % 256;
    uint rB = colorB % 256;
    uint gB = colorB / 256     % 256;
    uint bB = colorB / 65536   % 256;

    // rsqrt(3)/255 → (およそ0.0022641187...) を掛けている
    // 65536.0倍した値を返しているため、float→uintへキャスト時の +0.5 誤差対策
    return (uint)(
        0.5
        + 65536.0 * 0.00226411870270441476278097560981
          * sqrt((float)((rB-rA)*(rB-rA) + (gB-gA)*(gB-gA) + (bB-bA)*(bB-bA)))
    );
}

__kernel void convertPixelFormat(
    __global uchar *inUchar,
    __global uint  *outUint,
    int width,
	int height
) {
    int x = get_global_id(0) % width;
    int y = get_global_id(0) / width;

    // padding 考慮
    int inIndex  = y * ((width * 3 + 3) & ~3) + x * 3;
    int outIndex = (height-1-y) * width + x;

    // R,G,B 3バイト → 1ピクセル(32bit) へ格納
    // outUint = [B(青) + G(緑)<<8 + R(赤)<<16]
    outUint[outIndex] =
         inUchar[inIndex + 2]
       + inUchar[inIndex + 1] * 256
       + inUchar[inIndex + 0] * 65536;
}


__kernel void randomSharedMemoryAccess(
    __global uint *inPixelBuf,      // グローバルメモリ入力
    __global uint *AllScore, // グローバルメモリ出力, ulong*2
    uint inputSize,
    uint rngSeed1,
    uint rngSeed2
) {
    // スレッドID
    int globalId = get_global_id(0);
    int localId  = get_local_id(0);

    // ローカルメモリ定義
    __local uint localBuffer[256];
    __local uint localSum[2];

    // 初期化
    if (localId < 2) localSum[localId] = 0;

    // Xorshift初期化 (スレッド固有)
    uint state = rngSeed1 + globalId * rngSeed2;

    // ランダムインデックスを求め、共有メモリに書き込む
    state            = xorshiftRng(state);
    uint randIndex   = state % inputSize;
    uint myPixel     = inPixelBuf[randIndex];
    localBuffer[localId] = myPixel;

    barrier(CLK_LOCAL_MEM_FENCE);

    // 近傍のピクセルサンプル
    uint pixelNeighbor1 = localBuffer[(localId + 1)  % 256];
    uint pixelNeighbor2 = localBuffer[(localId + 11) % 256];

    // 距離を2つ分加算
    uint distVal = 0;
    distVal += calcScaledRgbDistance(myPixel, pixelNeighbor1);
    distVal += calcScaledRgbDistance(myPixel, pixelNeighbor2);

    // 64bit加算を疑似的に扱うため、オーバーフローを2要素目にカウント
    uint oldVal = atomic_add(&localSum[0], distVal);
    if ((oldVal + distVal) < distVal) {
        atomic_add(&localSum[1], 1);
    }

    barrier(CLK_LOCAL_MEM_FENCE);

    // ローカル代表スレッドが結果をグローバルに書き出し
    if (localId == 0) {
        distVal = localSum[0];
        oldVal  = atomic_add(&AllScore[2], distVal);
        if ((oldVal + distVal) < distVal) {
            localSum[1]++;
        }
        distVal = localSum[1];
        atomic_add(&AllScore[3], distVal);
    }
}


/////////////////ver1
/*
__kernel void flipSwapPixels(
    __global uint *pixelData,
    __global int  *originalPosCount,
    uint  currentColor,
    uint  widthDiv3,
    uint  rngSeed1,
    uint  rngSeed2,
    uint  WIDTH,
    uint  HEIGHT,
    int   maxIndex
) {
    int globalId = get_global_id(0);
    if (globalId >= maxIndex) return;

    int x = (globalId % widthDiv3) * 3 + (currentColor % 3);
    int y = (globalId / widthDiv3) * 3 + (currentColor / 3);

    uint rngVal    = xorshiftRng(rngSeed1 + globalId * rngSeed2);
    uint direction = rngVal % 4;
    uint boundary  = 0;

    if (x == 0)         boundary++;
    if (y == 0)         boundary++;
    if (x == WIDTH -1)  boundary++;
    if (y == HEIGHT-1)  boundary++;

    if (boundary != 0) {
        direction = rngVal % (4 - boundary);
        if (x == 0 && direction >= 1) {
            direction++;
        }
        if (x == WIDTH-1) {
            direction++;
        }
        if (y == HEIGHT-1 && direction >= 2) {
            direction++;
        }
    }

    uint neighborIndex;
    switch (direction) {
        case 0: neighborIndex = (x + 1) +  y      * WIDTH; break;
        case 1: neighborIndex = (x - 1) +  y      * WIDTH; break;
        case 2: neighborIndex =  x      + (y + 1) * WIDTH; break;
        default: neighborIndex=  x      + (y - 1) * WIDTH; break;
    }

    uint pixelIndex         = x + y * WIDTH;
    uint valueAtIndex       = pixelData[pixelIndex];
    uint valueAtNeighbor    = pixelData[neighborIndex];

    int moved1Before = (valueAtIndex    != pixelIndex);
    int moved2Before = (valueAtNeighbor != neighborIndex);

    // Swap
    pixelData[pixelIndex]       = valueAtNeighbor;
    pixelData[neighborIndex]    = valueAtIndex;

    int moved1After = (valueAtNeighbor  != pixelIndex);
    int moved2After = (valueAtIndex     != neighborIndex);

    int deltaMove = (moved1After + moved2After) - (moved1Before + moved2Before);
    atomic_add(&originalPosCount[0], deltaMove);
}
*/



/////////////////ver2
/*
__kernel void flipSwapPixels(
    __global uint *indexBuffer,
    __global uint *originalPixelBuf,
    __global int  *originalPosCount,
    __global uint *meanRgbDistance, // ulong*2 を4要素として利用
    uint  currentColor,
    uint  widthDiv3,
    uint  rngSeed1,
    uint  rngSeed2,
    uint  WIDTH,
    uint  HEIGHT,
    int   maxIndex
) {
    int globalId = get_global_id(0);
    if (globalId >= maxIndex) return;

    int x = (globalId % widthDiv3) * 3 + (currentColor % 3);
    int y = (globalId / widthDiv3) * 3 + (currentColor / 3);

    uint rngVal    = xorshiftRng(rngSeed1 + globalId * rngSeed2);
    uint direction = rngVal % 4;
    uint boundary  = 0;

    if (x == 0)         boundary++;
    if (y == 0)         boundary++;
    if (x == WIDTH -1)  boundary++;
    if (y == HEIGHT-1)  boundary++;

    if (boundary != 0) {
        direction = rngVal % (4 - boundary);
        if (x == 0 && direction >= 1) {
            direction++;
        }
        if (x == WIDTH-1) {
            direction++;
        }
        if (y == HEIGHT-1 && direction >= 2) {
            direction++;
        }
    }

    uint neighborIndex;
    switch (direction) {
        case 0: neighborIndex = (x + 1) +  y      * WIDTH; break;
        case 1: neighborIndex = (x - 1) +  y      * WIDTH; break;
        case 2: neighborIndex =  x      + (y + 1) * WIDTH; break;
        default: neighborIndex=  x      + (y - 1) * WIDTH; break;
    }

    uint pixelIndex         = x + y * WIDTH;
    uint valueAtIndex       = indexBuffer[pixelIndex];
    uint valueAtNeighbor    = indexBuffer[neighborIndex];

    int moved1Before = (valueAtIndex    != pixelIndex);
    int moved2Before = (valueAtNeighbor != neighborIndex);

    // Swap
    indexBuffer[pixelIndex]       = valueAtNeighbor;
    indexBuffer[neighborIndex]    = valueAtIndex;

    int moved1After = (valueAtNeighbor  != pixelIndex);
    int moved2After = (valueAtIndex     != neighborIndex);

    int deltaMove = (moved1After + moved2After) - (moved1Before + moved2Before);
    atomic_add(&originalPosCount[0], deltaMove);
	
	//StabilityMetric_calc
	//valueAtIndex
	//valueAtNeighbor
	//pixelIndex
	//neighborIndex
	
	uint p0=originalPixelBuf[pixelIndex];
	uint p1=originalPixelBuf[neighborIndex];
	uint p2=originalPixelBuf[valueAtIndex];
	uint p3=originalPixelBuf[valueAtNeighbor];
	
	//swap1
    // 距離を計算
    uint distVal02 = calcScaledRgbDistance(p0, p2);
	uint distVal03 = calcScaledRgbDistance(p0, p3);
	//swap2
    // 距離を計算
	uint distVal13 = calcScaledRgbDistance(p1, p3);
    uint distVal12 = calcScaledRgbDistance(p1, p2);
	
	
	uint distVal=-distVal02+distVal03-distVal13+distVal12;
	uint distValup=0;
	if (distVal>(2147483647U))distValup=-1;
	// 結果をグローバルに加算
	uint oldVal  = atomic_add(&meanRgbDistance[2], distVal);
	if ((oldVal + distVal) < distVal) {
		distValup++;
	}
	atomic_add(&meanRgbDistance[3], distValup);
	
}
*/





/////////////////ver3
__kernel void flipSwapPixels(
    __global uint *indexBuffer,
    __global uint *originalPixelBuf,
    __global uint  *AllScore,
    uint  currentColor,
    uint  widthDiv3,
    uint  rngSeed1,
    uint  rngSeed2,
    uint  WIDTH,
    uint  HEIGHT,
    int   maxIndex
) {
    int globalId = get_global_id(0);
    if (globalId >= maxIndex) return;

    int x = (globalId % widthDiv3) * 3 + (currentColor % 3);
    int y = (globalId / widthDiv3) * 3 + (currentColor / 3);

    uint rngVal    = xorshiftRng(rngSeed1 + globalId * rngSeed2);
    uint direction = rngVal % 4;
    uint boundary  = 0;

    if (x == 0)         boundary++;
    if (y == 0)         boundary++;
    if (x == WIDTH -1)  boundary++;
    if (y == HEIGHT-1)  boundary++;

    if (boundary != 0) {
        direction = rngVal % (4 - boundary);
        if (x == 0 && direction >= 1) {
            direction++;
        }
        if (x == WIDTH-1) {
            direction++;
        }
        if (y == HEIGHT-1 && direction >= 2) {
            direction++;
        }
    }

    uint neighborIndex;
    switch (direction) {
        case 0: neighborIndex = (x + 1) +  y      * WIDTH; break;
        case 1: neighborIndex = (x - 1) +  y      * WIDTH; break;
        case 2: neighborIndex =  x      + (y + 1) * WIDTH; break;
        default: neighborIndex=  x      + (y - 1) * WIDTH; break;
    }

    uint pixelIndex         = x + y * WIDTH;
    uint valueAtIndex       = indexBuffer[pixelIndex];
    uint valueAtNeighbor    = indexBuffer[neighborIndex];

    int moved1Before = (valueAtIndex    != pixelIndex);
    int moved2Before = (valueAtNeighbor != neighborIndex);

    // Swap
    indexBuffer[pixelIndex]       = valueAtNeighbor;
    indexBuffer[neighborIndex]    = valueAtIndex;

    int moved1After = (valueAtNeighbor  != pixelIndex);
    int moved2After = (valueAtIndex     != neighborIndex);

    int deltaMove = (moved1After + moved2After) - (moved1Before + moved2Before);
    atomic_add(&AllScore[0], deltaMove);
	
	//StabilityMetric_calc
	//valueAtIndex
	//valueAtNeighbor
	//pixelIndex
	//neighborIndex
	
	uint p0=originalPixelBuf[pixelIndex];
	uint p1=originalPixelBuf[neighborIndex];
	uint p2=originalPixelBuf[valueAtIndex];
	uint p3=originalPixelBuf[valueAtNeighbor];
	
	//swap1
    // 距離を計算
    uint distVal02 = calcScaledRgbDistance(p0, p2);
	uint distVal03 = calcScaledRgbDistance(p0, p3);
	//swap2
    // 距離を計算
	uint distVal13 = calcScaledRgbDistance(p1, p3);
    uint distVal12 = calcScaledRgbDistance(p1, p2);
	
	
	uint distVal=-distVal02+distVal03-distVal13+distVal12;
	uint distValup=0;
	if (distVal>(2147483647U))distValup=-1;
	// 結果をグローバルに加算
	uint oldVal  = atomic_add(&AllScore[4], distVal);
	if ((oldVal + distVal) < distVal) {
		distValup++;
	}
	atomic_add(&AllScore[5], distValup);
	
}




//16x16タイルでSM計算
//localsize=256
__kernel void calculateStabilityMetricTile(
    __global uint *indexBuffer,
    __global uint *originalPixelBuf,
    __global uint  *AllScore,
    uint WIDTH,
    uint WIDTHOriginal
) {
	uint groupid = get_group_id(0);
	uint x=groupid%WIDTH;
	uint y=groupid/WIDTH;
	x*=16;
	y*=16;
    uint localId  = get_local_id(0);
	x+=localId%16;
	y+=localId/16;
    uint globalId = get_global_id(0);
	uint index=x+y*WIDTHOriginal;
	
    // indexBuffer から実際に参照するピクセル
    uint swappedIndex  = indexBuffer[index];
    uint originalColor = originalPixelBuf[index];
    uint swappedColor  = originalPixelBuf[swappedIndex];
	
    __local uint localBuffer[256];
    __local uint localSum[2];
	if (localId<2)localSum[localId]=0;
	
	localBuffer[localId] = originalColor;
	
    // 距離を計算
    uint distVal = calcScaledRgbDistance(originalColor, swappedColor);
	distVal*=256;
    barrier(CLK_LOCAL_MEM_FENCE);
	
	uint score=0;
	for(int i=0;i<256;i++)
	{
		score+=calcScaledRgbDistance(swappedColor, localBuffer[i]);
	}
	if (index==swappedIndex)score=0;
	uint up=0;
	if (score<distVal)up=-1;
	score-=distVal;
	

    // 64bit加算の下位・上位として分割
    uint oldVal = atomic_add(&localSum[0], score);
    if ((oldVal + score) < score) {
        up+=1;
    }
	atomic_add(&localSum[1], up);
	
	
	barrier(CLK_LOCAL_MEM_FENCE);
	// ローカル代表スレッドが結果をグローバルに加算
	if (localId < 2) {
		AllScore[groupid*2+6+localId]=localSum[localId];
	}
}


























/*
__kernel void calculateStabilityMetric(
    __global uint *indexBuffer,
    __global uint *originalPixelBuf,
    __global int  *originalPosCount,
    __global uint *meanRgbDistance, // ulong*2 を4要素として利用
    uint WIDTH,
    uint HEIGHT
) {
    uint globalId = get_global_id(0);
    if (globalId >= (WIDTH * HEIGHT)) return;

    // ローカルメモリ
    uint localId  = get_local_id(0);
    __local uint localSum[2];
    if (localId < 2) localSum[localId] = 0;

    // indexBuffer から実際に参照するピクセル
    uint swappedIndex  = indexBuffer[globalId];
    uint originalColor = originalPixelBuf[globalId];
    uint swappedColor  = originalPixelBuf[swappedIndex];

    // 距離を計算
    uint distVal = calcScaledRgbDistance(originalColor, swappedColor);

    // 64bit加算の下位・上位として分割
    uint oldVal = atomic_add(&localSum[0], distVal);
    if ((oldVal + distVal) < distVal) {
        atomic_add(&localSum[1], 1);
    }

    barrier(CLK_LOCAL_MEM_FENCE);
    // ローカル代表スレッドが結果をグローバルに加算
    if (localId == 0) {
        distVal = localSum[0];
        oldVal  = atomic_add(&meanRgbDistance[2], distVal);
        if ((oldVal + distVal) < distVal) {
            localSum[1]++;
        }
        distVal = localSum[1];
        atomic_add(&meanRgbDistance[3], distVal);
    }
}
*/