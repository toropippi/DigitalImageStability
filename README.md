# Image Stability 解析 / Image Stability Analysis

[WebGPU版/ WebGPU Version](https://toropippi.github.io/DigitalImageStability/)

https://github.com/user-attachments/assets/b667e8a7-d475-4587-b613-0a6b45acdb10

---

## このプロジェクトについて / About This Project
このプロジェクトは、[PNAS誌に掲載された論文](https://www.pnas.org/doi/10.1073/pnas.2406735121)のアイディアに基づいています。また、[論文著者がGoogle Driveに公開したコード](https://x.com/potato7192/status/1868859454139306454)を参考にして実装されています。  
This project is based on the idea presented in a [paper published in PNAS](https://www.pnas.org/doi/10.1073/pnas.2406735121). The implementation was inspired by [code shared by the authors on Google Drive](https://x.com/potato7192/status/1868859454139306454).  

現在、このプロジェクトには以下の3種類のバージョンがあります：  
Currently, there are three versions available for this project:  
1. **WebGPU版 / WebGPU Version**: [ブラウザ上](https://toropippi.github.io/DigitalImageStability/)で動作するインストール不要のバージョン / Browser-based version requiring no installation.  
2. **exe版 / exe Version**: Windows向けの実行可能ファイル / Executable file for Windows.  
3. **Python版 / Python Version**: スクリプトとして直接利用可能なバージョン / Script-based version for direct use.  

このツールは、画像の構造的安定性指標である **DeltaS_M** を用いて画像の「くっきりさ」を数値化します。また、ピクセルのランダムなフリップやシャッフルを利用して画像構造の劣化を解析します。  
This tool quantifies the "sharpness" of an image using the structural stability metric **DeltaS_M** and analyzes structural degradation caused by random pixel flipping and shuffling.  

関連記事 / Related Articles:  
- [絵文字と物理学：画像の「くっきりさ」を数値化する手法を開発](https://www.oist.jp/ja/news-center/news/2024/12/13/physics-and-emote-design-quantifying-clarity-digital-images)  
- [OIST提案：デジタル画像の視覧的鮮明さを定量的に評価する手法](https://news.mynavi.jp/techplus/article/20241217-3088143/)  

---

## バージョンの使い方 / How to Use Each Version

### WebGPU版 / WebGPU Version
- 一番手軽に使える  
- [こちら](https://toropippi.github.io/DigitalImageStability/)にアクセスして画像をドラッグ＆ドロップしてください / Access the [URL](https://toropippi.github.io/DigitalImageStability/) and upload the image for analysis.
- [**デモムービー**](https://github.com/user-attachments/assets/b667e8a7-d475-4587-b613-0a6b45acdb10)を参考にしてください / Refer to [**the demo movie**](https://github.com/user-attachments/assets/b667e8a7-d475-4587-b613-0a6b45acdb10).  

### exe版 / exe Version
- リアルタイムに数値の変化をみたい人向け  
1. [リリースページ](https://github.com/toropippi/DigitalImageStability/tree/main/%E3%83%87%E3%82%B8%E3%82%BF%E3%83%AB%E3%82%A4%E3%83%A1%E3%83%BC%E3%82%B8%E3%81%8F%E3%81%A3%E3%81%8D%E3%82%8A%E3%81%95%E8%A7%A3%E6%9E%90%E3%83%84%E3%83%BC%E3%83%AB)からフォルダごとダウンロードしてください / Download from [Releases](https://github.com/toropippi/DigitalImageStability/tree/main/%E3%83%87%E3%82%B8%E3%82%BF%E3%83%AB%E3%82%A4%E3%83%A1%E3%83%BC%E3%82%B8%E3%81%8F%E3%81%A3%E3%81%8D%E3%82%8A%E3%81%95%E8%A7%A3%E6%9E%90%E3%83%84%E3%83%BC%E3%83%AB).  

![exe](https://github.com/user-attachments/assets/5082f128-f0a9-4476-afa2-4c95ec9fc38a)

### Python版 / Python Version
- 詳細実装を知りたい人向け  
1. 以下のPythonライブラリをインストールしてください / Install the following Python libraries:  
   ```bash
   pip install numpy pillow matplotlib
   ```
2. リポジトリをクローンするか`ImageStability.py`をダウンロードしてください / Clone the repository or download `ImageStability.py`.  
3. スクリプトと同じフォルダに画像を置き、`image_name`を指定して実行してください。デフォルトの画像がすでにあるので活用ください。 / Place the image in the same folder as the script and specify `image_name` before executing. Please take advantage of the default images already available:  
   ```bash
   python ImageStability.py
   ```

---

## 出力例 / Output Examples
- 保存ファイル：
  - `image_name_shuffled.png`: シャッフルされた画像。
  - `image_name_flipped_<iteration>.png`: 各イテレーションでの反転画像。
  - `image_name_color_distance_map_<iteration>.png`: 各イテレーションでの色距離マップ。
  - `image_name_stabilityMetric.txt`: 安定性指標のデータ。

### 実行時イメージ
![36](https://github.com/user-attachments/assets/12da3412-1ec8-4c4d-82c3-9cf7e1f48426)  


## さっそく個人的に使ってみた  
これは今作っているゲームのスクリーンショットだ。ゲームイベントに出展するときにプレイ画面のスクショの提出が求められる。インパクトがあるシーンが望まれるのだが、この解析を使えばインパクトのある絵を定量化できるのではないか  
![games](https://github.com/user-attachments/assets/8bc44fbf-dc48-4cfc-809f-29bc7adcd151)  
2枚のシーンを用意した。いろいろ悩んで左の炎が目立つシーンをスクショとして提出したのだが、ΔSMを計算するとやはり左のほうが良さそうであることがわかる。  
これを応用すれば、将来的にゲームの”絵作り”にも使えそうな気がする。今まで感覚のみに頼っていたことが数値化できるのだ！これはデカい！  
(誰かUnityに組み込んでリアルタイムにゲーム画面のΔSMを計測できるようなアセット作ってくれないかな)  

---

## ライセンス / License
このプロジェクトコードはMITライセンスの下で公開されています / This project code is licensed under the MIT License.  

さくらみこの画像は著者に許可を得て使用しております / The image of Miko Sakura is used with permission of the author.

---
