# INSIDE IDENTITY — 動作模仿 MV

以 [INSIDE IDENTITY 翻唱 MV](https://www.youtube.com/watch?v=hNQdpqp_VdY) 的紅／黑／白視覺風格為參考，讓 4 位 T-pose 角色在瀏覽器中跳舞或模仿真人動作的網頁。

![modes](https://img.shields.io/badge/modes-自動舞蹈%20%7C%20鏡頭模仿%20%7C%20影片模仿-c8102e)

## 功能

- **自動舞蹈**：內建 16 小節編舞（彈跳、頭頂拍手、指天、中二病 pose、波浪手、踏步、跳躍、結尾 pose），含鏡像與輪唱錯拍。
- **鏡頭模仿**：MediaPipe Pose 即時捕捉網路攝影機的動作；多人入鏡時由左到右分別對應 4 位角色。
- **影片模仿**：載入任何舞蹈影片（例如手上的 MV 檔），角色模仿影片中的人，影片聲音即為配樂。
- **MV 運鏡**：全體／特寫／橫移自動切換，斜向黑色轉場、角色名牌、開頭標題卡、直排明朝體大字、撕裂筆刷邊框、網點與顆粒。
- 載入音樂 + BPM／TAP 對拍、LRC 字幕、錄影輸出 (WebM)、全螢幕。

## 執行

需要本機伺服器（WebGL 貼圖與攝影機都不能在 `file://` 下使用）：

```bash
python3 -m http.server 8765
```

然後開啟 <http://localhost:8765>。

快捷鍵：`Space` 播放／暫停 · `T` 對拍 · `R` 從頭 · `1`–`4` 特寫 · `G` 全體 · `W` 橫移 · `A` 自動運鏡 · `S` 骨架 · `H` 隱藏面板 · `F` 全螢幕

## 運作方式

每張 T-pose 圖會被切成「身體」與「手臂」兩層（手臂後方的頭髮／身體以垂直插值補齊），再做成網格並綁到 12 根骨骼（骨盆、胸、頭、上臂、前臂、大腿、小腿、尾巴），由 WebGL 做 2D 蒙皮變形。舞蹈與 MediaPipe 的關節點都會轉成同一種「骨骼世界角度」姿勢，所以兩種來源共用同一套角色。

```
src/*.jpg          原始 T-pose 圖
tools/cutout.py    去背（邊緣洪水填充 + 手動指定的封閉空隙）
tools/prep.py      切出手臂層、補背景、輸出 assets/ 與骨架座標 assets/rig.js
js/puppet.js       網格生成、權重、WebGL 蒙皮
js/dance.js        內建編舞
js/pose.js         MediaPipe 追蹤 → 姿勢
js/stage.js        MV 風格背景與前景特效
js/main.js         主迴圈、運鏡、介面
```

重新產生素材：

```bash
python3 tools/cutout.py && python3 tools/prep.py
```

要換角色：把新的 T-pose 圖放進 `src/`，在 `tools/prep.py` 的 `CHARS` 填入關節座標（肩、肘、腕、髖、膝、踝等），然後重跑上面的指令。

未附原曲音訊或歌詞，請自行載入擁有權利的音樂／影片。

## PV（每首歌一支）

`pv.html` 為鋒兄宇宙 9 首歌各做一支 PV：萌系標題卡（泡泡字＋搜尋列打字）、四人舞台、`.pet` 視窗特寫（會眨眼、跟著人聲開口）、撕裂四分格特寫、卡拉OK字幕與謝幕卡。開啟 <http://localhost:8765/pv.html>。

```bash
python3 tools/import-songs.py ../Effects   # 從 Effects 匯入歌曲、歌詞與節拍資料到 songs/
node tools/render-pv.mjs                    # 逐格輸出全部 MP4 到 pv/（可指定 1–9、--from/--to、--jobs）
```

角色已改為程式繪製（`js/cast.js`，參考 INSIDE IDENTITY MV 的四人制服造型）：ミカン、シズク、モモ、ルナ；`cast.html` 可看設定圖。
