# wensheng-yiling.com

**文勝 · 翊鈴 — 相愛相守 22 年**
2004.09.09 — 2026.09.09

一頁式、連續捲動的沉浸式紀念網站。沒有選單、沒有段落標題,整個網站只有一條捲動軸和兩個 UI 元件(左側 1px 進度線、右上角 ♪ SOUND)。

## 七幕(一條捲動軸)

| 幕 | 內容 | 檔案 |
|---|---|---|
| ① 序 | 巨型「22」、音樂盒(公仔漂浮、光暈、金座、飄雪、蠟封)、署名「給 吳文勝 與 劉翊鈴」 | `css/styles.css`、`js/app.js` |
| ② 門廊 | 相框玻璃碎成 144 片花瓣、「玻璃碎了,時間開始翻頁。」 | `js/threshold.js` |
| ③ 書 | 歐式古董書《我們的一年,又一年》:20 張婚紗照各佔一葉(正面照片、背面下一張的年份扉頁)= 20 葉 40 頁,前後再加封面葉(封面 / 序)與尾葉(跋 / 版權頁);拖曳、邊緣點擊、← →、觸控滑動、滾輪皆可翻 | `js/book.js` |
| ④ 房間 | 上傳的公仔照片本人:拆成「她 / 他」兩層照片浮雕(Three.js 位移 + 法線,顏色 100% 來自照片),呼吸、跟隨滑鼠、「♥ 牽手」、「♥ 親吻」;無 WebGL 時改用 CSS 版同樣可牽手親吻 | `js/scene3d.js`、`tools/split-figures.py` |
| ⑤ 心 | 3D 心定制:4 色 / 4 材質 / 3 光暈 / 10 字刻字;狀態存在網址 `#h=`;可下載 1080×1350 卡片 | `js/scene3d.js`、`js/app.js` |
| ⑥ 春 | 22 朵花一朵朵綻放,漂成「22」;「二十二年,二十二個春天。」 | `js/flowers.js` |
| ⑦ 回聲 | 「吳文勝 · 劉翊鈴 · 相愛相守22年」/「愛你們的孩子 敬上」,淡入白 | `js/app.js` |

## 放入真實素材

1. **公仔去背圖** → 覆蓋 `assets/couple-cutout.png`(PNG;有透明背景最好,沒有也會自動去白底),然後跑一次:

   ```bash
   pip install pillow numpy scipy
   python3 tools/split-figures.py assets/couple-cutout.png
   ```

   它會把兩個人拆成 `assets/figure-her.png` / `figure-him.png`(加上浮雕用的高度圖、法線圖)並更新 `js/figures.js`。
   打開 `tools/out/split-preview.png` 檢查紅線(縫)有沒有切對;不對的話用 `--guide "x,y x,y …"`(正規化座標)手動給縫的大概路徑,
   或用 `--top-x` / `--bottom-x` / `--corridor` 微調。首頁音樂盒直接用原圖,不需要處理。
2. **20 張婚紗照** → 覆蓋 `assets/wedding-01.jpg` … `assets/wedding-20.jpg`(建議 4:5 直式、長邊 1600px 以內、每張 < 400KB)。
   - 每頁下方的小字說明在 `js/content.js` 的 `photos[]` 裡改;`fit:'contain'` 可讓橫式照片完整顯示。
   - `wedding-01.jpg` 同時也是第②幕相框裡碎裂的那一張。

所有文案(署名、日期、書的序、間章、跋、花與回聲的兩行字)都集中在 `js/content.js`。

## 本機預覽

純靜態網站,不需要打包。因為使用 ES module 動態載入 Three.js,請用任何靜態伺服器開啟,不要直接雙擊 html:

```bash
python3 -m http.server 8080
# 開 http://localhost:8080
```

## 部署

任何靜態主機皆可(GitHub Pages / Cloudflare Pages / Netlify / Vercel),根目錄就是站台根目錄,無 build 步驟。
把網域 `wensheng-yiling.com` 指到主機即可。

## 技術

- HTML / CSS / 原生 JavaScript,零框架、零打包
- Three.js r170:`vendor/three.module.min.js` 為本地副本,失敗時依序改抓 jsDelivr、unpkg;全部失敗則改為靜態備援(公仔改用 CSS 底座、心改用 SVG),其他六幕完全不受影響
- 字體:Cormorant Garamond、Ma Shan Zheng、Noto Sans TC、Noto Serif TC(Google Fonts;字體逾時 2.5 秒仍會開場)
- 聲音:Web Audio 現場合成(音樂盒、翻頁、玻璃、弦樂),預設關閉,不載入任何音檔
- 降級:`prefers-reduced-motion` 略過自動時間軸;低幀率自動降低像素比、關閉陰影與霧
- 測試:`node tools/test/scene-test.mjs`(用真正的 Three.js 建場景)、`node tools/test/dom-test.js`(jsdom 跑整頁,需要 jsdom)

## 色彩

`#FAFAFA` 冷白為底、`#1A1A1A` 墨黑、`#C9202A` 唯一的紅、`#C9A227` 金只用在燙金與細線。
