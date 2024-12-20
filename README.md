# Image Stability 解析

## このプロジェクトについて
このプロジェクトは、[PNAS誌に掲載された論文](https://www.pnas.org/doi/10.1073/pnas.2406735121)のアイディアに基づいています。また、[論文著者がGoogle Driveに公開したコード](https://x.com/potato7192/status/1868859454139306454)を参考にして実装されています。  
  
このPythonプロジェクトは、**DeltaS_M**と呼ばれる構造的安定性指標を用いて、画像の「くっきりさ」を定量化するツールを提供します。この指標は、ピクセルのランダムなフリップやシャッフル操作により、画像の構造がどのように劣化するかを解析計算できます。  
  
関連記事 [絵文字と物理学　画像の「くっきりさ」を数値化する手法を開発](https://www.oist.jp/ja/news-center/news/2024/12/13/physics-and-emote-design-quantifying-clarity-digital-images)  
関連記事 [OIST、デジタル画像の「視覚的な鮮明さ」を定量的に評価する手法を提案](https://news.mynavi.jp/techplus/article/20241217-3088143/)  

### 実行時イメージ
![image35](https://github.com/user-attachments/assets/6329274a-68ad-4f38-bce3-b93d9743e612)  

## 特徴
- ユーザーが指定した画像を読み込み。
- 入力画像のシャノンエントロピーを計算。
- ピクセルのランダムな反転やシャッフルを適用し、構造の劣化を評価。
- **DeltaS_M**とその構成要素を計算し、可視化。
- 解析過程での画像（反転画像や色距離マップ）を出力。

## 必要要件
以下のPythonライブラリをインストールしてください：
- `numpy`
- `Pillow`
- `matplotlib`

以下のコマンドでライブラリをインストールできます：
```bash
pip install numpy pillow matplotlib
```

## 使い方
1. リポジトリをクローンするか、スクリプト `ImageStability.py` をダウンロードしてください。
2. 解析したい画像をスクリプトと同じディレクトリに配置してください。
3. スクリプト内の `image_name` 変数に画像ファイル名を指定してください（デフォルト: `Lenna.png`）。
4. スクリプトを実行してください：
```bash
python ImageStability.py
```

### 入力
- PNGやJPEGなどの一般的な画像フォーマットをサポートしています。

### 出力
- **DeltaS_M**: 入力画像のくっきりさを定量化したスカラー値。
- **シャノンエントロピー**: 画像の情報量を表す値。
- 可視化結果：
  - 反転画像とシャッフル画像。
  - 安定性指標（ΔS）、オリジナルスコア（S）、シャッフルスコア（S*）を示すグラフ。
- 保存ファイル：
  - `image_name_shuffled.png`: シャッフルされた画像。
  - `image_name_flipped_<iteration>.png`: 各イテレーションでの反転画像。
  - `image_name_color_distance_map_<iteration>.png`: 各イテレーションでの色距離マップ。
  - `image_name_stabilityMetric.txt`: 安定性指標のデータ。

### 例
画像 `Lenna.png` を指定すると、以下の結果が得られます：
- DeltaS_M: **0.16198269**（例値）
- ΔS、S、S* を示すグラフ。
- 反転画像とシャッフル画像がカレントディレクトリに保存されます。

### グラフ
1. **構造的安定性解析**:
   - ΔS（安定性指標） vs. 反転数/総ピクセル数（対数スケール）。
2. **スコア比較**:
   - オリジナル画像スコア（S）とシャッフル画像スコア（S*）。
3. **全体グラフ**:
   - ΔS、S、S* をまとめて表示。

## さっそく使ってみた  
これは今作っているゲームのスクリーンショットだ。ゲームイベントに出展するときにプレイ画面のスクショの提出が求められる。インパクトがあるシーンが望まれるのだが、この解析を使えばインパクトのある絵を定量化できるのではないか  
![games](https://github.com/user-attachments/assets/8bc44fbf-dc48-4cfc-809f-29bc7adcd151)  
2枚のシーンを用意した。いろいろ悩んで左の炎が目立つシーンをスクショとして提出したのだが、ΔSMを計算するとやはり左のほうが良さそうであることがわかる。  
これを応用すれば、将来的にゲームの”絵作り”にも使えそうな気がする。今まで感覚のみに頼っていたことが数値化できるのはデカい！ 

## ライセンス(License)
このプロジェクトコードはMITライセンスの下で公開されています。コードの利用、変更、再配布は自由に行えます。  
This project code is licensed under the MIT License.  

---

---

# Image Stability Analysis

## About This Project
This project is based on the idea presented in a [paper published in PNAS](https://www.pnas.org/doi/10.1073/pnas.2406735121). Additionally, the implementation was inspired by [code shared by the authors on Google Drive](https://x.com/potato7192/status/1868859454139306454).  
  
This Python project provides a tool to quantify the "sharpness" of an image using a structural stability metric called **DeltaS_M**. The metric is computed by analyzing how the structure of an image degrades when subjected to pixel flipping and shuffling operations.
  
## Features
- Loads a user-provided image.
- Calculates Shannon entropy for the input image.
- Applies random pixel flips and shuffling to evaluate structural degradation.
- Computes and visualizes the stability metric (**DeltaS_M**) and its components.
- Outputs visualizations of the analysis process, including flipped images and color distance maps.

## Requirements
To run the script, ensure you have the following Python packages installed:
- `numpy`
- `Pillow`
- `matplotlib`

You can install these packages using pip:
```bash
pip install numpy pillow matplotlib
```

## Usage
1. Clone the repository or download the script `ImageStability.py`.
2. Place the image you want to analyze in the same directory as the script.
3. Open the script and specify the image file name in the `image_name` variable (default: `Lenna.png`).
4. Run the script:
```bash
python ImageStability.py
```

### Input
- The script accepts an image file in standard formats (e.g., PNG, JPEG).

### Output
- **DeltaS_M**: A scalar value quantifying the sharpness of the input image.
- **Shannon Entropy**: A measure of the information content in the image.
- Visualizations:
  - Flipped images and shuffled images.
  - Graphs showing the stability metric (ΔS), original scores (S), and shuffled scores (S*).
- Saved files:
  - `image_name_shuffled.png`: Shuffled version of the input image.
  - `image_name_flipped_<iteration>.png`: Flipped image at specific iterations.
  - `image_name_color_distance_map_<iteration>.png`: Color distance map at specific iterations.
  - `image_name_stabilityMetric.txt`: Stability metric data.

### Example
If the image `Lenna.png` is provided, the script computes and outputs the following:
- DeltaS_M: **0.4276** (example value)
- Graphs illustrating ΔS, S, and S*.
- Flipped and shuffled images saved to the current directory.

### Graphs
1. **Structural Stability Analysis**:
   - ΔS (Stability Metric) vs. Number of Flips / Total Pixels (log scale).
2. **Scores Comparison**:
   - Original image score (S) and shuffled image score (S*).
3. **Combined Graph**:
   - ΔS, S, and S* in a single visualization.

## Explanation of DeltaS_M
(Generated by Chat GPT 4o)
The metric **DeltaS_M** represents the structural stability of the image. It quantifies how resistant the image's structure is to random pixel perturbations. A higher DeltaS_M indicates greater sharpness and structural integrity.

## License
This project code is licensed under the MIT License. Feel free to use, modify, and distribute the code as needed.

---
